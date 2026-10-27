"""Testes simples, sem TSE e sem parser externo."""
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def modulo(caminho, nome):
    spec = importlib.util.spec_from_file_location(nome, ROOT / caminho)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class TesteMVP(unittest.TestCase):
    def test_ultimo_bu_totalizado(self):
        m = modulo("scripts/baixar_secao.py", "baixar")
        aux = {"hashes": [
            {"st": "Recebido", "dr": "26/10/2026", "arq": [{"tp": "bu"}]},
            {"st": "Totalizado", "dr": "04/10/2026", "hr": "15:00:00", "hash": "A", "arq": [{"tp": "bu"}]},
            {"st": "Totalizado", "dr": "04/10/2026", "hr": "17:00:00", "hash": "B", "arq": [{"tp": "bu"}]}]}
        self.assertEqual(m.conjunto_totalizado(aux)["hash"], "B")

    def test_nao_aceita_bu_sem_totalizacao(self):
        m = modulo("scripts/baixar_secao.py", "baixar")
        self.assertIsNone(m.conjunto_totalizado(
            {"hashes": [{"st": "Recebido", "arq": [{"tp": "bu"}]}]}))

    def test_votos_nominais_e_nulos_tecnicos(self):
        m = modulo("scripts/gerar_json.py", "converter")
        votos = [{"tipo_voto": "nominal", "numero": 13, "votos": 90},
                 {"tipo_voto": "nominal", "numero": 22, "votos": 100},
                 {"tipo_voto": "nominal", "numero": 70, "votos": 5},
                 {"tipo_voto": "nominal", "numero": 28, "votos": 2},
                 {"tipo_voto": "branco", "numero": None, "votos": 3},
                 {"tipo_voto": "nulo", "numero": None, "votos": 4}]
        r = m.classificar_votos(votos, {13, 22, 70})
        self.assertEqual(r, {"flavio": 100, "lula": 90, "outros": 5,
                             "brancos": 3, "nulos": 4, "nulos_tecnicos": 2})
        self.assertEqual(sum(r.values()), 204)


if __name__ == "__main__":
    unittest.main()
