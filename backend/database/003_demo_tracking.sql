-- Provenance only: demo records remain in the application's existing business tables.
CREATE TABLE demo_seed_runs (
  seed_key TEXT PRIMARY KEY,
  as_of TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE demo_seed_records (
  seed_key TEXT NOT NULL REFERENCES demo_seed_runs(seed_key) ON DELETE RESTRICT,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  logical_key TEXT NOT NULL,
  PRIMARY KEY (seed_key, table_name, logical_key),
  UNIQUE (table_name, record_id)
);
