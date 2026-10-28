"""Testes do modelo descritivo de crescimento entre turnos."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("crescimento",ROOT/"scripts/analisar_crescimento_turnos.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CrescimentoEntreTurnosTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pacote=json.loads((ROOT/"site/dados/zona_0253.json").read_text(encoding="utf-8"))

    def test_zona_real_0253(self):
        r=module.analisar_pacote(self.pacote)
        self.assertEqual(r["zona"],"SP-71072-0253")
        self.assertEqual(r["secoes_conferidas"],496)
        self.assertEqual(r["diferencas"]["lula"],10983)
        self.assertEqual(r["diferencas"]["flavio"],8270)
        self.assertEqual(r["reconciliacao"]["incremento_finalistas"],19253)
        self.assertEqual(r["reconciliacao"]["componentes_contabeis"],
            {"votos_outros_1t_menos_2t":15202,"comparecimento_liquido":3708,"reducao_brancos_nulos":343})
        self.assertEqual(r["reconciliacao"]["diferenca_reconciliacao"],0)
        self.assertAlmostEqual(r["participacoes"]["lula_no_incremento_liquido"],0.5704565522256272)
        self.assertAlmostEqual(r["participacoes"]["lula_entre_finalistas_1t"],0.38543641872739715)
        self.assertEqual(r["secoes_com_queda"]["lula"],0)
        self.assertEqual(r["secoes_com_queda"]["flavio"],3)

    def test_construcao_agregada_nao_exige_troca_direta(self):
        r=module.analisar_pacote(self.pacote)
        scenario=r["cenario_sem_migracao_direta_entre_finalistas"]
        self.assertTrue(scenario["viavel_nesta_construcao_agregada"])
        plano=scenario["exemplo_de_alocacao_liquida_hipotetica"]
        self.assertEqual(sum(plano["lula"].values()),10983)
        self.assertEqual(sum(plano["flavio"].values()),8270)
        for fonte,disponivel in r["reconciliacao"]["componentes_contabeis"].items():
            self.assertEqual(sum(plano[c].get(fonte,0) for c in ("lula","flavio")),disponivel)
        self.assertNotIn("aprovacao",scenario)

    def test_refuses_incomplete_or_corrupted_package(self):
        p=copy.deepcopy(self.pacote)
        p["meta"]["cobertura_completa"]=False
        with self.assertRaisesRegex(ValueError,"cobertura"):module.analisar_pacote(p)
        p=copy.deepcopy(self.pacote)
        p["secoes"][0]["turnos"]["2"]["lula"]+=1
        with self.assertRaisesRegex(ValueError,"comparecimento"):module.analisar_pacote(p)
        p=copy.deepcopy(self.pacote)
        p["secoes"][0]["meta"]["secao"]=p["secoes"][1]["meta"]["secao"]
        with self.assertRaisesRegex(ValueError,"duplicada"):module.analisar_pacote(p)
        p=copy.deepcopy(self.pacote)
        p["resumo"]["turnos"]["2"]["flavio"]+=1
        with self.assertRaisesRegex(ValueError,"comparecimento"):module.analisar_pacote(p)

    def test_makes_no_conclusion_from_negative_net_sources(self):
        p=copy.deepcopy(self.pacote)
        # Uma troca de votos válidos para branco aumenta brancos/nulos no 2T.
        # Modifica consistentemente a mesma secao e o resumo.
        p["secoes"][0]["turnos"]["2"]["lula"]-=100
        p["secoes"][0]["turnos"]["2"]["brancos"]+=100
        p["resumo"]["turnos"]["2"]["lula"]-=100
        p["resumo"]["turnos"]["2"]["brancos"]+=100
        # Os agregados continuam validos, mas a reducao BN fica negativa.
        p["secoes"][0]["turnos"]["2"]["lula"]+=100
        p["secoes"][0]["turnos"]["2"]["brancos"]-=100
        p["resumo"]["turnos"]["2"]["lula"]+=100
        p["resumo"]["turnos"]["2"]["brancos"]-=100
        self.assertTrue(module.analisar_pacote(p)["cenario_sem_migracao_direta_entre_finalistas"]["viavel_nesta_construcao_agregada"])

    def test_model_does_not_report_fraud_p_value_or_identify_individuals(self):
        r=module.analisar_pacote(self.pacote)
        serialized=json.dumps(r,ensure_ascii=False)
        self.assertNotIn('"fraude": true',serialized)
        self.assertNotIn('"p_valor"',serialized)
        self.assertIn("nao identificam",r["limite_inferencia"])


if __name__=="__main__":
    unittest.main()
