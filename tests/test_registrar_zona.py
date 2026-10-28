"""Testa insercao atomica da zona no catalogo local, sem publicar dados."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("registrar_zona",ROOT/"scripts/registrar_zona.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class RegistrarZonaTest(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root=Path(temp.name)
        self.path=self.root/"sp_71072_0252.json"
        self.catalog=self.root/"catalogo.json"
        self.localities=self.root/"localidades_2026.json"
        self.localities.write_text(json.dumps({"ufs":{"SP":[{"codigo":"71072","nome":"São Paulo","zonas":["0252"]}]}}))
        self.catalog.write_text(json.dumps({"versao":1,"atualizado_em":"2026-10-28T00:00:00Z",
            "zonas":[{"uf":"SP","municipio_codigo":"71072","municipio_nome":"São Paulo",
                      "zona":"0253","arquivo":"dados/zona_0253.json"}]}))
        self.package={
            "meta":{"uf":"SP","municipio":"71072","zona":"0252","total_secoes":2,"cobertura_completa":True},
            "secoes":[{"meta":{"uf":"SP","codigo_municipio":"71072","zona":"0252","secao":s},
                       "turnos":{"1":{},"2":{}}} for s in ("0001","0002")]}
        self.save()
        p=patch.object(mod,"DATA",self.root);p.start();self.addCleanup(p.stop)
        p=patch.object(mod,"LOCALITIES",self.localities);p.start();self.addCleanup(p.stop)
    def save(self):
        self.path.write_text(json.dumps(self.package,ensure_ascii=False),encoding="utf-8")
    def test_register_and_idempotent(self):
        entry,total,created=mod.registrar(self.path,self.catalog)
        self.assertTrue(created);self.assertEqual(total,2)
        self.assertEqual(entry["arquivo"],"dados/sp_71072_0252.json")
        cat=json.loads(self.catalog.read_text(encoding="utf-8"))
        self.assertEqual(len(cat["zonas"]),2)
        self.assertEqual(cat["zonas"][-1]["municipio_nome"],"São Paulo")
        before=self.catalog.read_bytes()
        self.assertFalse(mod.registrar(self.path,self.catalog)[2])
        self.assertEqual(self.catalog.read_bytes(),before)
    def test_refuse_mismatched_or_incomplete(self):
        self.package["meta"]["cobertura_completa"]=False
        self.save()
        with self.assertRaisesRegex(ValueError,"cobertura"):mod.registrar(self.path,self.catalog)
        self.package["meta"]["cobertura_completa"]=True
        self.package["secoes"][1]["meta"]["secao"]="0001"
        self.save()
        with self.assertRaisesRegex(ValueError,"duplicada"):mod.registrar(self.path,self.catalog)
    def test_refuse_conflicting_existing_zone(self):
        doc=json.loads(self.catalog.read_text())
        doc["zonas"].append({"uf":"SP","municipio_codigo":"71072","municipio_nome":"São Paulo",
          "zona":"0252","arquivo":"dados/outro.json"})
        self.catalog.write_text(json.dumps(doc))
        with self.assertRaisesRegex(ValueError,"outro pacote"):mod.registrar(self.path,self.catalog)
    def test_refuse_wrong_zone_file_or_missing_turn(self):
        self.package["secoes"][0]["turnos"].pop("2")
        self.save()
        with self.assertRaisesRegex(ValueError,"dois turnos"):mod.registrar(self.path,self.catalog)
    def test_reject_outside_folder(self):
        outside=self.root/"other";outside.mkdir()
        with self.assertRaisesRegex(ValueError,"diretamente em site/dados"):
            mod.registrar(outside/"sp_71072_0252.json",self.catalog)

if __name__=="__main__":unittest.main()
