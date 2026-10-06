-- Production calendar marker: positively identifies the Neon `main` branch,
-- the permanent ClueCross Production calendar.
--
-- APPLY TO `main` ONLY, over a direct connection as the database owner.
-- NEVER apply it to `dev` or `test`: the Workshop's Production operations
-- runner (workshop/server/production) refuses to run unless this table
-- exists, and also refuses any database that has the `test` branch's
-- cluecross_test_branch marker. It is the counterpart of that test marker.
--
-- Presence of the table is the marker; it holds no data and no secrets. It
-- does not touch published_puzzles, released_puzzles, the release function,
-- or any role, so the player and publishing are unaffected. No role but the
-- owner can read it.

CREATE TABLE IF NOT EXISTS cluecross_production_calendar ();

COMMENT ON TABLE cluecross_production_calendar IS
  'Marker: this database is the ClueCross Production calendar (Neon main). Never create it on dev or test.';

REVOKE ALL ON TABLE cluecross_production_calendar FROM PUBLIC;
