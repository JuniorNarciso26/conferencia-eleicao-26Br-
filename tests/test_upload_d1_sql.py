"""Schema D1: upload em partes, totais e revisao, sem alterar coleta antiga."""
import json
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
class SqlUploadTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        for filename in ("0001_schema.sql","0002_zone_reservations_24h.sql","0003_direct_upload.sql"):
            self.db.executescript((ROOT/"cloudflare"/"migrations"/filename).read_text(encoding="utf-8"))
        self.db.execute("INSERT INTO users(id,login,created_at,last_seen) VALUES (42,'contributor',1,1)")
        self.db.execute("INSERT INTO users(id,login,created_at,last_seen) VALUES (7,'reviewer',1,1)")
        self.db.execute("INSERT INTO zone_reservations(zone_key,uf,municipio,zona,user_id,contributor_login,status,reserved_at,expires_at) "
                        "VALUES ('SP-71072-0252','SP','71072','0252',42,'contributor','reserved',100,86500)")
        self.db.execute("INSERT INTO zone_uploads(upload_id,zone_key,uf,municipio,zona,municipio_nome,contributor_id,"
                        "contributor_login,state,expected_sections,meta_json,summary_json,created_at) "
                        "VALUES ('upload-1','SP-71072-0252','SP','71072','0252','São Paulo',42,'contributor',"
                        "'uploading',2,'{}','{}',150)")
    def test_rows_and_aggregate(self):
        section={"turnos":{
          "1":{"aptos":200,"comparecimento":100,"flavio":50,"lula":45,"outros":0,"brancos":2,"nulos":3,"nulos_tecnicos":0},
          "2":{"aptos":200,"comparecimento":110,"flavio":60,"lula":40,"outros":0,"brancos":4,"nulos":6,"nulos_tecnicos":0}}}
        for secao in ("0001","0002"):
            self.db.execute("INSERT INTO zone_upload_sections(upload_id,secao,section_json) VALUES (?,?,?)",
                            ("upload-1",secao,json.dumps(section)))
        row=self.db.execute(
          """SELECT COUNT(*) qty,
          SUM(CAST(json_extract(section_json,'$.turnos."1".comparecimento') AS INTEGER)) t1,
          SUM(CAST(json_extract(section_json,'$.turnos."2".comparecimento') AS INTEGER)) t2
          FROM zone_upload_sections WHERE upload_id=?""",("upload-1",)).fetchone()
        self.assertEqual(row,(2,200,220))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO zone_upload_sections(upload_id,secao,section_json) VALUES ('upload-1','0001','{}')")
    def test_review_and_release(self):
        self.db.execute("UPDATE zone_uploads SET state='pending_review',submitted_at=200 WHERE upload_id='upload-1'")
        self.db.execute("UPDATE zone_reservations SET status='submitted' WHERE zone_key='SP-71072-0252'")
        self.db.execute("UPDATE zone_uploads SET state='rejected',reviewer_id=7,reviewed_at=300 WHERE upload_id='upload-1'")
        self.db.execute("DELETE FROM zone_reservations WHERE zone_key='SP-71072-0252' AND status='submitted'")
        self.assertIsNone(self.db.execute("SELECT zone_key FROM zone_reservations").fetchone())
        self.assertEqual(self.db.execute("SELECT state FROM zone_uploads").fetchone(),("rejected",))
        self.db.execute("INSERT INTO zone_reservations(zone_key,uf,municipio,zona,user_id,contributor_login,status,reserved_at,expires_at) "
                        "VALUES ('SP-71072-0252','SP','71072','0252',42,'contributor','reserved',301,86701)")
    def test_unique_pending_and_published(self):
        self.db.execute("UPDATE zone_uploads SET state='pending_review' WHERE upload_id='upload-1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO zone_uploads(upload_id,zone_key,uf,municipio,zona,municipio_nome,contributor_id,"
                            "contributor_login,state,expected_sections,meta_json,summary_json,created_at) "
                            "VALUES ('upload-2','SP-71072-0252','SP','71072','0252','São Paulo',42,'contributor',"
                            "'uploading',2,'{}','{}',151)")
if __name__=="__main__":unittest.main()
