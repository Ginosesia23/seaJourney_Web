-- =============================================================================
-- nav_watch_logs — RLS policies for the new vessel-side "Watches" tab.
--
-- Your nav_watch_logs table already exists (with user_id / vessel_id stored
-- as TEXT, plus the rich position / weather columns). The new Watches tab on
-- the crew profile (/dashboard/crew → Watches) needs vessel managers to be
-- able to SELECT rows where the crew member belongs to their vessel.
--
-- This script is idempotent — DROP POLICY IF EXISTS guards every CREATE so
-- you can re-run it any time. It does NOT touch any existing policies you
-- might already have for crew-self-access, captains, admins, etc.
-- =============================================================================

-- Make sure RLS is on (no-op if already enabled).
ALTER TABLE nav_watch_logs ENABLE ROW LEVEL SECURITY;

-- Crew can read / write their own logs. Idempotent — adjust if you already
-- have an equivalent policy under a different name.
DROP POLICY IF EXISTS "nav_watch_logs_owner_all" ON nav_watch_logs;
CREATE POLICY "nav_watch_logs_owner_all" ON nav_watch_logs
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Vessel managers can read logs for any crew member on their active vessel.
-- This is what unlocks the new Watches tab on /dashboard/crew for the
-- vessel account. Read-only — only the crew member themselves writes via
-- /dashboard/bridge-watch-log.
DROP POLICY IF EXISTS "nav_watch_logs_vessel_manager_read" ON nav_watch_logs;
CREATE POLICY "nav_watch_logs_vessel_manager_read" ON nav_watch_logs
  FOR SELECT
  USING (
    vessel_id IN (
      SELECT active_vessel_id::text FROM users
      WHERE id = auth.uid() AND role = 'vessel'
    )
  );

-- Admins have full access.
DROP POLICY IF EXISTS "nav_watch_logs_admin_all" ON nav_watch_logs;
CREATE POLICY "nav_watch_logs_admin_all" ON nav_watch_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
