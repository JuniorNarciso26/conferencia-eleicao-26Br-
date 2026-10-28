"""Testa sem rede as restricoes reais da migration SQL do D1 (SQLite)."""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class ReservasSQLTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.execute("CREATE TABLE users(id INTEGER PRIMARY KEY,login TEXT NOT NULL)")
        self.db.executemany("INSERT INTO users VALUES (?,?)",[(42,"user-42"),(7,"user-7")])
        self.db.executescript((ROOT/"cloudflare/migrations/0002_zone_reservations_24h.sql").read_text(encoding="utf-8"))
        self.start=2000000000
        self.z1="SP-71072-0252"
        self.z2="SP-71072-0254"

    def claim(self, key, user, now):
        self.db.execute("DELETE FROM zone_reservations WHERE status='reserved' AND expires_at <= ?",(now,))
        uf,municipio,zona=key.split("-")
        return self.db.execute(
            "INSERT OR IGNORE INTO zone_reservations "+
            "(zone_key,uf,municipio,zona,user_id,contributor_login,status,reserved_at,expires_at) "+
            "VALUES (?,?,?,?,?,?,'reserved',?,?) RETURNING zone_key,expires_at",
            (key,uf,municipio,zona,user,"user-"+str(user),now,now+86400)
        ).fetchone()

    def test_lock_24h_and_no_renew(self):
        self.assertEqual(self.claim(self.z1,42,self.start),(self.z1,self.start+86400))
        self.assertIsNone(self.claim(self.z1,42,self.start+1))
        self.assertIsNone(self.claim(self.z1,7,self.start+1))
        self.assertIsNone(self.claim(self.z2,42,self.start+1))
        self.assertEqual(self.claim(self.z1,7,self.start+86400),(self.z1,self.start+172800))
        row=self.db.execute("SELECT user_id FROM zone_reservations WHERE zone_key=?",(self.z1,)).fetchone()
        self.assertEqual(row,(7,))

    def test_submit_before_deadline_survives_expiration(self):
        self.claim(self.z1,42,self.start)
        self.assertIsNone(self.db.execute(
            "UPDATE zone_reservations SET status='submitted',submitted_at=?,pr_number=? "+
            "WHERE zone_key=? AND user_id=? AND status='reserved' AND expires_at>? RETURNING zone_key",
            (self.start+86400,17,self.z1,42,self.start+86400)
        ).fetchone())
        row=self.db.execute(
            "UPDATE zone_reservations SET status='submitted',submitted_at=?,pr_number=? "+
            "WHERE zone_key=? AND user_id=? AND status='reserved' AND expires_at>? RETURNING zone_key",
            (self.start+86399,17,self.z1,42,self.start+86399)
        ).fetchone()
        self.assertEqual(row,(self.z1,))
        self.assertIsNone(self.claim(self.z1,7,self.start+86401))
        self.assertEqual(self.db.execute("SELECT status,pr_number FROM zone_reservations WHERE zone_key=?",(self.z1,)).fetchone(),("submitted",17))

    def test_owner_only_release(self):
        self.claim(self.z1,42,self.start)
        self.assertIsNone(self.db.execute(
            "DELETE FROM zone_reservations WHERE zone_key=? AND user_id=? AND status='reserved' AND expires_at>? RETURNING zone_key",
            (self.z1,7,self.start+1)).fetchone())
        self.assertEqual(self.db.execute(
            "DELETE FROM zone_reservations WHERE zone_key=? AND user_id=? AND status='reserved' AND expires_at>? RETURNING zone_key",
            (self.z1,42,self.start+1)).fetchone(),(self.z1,))

if __name__=="__main__":
    unittest.main()
