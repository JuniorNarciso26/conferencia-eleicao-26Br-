CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, login TEXT NOT NULL, avatar_url TEXT,
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY, code_verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_tickets (
  ticket_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY, uf TEXT NOT NULL, municipio TEXT NOT NULL, zona TEXT NOT NULL,
  expected_sections INTEGER NOT NULL CHECK (expected_sections BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','claimed','submitted','published')),
  claimed_by INTEGER, lease_until INTEGER, published_contribution_id TEXT,
  created_by INTEGER NOT NULL, created_at INTEGER NOT NULL, UNIQUE(uf, municipio, zona)
);
CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY, zone_id TEXT NOT NULL REFERENCES zones(id),
  contributor_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading','pending_review','published','rejected')),
  created_at INTEGER NOT NULL, submitted_at INTEGER
);
CREATE TABLE IF NOT EXISTS section_results (
  contribution_id TEXT NOT NULL REFERENCES contributions(id),
  secao TEXT NOT NULL,
  turn1 TEXT NOT NULL, turn2 TEXT NOT NULL,
  bu1_sha256 TEXT NOT NULL, bu2_sha256 TEXT NOT NULL,
  PRIMARY KEY(contribution_id, secao)
);
CREATE INDEX IF NOT EXISTS idx_zones_status ON zones(status);
CREATE INDEX IF NOT EXISTS idx_contrib_zone ON contributions(zone_id, status);
CREATE INDEX IF NOT EXISTS idx_sections_contrib ON section_results(contribution_id);
