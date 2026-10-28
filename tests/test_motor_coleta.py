"""Testes offline do motor persistente de coleta."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]


def modulo(caminho, nome):
    spec = importlib.util.spec_from_file_location(nome, ROOT / caminho)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


CATALOGO = {
    "abr": [{"cd": "sp", "mu": [
        {"cd": "71072", "nm": "SAO PAULO", "zon": [
            {"cd": "253", "sec": [
                {"ns": "10"}, {"ns": "11"}, {"ns": "12", "nsp": "10"}
            ]},
            {"cd": "254", "sec": [{"ns": "1"}]}
        ]},
        {"cd": "99999", "nm": "OUTRO", "zon": [{"cd": "1", "sec": [{"ns": "1"}]}]}
    ]}]
}


class TesteMotor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.motor = modulo("scripts/motor_coleta.py", "motor_testes")

    def test_expande_zona_e_ignora_secao_agregada(self):
        alvo = self.motor.normalizar_alvo("SP", "71072", "253")
        fila = self.motor.filtrar_catalogo(CATALOGO, "zona", alvo)
        self.assertEqual([x["secao"] for x in fila], ["0010", "0011"])
        self.assertTrue(all(x["zona"] == "0253" for x in fila))

    def test_expande_municipio_e_uf(self):
        mun = self.motor.filtrar_catalogo(
            CATALOGO, "municipio", self.motor.normalizar_alvo("sp", "71072"))
        uf = self.motor.filtrar_catalogo(CATALOGO, "uf", self.motor.normalizar_alvo("sp"))
        self.assertEqual(len(mun), 3)
        self.assertEqual(len(uf), 4)

    def test_dry_run_cria_job_estado_e_fila_sem_rede(self):
        with tempfile.TemporaryDirectory() as pasta:
            base = Path(pasta)
            catalogo = base / "catalogo.json"
            catalogo.write_text(json.dumps(CATALOGO), encoding="utf-8")
            rc = self.motor.main(["start", "--escopo", "zona", "--uf", "sp",
                                  "--municipio", "71072", "--zona", "253",
                                  "--catalogo", str(catalogo), "--runtime", str(base / "runtime"),
                                  "--output", str(base / "out"), "--job", "teste", "--dry-run"])
            self.assertEqual(rc, 0)
            state = json.loads((base / "runtime/jobs/teste/state.json").read_text())
            fila = json.loads((base / "runtime/jobs/teste/queue.json").read_text())
            self.assertEqual(state["status"], "dry_run")
            self.assertEqual(state["total"], 2)
            self.assertEqual(len(fila), 2)
            self.assertFalse((base / "out").exists())

    def test_parada_segura_cria_sinal(self):
        with tempfile.TemporaryDirectory() as pasta:
            runtime = Path(pasta)
            job = runtime / "jobs/teste"
            job.mkdir(parents=True)
            (runtime / "current").write_text("teste\n", encoding="utf-8")
            rc = self.motor.main(["stop", "--runtime", str(runtime)])
            self.assertEqual(rc, 0)
            self.assertTrue((job / "stop.request").is_file())

    def test_secao_validada_e_idempotente(self):
        with tempfile.TemporaryDirectory() as pasta:
            base = Path(pasta)
            item = {"uf": "sp", "municipio": "71072", "zona": "0253", "secao": "0010"}
            destino = base / self.motor.chave_secao(item)
            destino.mkdir()
            (destino / "manifesto_tse.json").write_text("{}", encoding="utf-8")
            (destino / "secao.json").write_text("{}", encoding="utf-8")
            (destino / "validated.ok").write_text("ok", encoding="utf-8")
            status, detalhe = self.motor.processar_secao({}, item, base / "job", base, [])
            self.assertEqual(status, "ignored")
            self.assertIn("validada", detalhe["motivo"])

    def test_falha_de_validacao_nao_cria_marcador(self):
        with tempfile.TemporaryDirectory() as pasta:
            base = Path(pasta)
            item = {"uf": "sp", "municipio": "71072", "zona": "0253", "secao": "0010"}
            manifesto = {"candidatos": [], "turnos": []}
            with mock.patch.object(self.motor, "manifesto_secao", return_value=manifesto):
                with self.assertRaises(RuntimeError):
                    self.motor.processar_secao({}, item, base / "job", base, [])
            self.assertFalse((base / self.motor.chave_secao(item) / "validated.ok").exists())

    def test_cli_rejeita_parametros_incompletos(self):
        rc = self.motor.main(["start", "--escopo", "secao", "--uf", "sp", "--dry-run"])
        self.assertEqual(rc, 2)

    def test_lock_exclusivo(self):
        with tempfile.TemporaryDirectory() as pasta:
            lock = Path(pasta) / "x.lock"
            codigo = ("import fcntl,time; f=open(r'%s','a+'); "
                      "fcntl.flock(f,fcntl.LOCK_EX); print('ok',flush=True); time.sleep(3)" % lock)
            proc = subprocess.Popen([sys.executable, "-c", codigo], stdout=subprocess.PIPE, text=True)
            self.assertEqual(proc.stdout.readline().strip(), "ok")
            import fcntl
            with lock.open("a+") as f:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            proc.terminate(); proc.wait(timeout=3)
            proc.stdout.close()


if __name__ == "__main__":
    unittest.main()
