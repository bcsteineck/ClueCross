-- Publishing v1: one permanent record per published puzzle.
--
-- Apply once per Neon branch, over a DIRECT (unpooled) connection: to the
-- `main` branch (the permanent production calendar) before the `dev` and
-- `test` branches are created from it, so both inherit the empty table.
--
-- Status is never stored: a publication releases at 10:00 PM
-- America/New_York on the day before publish_date (src/publishing). Rows
-- are never updated or deleted by the application.

CREATE TABLE IF NOT EXISTS published_puzzles (
  puzzle_id TEXT NOT NULL,
  publish_date DATE NOT NULL,
  content_fingerprint TEXT NOT NULL,
  fingerprint_version INTEGER NOT NULL,
  puzzle JSONB NOT NULL,
  layout JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT published_puzzles_pkey PRIMARY KEY (puzzle_id),
  CONSTRAINT published_puzzles_publish_date_key UNIQUE (publish_date),
  CONSTRAINT published_puzzles_fingerprint_version_check CHECK (fingerprint_version = 1),
  CONSTRAINT published_puzzles_fingerprint_format_check CHECK (content_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT published_puzzles_puzzle_id_format_check CHECK (puzzle_id ~ '^[a-z][a-z0-9]*$'),
  CONSTRAINT published_puzzles_record_ids_check CHECK (
    puzzle->>'id' = puzzle_id AND layout->>'puzzleId' = puzzle_id AND layout->>'id' = puzzle_id || '-grid'
  )
);
