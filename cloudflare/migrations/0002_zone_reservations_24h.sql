CREATE TABLE IF NOT EXISTS zone_reservations (
 zone_key TEXT PRIMARY KEY, uf TEXT NOT NULL, municipio TEXT NOT NULL, zona TEXT NOT NULL,
 user_id INTEGER NOT NULL REFERENCES users(id), contributor_login TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','submitted')),
 reserved_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 pr_number INTEGER, submitted_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_zone_reservations_active_user ON zone_reservations(user_id) WHERE status='reserved';
CREATE INDEX IF NOT EXISTS idx_zone_reservations_expiration ON zone_reservations(status,expires_at);
