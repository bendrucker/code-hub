-- The contributions cross-check compares GitHub's own yearly totals against the
-- event tables. A gap there is a finding rather than a failure: `error` drives
-- the failures index and the admin route's failure list, and a run whose pages
-- all landed has not failed.
ALTER TABLE sync_runs ADD COLUMN note TEXT;
