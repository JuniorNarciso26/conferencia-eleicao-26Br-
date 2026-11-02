import hashlib
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("exportar_horarios", Path(__file__).resolve().parents[1] / "scripts" / "exportar_horarios.py")
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class ExportarHorariosTest(unittest.TestCase):
    def test_log_anterior_e_conferencia_com_bu(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1]) as temporario:
            raiz = Path(temporario)
            pasta = raiz / "sp-71072-0252-0001"
            pasta.mkdir()
            (pasta / "validated.ok").write_text("ok", encoding="utf-8")
            (pasta / "secao.json").write_text(json.dumps({
                "meta": {"uf": "SP", "codigo_municipio": "71072", "zona": "0252", "secao": "0001"},
                "turnos": {"1": {"comparecimento": 2}, "2": {"comparecimento": 1}},
            }), encoding="utf-8")
            manifestos = []
            for numero, turno, data in [(1, "1T", "04/10/2026"), (2, "2T", "25/10/2026")]:
                destino = pasta / "raw" / turno
                destino.mkdir(parents=True)
                log = destino / f"urna-{turno}-log.jez"
                def evento(hora):
                    return f"{data} {hora}:01\tINFO\tURN\tSCUE\tO voto do eleitor foi computado\tHASH\n".encode("latin-1")
                with zipfile.ZipFile(log, "w") as pacote:
                    pacote.writestr("logd.dat", evento("09:00"))
                    if numero == 1:
                        anterior = destino / "anterior.jez"
                        with zipfile.ZipFile(anterior, "w") as interno:
                            interno.writestr("logd.dat", evento("08:00"))
                        pacote.write(anterior, "anterior.jez")
                manifestos.append({"turno": numero, "status": "ok", "arquivos": [{
                    "tipo": "log", "arquivo": str(log), "sha256": hashlib.sha256(log.read_bytes()).hexdigest(),
                }]})
            (pasta / "manifesto_tse.json").write_text(json.dumps({"turnos": manifestos}), encoding="utf-8")
            saida = raiz / "horarios.csv"
            quantidade, totais = MOD.exportar(raiz, "SP", "71072", "0252", saida, esperado=1)
            self.assertEqual((quantidade, totais), (1, {"1T": 2, "2T": 1}))
            self.assertIn("1T;0001;08;1", saida.read_text(encoding="utf-8-sig"))
            (pasta / "secao.json").write_text(json.dumps({
                "meta": {"uf": "SP", "codigo_municipio": "71072", "zona": "0252", "secao": "0001"},
                "turnos": {"1": {"comparecimento": 3}, "2": {"comparecimento": 1}},
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "log=2, BU=3"):
                MOD.exportar(raiz, "SP", "71072", "0252", saida, esperado=1)


if __name__ == "__main__":
    unittest.main()
