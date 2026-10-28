import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("gerar_painel_zona", Path(__file__).parents[1] / "scripts" / "gerar_painel_zona.py")
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


def dados(secao="0001"):
    turno = {campo: 0 for campo in MOD.CAMPOS_SOMA}
    turno.update({"aptos": 10, "comparecimento": 8, "comparecimento_bu": 8,
                  "habilitados_biometria": 6, "habilitados_biografia": 1,
                  "comp_sem_biometria": 1, "flavio": 4, "lula": 3, "brancos": 1})
    turno["numero_interno_urna"] = "1"
    turno["modelo_urna"] = ""
    return {"meta": {"uf": "SP", "municipio": "Sao Paulo", "codigo_municipio": "71072",
                     "zona": "0253", "secao": secao},
            "turnos": {"1": dict(turno), "2": dict(turno)}}


class PainelZonaTest(unittest.TestCase):
    def criar(self, raiz, secao="0001", alterar=None):
        pasta = raiz / f"sp-71072-0253-{secao}"
        pasta.mkdir(parents=True)
        objeto = dados(secao)
        if alterar:
            alterar(objeto)
        (pasta / "secao.json").write_text(json.dumps(objeto), encoding="utf-8")
        (pasta / "validated.ok").write_text("ok\n", encoding="utf-8")

    def test_gera_resumo_e_lista(self):
        with tempfile.TemporaryDirectory() as temp:
            raiz, saida = Path(temp) / "coletas", Path(temp) / "zona.json"
            self.criar(raiz, "0002")
            self.criar(raiz, "0001")
            pacote = MOD.gerar(raiz, saida, "SP", "71072", "0253", 2)
            self.assertEqual([x["meta"]["secao"] for x in pacote["secoes"]], ["0001", "0002"])
            self.assertEqual(pacote["resumo"]["turnos"]["1"]["comparecimento"], 16)
            self.assertTrue(pacote["meta"]["cobertura_completa"])
            self.assertEqual(json.loads(saida.read_text())["meta"]["total_secoes"], 2)

    def test_recusa_cobertura_incompleta(self):
        with tempfile.TemporaryDirectory() as temp:
            raiz = Path(temp) / "coletas"
            self.criar(raiz)
            with self.assertRaisesRegex(ValueError, "Cobertura incompleta"):
                MOD.gerar(raiz, Path(temp) / "zona.json", "SP", "71072", "0253", 2)

    def test_recusa_soma_invalida(self):
        with tempfile.TemporaryDirectory() as temp:
            raiz = Path(temp) / "coletas"
            self.criar(raiz, alterar=lambda x: x["turnos"]["1"].update(comparecimento=9))
            with self.assertRaisesRegex(ValueError, "soma dos votos"):
                MOD.gerar(raiz, Path(temp) / "zona.json", "SP", "71072", "0253", 1)


if __name__ == "__main__":
    unittest.main()
