-- Contagens anônimas de votações concluídas por hora, em fluxo de revisão separado.
-- Aplicar uma vez após 0003 e 0004, na mesma base D1 dos resultados por seção.
CREATE TABLE IF NOT EXISTS zone_hourly_uploads (
  upload_id TEXT PRIMARY KEY,
  zone_key TEXT NOT NULL,
  results_upload_id TEXT NOT NULL REFERENCES zone_uploads(upload_id),
  contributor_id INTEGER NOT NULL REFERENCES users(id),
  contributor_login TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('uploading','pending_review','published','rejected')),
  expected_sections INTEGER NOT NULL CHECK(expected_sections BETWEEN 1 AND 2000),
  declared_csv_sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  submitted_at INTEGER,
  reviewed_at INTEGER,
  reviewer_id INTEGER REFERENCES users(id),
  reviewer_login TEXT,
  review_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hourly_live_zone
  ON zone_hourly_uploads(zone_key) WHERE state IN ('uploading','pending_review','published');
CREATE INDEX IF NOT EXISTS idx_hourly_review_queue
  ON zone_hourly_uploads(state,submitted_at);
CREATE TABLE IF NOT EXISTS zone_hourly_sections (
  upload_id TEXT NOT NULL REFERENCES zone_hourly_uploads(upload_id) ON DELETE CASCADE,
  secao TEXT NOT NULL CHECK(length(secao)=4),
  hours_json TEXT NOT NULL,
  PRIMARY KEY(upload_id,secao)
);
