"""Conferencia historica dos responsaveis de zona: D1 SQLite."""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=ROOT/"cloudflare"/"migrations"

class HistoricoResponsaveis(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        for i in ("0001_schema.sql","0002_zone_reservations_24h.sql","0003_direct_upload.sql"):
            self.db.executescript((MIGRATIONS/i).read_text(encoding="utf-8"))
        self.db.execute("INSERT INTO users(id,login,created_at,last_seen) VALUES (42,'JuniorNarciso26',1,1)")
        self.db.execute("INSERT INTO users(id,login,created_at,last_seen) VALUES (7,'Reviewer7',1,1)")
        self.db.execute("INSERT INTO zone_uploads(upload_id,zone_key,uf,municipio,zona,municipio_nome,"
                        "contributor_id,contributor_login,state,expected_sections,meta_json,summary_json,"
                        "created_at,submitted_at,reviewer_id,reviewed_at) "
                        "VALUES ('a','SP-71072-0252','SP','71072','0252','São Paulo',"
                        "42,'JuniorNarciso26','published',339,'{}','{}',100,110,7,120)")
    def test_migration_backfills_historical_approvals(self):
        self.db.executescript((MIGRATIONS/"0004_review_author.sql").read_text(encoding="utf-8"))
        row=self.db.execute("SELECT contributor_login,reviewer_id,reviewer_login,submitted_at,reviewed_at "
                            "FROM zone_uploads WHERE upload_id='a'").fetchone()
        self.assertEqual(row,("JuniorNarciso26",7,"Reviewer7",110,120))
        # A identidade historica nao muda se um usuario alterar o nome no GitHub.
        self.db.execute("UPDATE users SET login='ReviewerChanged' WHERE id=7")
        self.assertEqual(self.db.execute(
            "SELECT reviewer_login FROM zone_uploads WHERE upload_id='a'").fetchone(),("Reviewer7",))
    def test_new_decision_stores_snapshot_at_time_of_review(self):
        self.db.executescript((MIGRATIONS/"0004_review_author.sql").read_text(encoding="utf-8"))
        self.db.execute("UPDATE zone_uploads SET state='pending_review',reviewer_id=NULL,reviewer_login=NULL,reviewed_at=NULL "
                        "WHERE upload_id='a'")
        review=self.db.execute(
            "UPDATE zone_uploads SET state=?,reviewer_id=?,reviewer_login=?,reviewed_at=?,review_reason=? "
            "WHERE upload_id=? AND state='pending_review' RETURNING upload_id",
            ("published",7,"Reviewer7",180,"","a")).fetchone()
        self.assertEqual(review,("a",))
        self.assertEqual(self.db.execute("SELECT reviewer_id,reviewer_login,reviewed_at FROM zone_uploads "
                                         "WHERE upload_id='a'").fetchone(),(7,"Reviewer7",180))

if __name__=="__main__":
    unittest.main()
