"""Testes offline do monitor HTTP local de acompanhamento."""
import json
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import monitor_coleta


class MonitorTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.runtime = Path(self.temp.name) / "motor"
        self.job = "coleta-20261028T184120Z-a3fc8c"
        self.folder = self.runtime / "jobs" / self.job
        self.folder.mkdir(parents=True)
        (self.runtime / "current").write_text(self.job, encoding="utf-8")
        (self.folder / "config.json").write_text(json.dumps({
            "job_id": self.job, "escopo": "zona",
            "alvo": {"uf": "sp", "municipio": "71072", "zona": "0252"},
            "output_root": "/private/path/do-not-share",
            "token": "SECRET"
        }), encoding="utf-8")
        self.write_state(status="running", total=339, concluidas=2, ignoradas=0,
                         pendentes=337, falhas=0, atual="sp-71072-0252-0003")
        handler = monitor_coleta.handler_para(self.runtime, self.job)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.addCleanup(self.server.server_close)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.shutdown)
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def write_state(self, **fields):
        state = {**fields, "atualizado_utc": "2026-10-28T18:41:27Z",
                 "log": "/private/secret.log", "ultimo_erro": "sensitive"}
        (self.folder / "state.json").write_text(json.dumps(state), encoding="utf-8")

    def test_status_retorna_resumo_sem_dados_sensiveis(self):
        with urlopen(self.url + "/api/status", timeout=3) as response:
            result = json.load(response)
        self.assertEqual(result["total"], 339)
        self.assertEqual(result["processadas"], 2)
        self.assertEqual(result["concluidas"], 2)
        self.assertEqual(result["pendentes"], 337)
        self.assertEqual(result["percentual"], round(200 / 339, 2))
        self.assertEqual(result["zona"], "0252")
        self.assertEqual(result["atual"], "sp-71072-0252-0003")
        for field in ("token", "log", "output_root", "ultimo_erro", "resultados"):
            self.assertNotIn(field, result)

    def test_estado_atualiza_automaticamente_sem_reiniciar(self):
        self.write_state(status="completed", total=339, concluidas=338,
                         ignoradas=1, falhas=0, pendentes=0, atual=None)
        with urlopen(self.url + "/api/status", timeout=3) as response:
            result = json.load(response)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["processadas"], 339)
        self.assertEqual(result["percentual"], 100)
        self.assertEqual(result["pendentes"], 0)

    def test_falhas_nao_sao_contadas_como_processadas(self):
        self.write_state(status="failed", total=339, concluidas=10,
                         ignoradas=3, falhas=3, pendentes=326,
                         atual="unsafe")
        with urlopen(self.url + "/api/status", timeout=3) as response:
            result = json.load(response)
        self.assertEqual(result["processadas"], 13)
        self.assertEqual(result["falhas"], 3)
        self.assertEqual(result["pendentes"], 326)
        self.assertEqual(result["atual"], "")

    def test_somente_rotas_permitidas_e_host_local(self):
        for path in ("/", "/style.css", "/app.js"):
            with urlopen(self.url + path, timeout=3) as response:
                self.assertEqual(response.status, 200)
        with self.assertRaises(HTTPError) as ctx:
            urlopen(self.url + "/../.git/config", timeout=3)
        self.assertEqual(ctx.exception.code, 404)
        req = Request(self.url + "/api/status", headers={"Host": "evil.example"})
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req, timeout=3)
        self.assertEqual(ctx.exception.code, 403)

    def test_parser_cli_e_identificador(self):
        import motor_coleta
        args = motor_coleta.parser().parse_args(["painel", "--porta", "8765"])
        self.assertEqual(args.comando, "painel")
        self.assertEqual(args.porta, 8765)
        self.assertEqual(monitor_coleta.obter_job(self.runtime), self.job)
        with self.assertRaises(ValueError):
            monitor_coleta.obter_job(self.runtime, "../private")
        with self.assertRaises(ValueError):
            monitor_coleta.servir(self.runtime, self.job, 0)


if __name__ == "__main__":
    unittest.main()
