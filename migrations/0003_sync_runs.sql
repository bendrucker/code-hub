-- One row per extraction attempt, written before the work starts so a run that
-- dies mid-flight is still visible as one that never finished.
CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- pr-authored, pr-reviewed, issue, contributions. No CHECK constraint, so a
  -- kind added later lands in the table rather than failing at ingest.
  kind TEXT NOT NULL,
  -- A search window string for the search kinds, a year for contributions.
  window TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  pages INTEGER NOT NULL DEFAULT 0,
  rows_changed INTEGER NOT NULL DEFAULT 0,
  truncated INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE INDEX sync_runs_kind_started_at ON sync_runs (kind, started_at);

-- The admin route reports recent failures across every kind, which reads as a
-- scan the size of the failures rather than of the run log.
CREATE INDEX sync_runs_failures ON sync_runs (started_at) WHERE error IS NOT NULL;
