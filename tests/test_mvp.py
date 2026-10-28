"""Testes offline: seleção, limites, hashes, atomicidade e identidade."""
import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]


def modulo(caminho, nome):
    spec = importlib.util.spec_from_file_location(nome, ROOT / caminho)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class Resposta:
    def __init__(self, bruto, headers=None):
        self.stream = io.BytesIO(bruto)
        self.headers = headers or {}

    def read(self, tamanho=-1):
        return self.stream.read(tamanho)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class TesteMVP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baixar = modulo("scripts/baixar_secao.py", "baixar_testes")
        cls.gerar = modulo("scripts/gerar_json.py", "gerar_testes")

    def test_ultimo_bu_totalizado(self):
        aux = {"hashes": [
            {"st": "Recebido", "dr": "26/10/2026", "arq": [{"tp": "bu"}]},
            {"st": "Totalizado", "dr": "04/10/2026", "hr": "15:00:00", "hash": "A", "arq": [{"tp": "bu"}]},
            {"st": "Totalizado", "dr": "04/10/2026", "hr": "17:00:00", "hash": "B", "arq": [{"tp": "bu"}]}]}
        self.assertEqual(self.baixar.conjunto_totalizado(aux)["hash"], "B")

    def test_nao_aceita_bu_sem_totalizacao(self):
        self.assertIsNone(self.baixar.conjunto_totalizado(
            {"hashes": [{"st": "Recebido", "arq": [{"tp": "bu"}]}]}))

    def test_segmentos_e_hash_do_aux(self):
        digest = "a" * 64
        self.assertEqual(self.baixar.validar_item_aux({"tp": "bu", "nm": "arquivo.bu", "hash": digest}),
                         ("bu", "arquivo.bu", digest))
        for nome in ("../x", ".oculto", "a/b", ""):
            with self.subTest(nome=nome), self.assertRaises(ValueError):
                self.baixar.validar_item_aux({"tp": "bu", "nm": nome})
        with self.assertRaises(ValueError):
            self.baixar.validar_item_aux({"tp": "bu", "nm": "x.bu", "hash": "não-é-hash"})

    def test_streaming_limite_e_limpeza_temporario(self):
        with tempfile.TemporaryDirectory() as pasta:
            destino = Path(pasta) / "arquivo.bin"
            with self.assertRaises(self.baixar.LimiteExcedido):
                self.baixar.baixar_atomico("https://exemplo.invalid/x", destino, 5,
                                           opener=lambda *a, **k: Resposta(b"123456"))
            self.assertFalse(destino.exists())
            self.assertEqual(list(Path(pasta).glob("*.parcial")), [])

    def test_hash_aux_divergente_nao_publica(self):
        with tempfile.TemporaryDirectory() as pasta:
            destino = Path(pasta) / "arquivo.bin"
            with self.assertRaises(ValueError):
                self.baixar.baixar_atomico("https://exemplo.invalid/x", destino, 100, "0" * 64,
                                           opener=lambda *a, **k: Resposta(b"conteudo"))
            self.assertFalse(destino.exists())

    def test_download_atomico_calcula_hashes(self):
        bruto = b"abc" * 100
        with tempfile.TemporaryDirectory() as pasta:
            destino = Path(pasta) / "arquivo.bin"
            meta = self.baixar.baixar_atomico("https://exemplo.invalid/x", destino, 1000,
                                               opener=lambda *a, **k: Resposta(bruto, {"Content-Length": str(len(bruto))}))
            self.assertEqual(destino.read_bytes(), bruto)
            self.assertEqual(meta["sha256"], hashlib.sha256(bruto).hexdigest())
            self.assertEqual(meta["sha512"], hashlib.sha512(bruto).hexdigest())

    def test_retry_after_valido_e_limitado(self):
        agora = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.assertEqual(self.baixar.retry_after_segundos("17", agora), 17)
        self.assertIsNone(self.baixar.retry_after_segundos("9999", agora))
        self.assertEqual(self.baixar.retry_after_segundos("Thu, 01 Jan 2026 00:01:00 GMT", agora), 60)
        self.assertIsNone(self.baixar.retry_after_segundos("inválido", agora))

    def test_retry_respeita_retry_after(self):
        bruto = b"ok"
        chamadas = [HTTPError("https://x", 429, "limite", {"Retry-After": "7"}, None), Resposta(bruto)]
        esperas = []

        def opener(*args, **kwargs):
            resposta = chamadas.pop(0)
            if isinstance(resposta, Exception):
                raise resposta
            return resposta

        with tempfile.TemporaryDirectory() as pasta:
            self.baixar.baixar_atomico("https://exemplo.invalid/x", Path(pasta) / "x", 10,
                                       opener=opener, sleeper=esperas.append)
        self.assertEqual(esperas, [7])

    def test_json_atomico_preserva_destino_em_falha(self):
        with tempfile.TemporaryDirectory() as pasta:
            destino = Path(pasta) / "manifesto.json"
            destino.write_text("anterior", encoding="utf-8")
            with mock.patch.object(self.baixar.os, "replace", side_effect=OSError("falha")):
                with self.assertRaises(OSError):
                    self.baixar.gravar_json_atomico(destino, {"novo": True})
            self.assertEqual(destino.read_text(encoding="utf-8"), "anterior")
            self.assertEqual(list(Path(pasta).glob("*.parcial")), [])

    def test_identidade_compativel_quando_ausente(self):
        esperado = {"uf": "SP", "municipio_tse": "71072", "zona": "0253", "secao": "0010",
                    "turno": 1, "eleicao": 6257, "pleito": 3220}
        self.assertEqual(self.gerar.validar_identidade_parser({}, esperado, 1), {})
        sec = {"uf_bu": "sp", "municipio_bu": 71072, "zona_bu": 253, "secao_bu": 10,
               "turno": 1, "codigo_eleicao": "6257", "codigo_pleito": 3220}
        verificados = self.gerar.validar_identidade_parser(sec, esperado, 1)
        self.assertEqual(verificados["secao"], "0010")

    def test_identidade_fail_closed_em_divergencia_ou_ambiguidade(self):
        esperado = {"uf": "SP", "municipio_tse": "71072", "zona": "0253", "secao": "0010",
                    "turno": 2, "eleicao": 6258, "pleito": 3221}
        with self.assertRaises(ValueError):
            self.gerar.validar_identidade_parser({"uf": "RJ"}, esperado, 2)
        with self.assertRaises(ValueError):
            self.gerar.validar_identidade_parser({"zona": 253, "numero_zona": 254}, esperado, 2)

    def test_documento_candidatos_exige_hash(self):
        bruto = b'{"cand": []}'
        with tempfile.TemporaryDirectory() as pasta:
            caminho = Path(pasta) / "candidatos.json"
            caminho.write_bytes(bruto)
            item = {"sha256": "0" * 64, "sha512": hashlib.sha512(bruto).hexdigest(), "bytes": len(bruto)}
            with self.assertRaises(ValueError):
                self.gerar.verificar_hash(caminho, item)

    def test_votos_nominais_e_nulos_tecnicos(self):
        votos = [{"tipo_voto": "nominal", "numero": 13, "votos": 90},
                 {"tipo_voto": "nominal", "numero": 22, "votos": 100},
                 {"tipo_voto": "nominal", "numero": 70, "votos": 5},
                 {"tipo_voto": "nominal", "numero": 28, "votos": 2},
                 {"tipo_voto": "branco", "numero": None, "votos": 3},
                 {"tipo_voto": "nulo", "numero": None, "votos": 4}]
        r = self.gerar.classificar_votos(votos, {13, 22, 70})
        self.assertEqual(r, {"flavio": 100, "lula": 90, "outros": 5,
                             "brancos": 3, "nulos": 4, "nulos_tecnicos": 2})
        self.assertEqual(sum(r.values()), 204)


if __name__ == "__main__":
    unittest.main()
