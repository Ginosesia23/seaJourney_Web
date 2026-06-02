-- Crew Rotations table
-- Stores repeating ON/OFF rotation patterns for crew members.
-- A NULL crew_user_id represents the vessel-wide default rotation.
-- Per-crew rows override the default for specific crew members.
--
-- Run this once against your Supabase project to enable the
-- Crew Rotation page at /dashboard/crew-rotation.

CREATE TABLE IF NOT EXISTS crew_rotations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id    uuid        NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  crew_user_id uuid        REFERENCES users(id) ON DELETE SET NULL,
  -- NULL crew_user_id = vessel-wide default rotation
  on_unit      text        NOT NULL CHECK (on_unit  IN ('days', 'weeks', 'months')),
  on_value     integer     NOT NULL CHECK (on_value  > 0),
  off_unit     text        NOT NULL CHECK (off_unit IN ('days', 'weeks', 'months')),
  off_value    integer     NOT NULL CHECK (off_value > 0),
  start_date   date        NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Enforce one default (crew_user_id IS NULL) per vessel
CREATE UNIQUE INDEX IF NOT EXISTS crew_rotations_vessel_default_idx
  ON crew_rotations (vessel_id)
  WHERE crew_user_id IS NULL;

-- Enforce one custom rotation per (vessel, crew member)
CREATE UNIQUE INDEX IF NOT EXISTS crew_rotations_vessel_crew_idx
  ON crew_rotations (vessel_id, crew_user_id)
  WHERE crew_user_id IS NOT NULL;

-- Index for vessel-scoped queries
CREATE INDEX IF NOT EXISTS crew_rotations_vessel_id_idx
  ON crew_rotations (vessel_id, created_at DESC);

-- Row-Level Security
ALTER TABLE crew_rotations ENABLE ROW LEVEL SECURITY;

-- Vessel managers can read their own vessel's rotations
CREATE POLICY "vessel_managers_select_crew_rotations" ON crew_rotations
  FOR SELECT
  USING (
    vessel_id IN (
      SELECT active_vessel_id FROM users
      WHERE id = auth.uid() AND role = 'vessel'
    )
  );

-- Vessel managers can create rotations for their vessel
CREATE POLICY "vessel_managers_insert_crew_rotations" ON crew_rotations
  FOR INSERT
  WITH CHECK (
    vessel_id IN (
      SELECT active_vessel_id FROM users
      WHERE id = auth.uid() AND role = 'vessel'
    )
  );

-- Vessel managers can update rotations for their vessel
CREATE POLICY "vessel_managers_update_crew_rotations" ON crew_rotations
  FOR UPDATE
  USING (
    vessel_id IN (
      SELECT active_vessel_id FROM users
      WHERE id = auth.uid() AND role = 'vessel'
    )
  );

-- Vessel managers can delete rotations for their vessel
CREATE POLICY "vessel_managers_delete_crew_rotations" ON crew_rotations
  FOR DELETE
  USING (
    vessel_id IN (
      SELECT active_vessel_id FROM users
      WHERE id = auth.uid() AND role = 'vessel'
    )
  );

-- Admins have full access
CREATE POLICY "admins_all_crew_rotations" ON crew_rotations
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
