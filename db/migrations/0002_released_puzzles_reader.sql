-- Player read model: the public, release-gated view of the calendar and the
-- read-only role the player API connects as.
--
--   published_puzzles  (owner only)
--     -> released_puzzles view (rows whose release instant has arrived)
--     -> cluecross_reader (SELECT on the view, nothing else)
--
-- Apply over a DIRECT connection as the database owner, branch by branch.
-- The role is created NOLOGIN here; its LOGIN PASSWORD is set out of band per
-- branch, so no credential ever lives in the repository.
--
-- View security model (PostgreSQL 15+, verified on 18):
--   * security_invoker = false — base-table access is checked against the
--     view's owner, so the reader needs no privilege on published_puzzles
--     and can see rows only through the view's release filter.
--   * security_barrier = true — the view's own WHERE clause runs before any
--     condition a caller adds, so a caller's function or failing cast can
--     never be evaluated against an unreleased row.
--   * TEMP is revoked from PUBLIC so the reader cannot create pg_temp
--     functions at all (PUBLIC had CONNECT + TEMP on the database).

-- A puzzle dated D releases at 10:00 PM America/New_York on D − 1. The wall
-- time is converted with PostgreSQL's own zone rules (never a fixed offset);
-- 22:00 is never inside a DST transition, so the instant is unambiguous.
-- Matches releaseInstant() in src/publishing/releaseSchedule.ts.
CREATE OR REPLACE FUNCTION published_puzzle_release_instant(publish_date date)
  RETURNS timestamptz
  LANGUAGE sql
  STABLE
  PARALLEL SAFE
  RETURN ((publish_date - 1) + make_time(22, 0, 0)) AT TIME ZONE 'America/New_York';

-- Released puzzles only, judged by database time. Exposes exactly what the
-- player API needs: publish_date as YYYY-MM-DD text (never a driver-parsed
-- Date), the content fingerprint for validators, and the puzzle itself.
CREATE OR REPLACE VIEW released_puzzles
  WITH (security_barrier = true, security_invoker = false)
AS
  SELECT
    puzzle_id,
    publish_date::text AS publish_date,
    content_fingerprint,
    fingerprint_version,
    puzzle,
    layout
  FROM published_puzzles
  WHERE published_puzzle_release_instant(published_puzzles.publish_date) <= now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cluecross_reader') THEN
    CREATE ROLE cluecross_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  -- No temporary objects for anyone without an explicit grant (the owner
  -- and neon_superuser keep theirs).
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO cluecross_reader', current_database());
END
$$;

-- Every session of the reader is read-only, as defense in depth.
ALTER ROLE cluecross_reader SET default_transaction_read_only = on;

-- The base table: owner only.
REVOKE ALL ON TABLE published_puzzles FROM PUBLIC;
REVOKE ALL ON TABLE published_puzzles FROM cluecross_reader;

-- The view: SELECT for the reader, nothing for anyone else.
REVOKE ALL ON TABLE released_puzzles FROM PUBLIC;
GRANT SELECT ON TABLE released_puzzles TO cluecross_reader;

-- The release function reveals nothing, but keep it explicit.
REVOKE ALL ON FUNCTION published_puzzle_release_instant(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION published_puzzle_release_instant(date) TO cluecross_reader;

GRANT USAGE ON SCHEMA public TO cluecross_reader;
