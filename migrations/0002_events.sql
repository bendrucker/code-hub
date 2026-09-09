-- Node IDs are the primary keys throughout: they survive a repository or owner
-- rename, which `owner/name#number` does not.
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  stargazer_count INTEGER NOT NULL,
  primary_language TEXT,
  primary_language_color TEXT,
  created_at TEXT NOT NULL,
  is_fork INTEGER NOT NULL,
  -- GitHub's RepositoryVisibility as it spells it: PUBLIC, PRIVATE, INTERNAL.
  -- No CHECK constraint, because a value GitHub adds later should land in the
  -- table rather than fail at ingest.
  visibility TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE pull_requests (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories (id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  merged_at TEXT,
  closed_at TEXT,
  state TEXT NOT NULL,
  additions INTEGER NOT NULL,
  deletions INTEGER NOT NULL,
  changed_files INTEGER NOT NULL,
  comment_count INTEGER NOT NULL,
  review_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories (id),
  pull_request_number INTEGER NOT NULL,
  pull_request_author TEXT NOT NULL,
  state TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  published_at TEXT
);

CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories (id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed_at TEXT,
  state TEXT NOT NULL,
  comment_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

-- Commits arrive as per-repository daily counts, which is the finest grain
-- contributionsCollection exposes without a query per repository per branch.
CREATE TABLE commit_days (
  repository_id TEXT NOT NULL REFERENCES repositories (id),
  day TEXT NOT NULL,
  commit_count INTEGER NOT NULL,
  PRIMARY KEY (repository_id, day)
);

CREATE INDEX pull_requests_created_at ON pull_requests (created_at);
CREATE INDEX pull_requests_repository_id ON pull_requests (repository_id);
CREATE INDEX reviews_submitted_at ON reviews (submitted_at);
CREATE INDEX reviews_repository_id ON reviews (repository_id);
CREATE INDEX issues_created_at ON issues (created_at);
CREATE INDEX issues_repository_id ON issues (repository_id);
CREATE INDEX commit_days_day ON commit_days (day);

-- The publish queue is every row whose marker an upsert cleared. Partial
-- indexes so the scan costs the size of the backlog rather than the corpus.
CREATE INDEX pull_requests_unpublished ON pull_requests (created_at) WHERE published_at IS NULL;
CREATE INDEX reviews_unpublished ON reviews (submitted_at) WHERE published_at IS NULL;
CREATE INDEX issues_unpublished ON issues (created_at) WHERE published_at IS NULL;
