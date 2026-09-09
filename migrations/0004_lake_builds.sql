-- One row per lake build, written before any table is read so a build that dies
-- mid-flight is still visible as one that never finished.
CREATE TABLE lake_builds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  -- Per-table row counts as a JSON object keyed by table name. A column per
  -- table would need a migration whenever the lake gains one.
  row_counts TEXT,
  error TEXT
);

CREATE INDEX lake_builds_started_at ON lake_builds (started_at);
