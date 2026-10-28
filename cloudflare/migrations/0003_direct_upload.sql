-- Uploads de pacotes consolidados, recebidos em partes e revisados antes da publicacao.
-- Nao substitui as tabelas de OAuth, reservas ou dados legados.
CREATE TABLE IF NOT EXISTS zone_uploads (
  upload_id TEXT PRIMARY KEY,
  zone_key TEXT NOT NULL,
  uf TEXT NOT NULL, municipio TEXT NOT NULL, zona TEXT NOT NULL,
  municipio_nome TEXT NOT NULL,
  contributor_id INTEGER NOT NULL REFERENCES users(id),
  contributor_login TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('uploading','pending_review','published','rejected')),
  expected_sections INTEGER NOT NULL CHECK(expected_sections BETWEEN 1 AND 2000),
  meta_json TEXT NOT NULL, summary_json TEXT NOT NULL,
  declared_file_sha256 TEXT,
  created_at INTEGER NOT NULL, submitted_at INTEGER, reviewed_at INTEGER,
  reviewer_id INTEGER, review_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_uploads_live_zone
  ON zone_uploads(zone_key) WHERE state IN ('uploading','pending_review','published');
CREATE INDEX IF NOT EXISTS idx_uploads_queue
  ON zone_uploads(state,submitted_at);
CREATE TABLE IF NOT EXISTS zone_upload_sections (
  upload_id TEXT NOT NULL REFERENCES zone_uploads(upload_id) ON DELETE CASCADE,
  secao TEXT NOT NULL, section_json TEXT NOT NULL,
  PRIMARY KEY(upload_id,secao)
);
CREATE INDEX IF NOT EXISTS idx_upload_sections_upload ON zone_upload_sections(upload_id);
