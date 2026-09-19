-- Seed demonstration Digital TRB Companion programme (dev / pilot).
-- Safe to re-run: uses fixed codes and ON CONFLICT / existence checks.
--
-- Run AFTER sql/create-digital-trb-companion.sql

BEGIN;

INSERT INTO public.trb_programs (code, name, description, programme_type, issuing_body, is_official, is_active)
VALUES (
  'SJ-DEMO-TRB-OOW',
  'SeaJourney Demonstration Training Record Companion',
  'Pilot training-task tracker for yacht officers. Demonstration content only — not an official MCA or PYA Training Record Book.',
  'demonstration',
  'SeaJourney (pilot)',
  false,
  true
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

WITH prog AS (
  SELECT id FROM public.trb_programs WHERE code = 'SJ-DEMO-TRB-OOW'
)
INSERT INTO public.trb_program_versions (
  program_id, version, status, effective_from, disclaimer, published_at
)
SELECT
  prog.id,
  'pilot-2026.1',
  'pilot',
  CURRENT_DATE,
  'Demonstration content only. This is not the official MCA/PYA OOW 3000 Training Record Book. SeaJourney Digital TRB Companion is a pilot training-task tracker for captain-reviewed training evidence.',
  now()
FROM prog
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_program_versions v
  WHERE v.program_id = prog.id AND v.version = 'pilot-2026.1'
);

-- Sections
WITH ver AS (
  SELECT v.id
  FROM public.trb_program_versions v
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-DEMO-TRB-OOW' AND v.version = 'pilot-2026.1'
)
INSERT INTO public.trb_sections (program_version_id, title, description, sort_order)
SELECT ver.id, s.title, s.description, s.sort_order
FROM ver
CROSS JOIN (VALUES
  ('Bridge familiarisation', 'Ship-specific bridge layout and watch routines (demonstration).', 1),
  ('Watchkeeping fundamentals', 'Core bridge watchkeeping practice tasks (demonstration).', 2),
  ('Emergency preparedness', 'Drills and emergency response awareness (demonstration).', 3)
) AS s(title, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id AND x.title = s.title
);

-- Tasks (placeholder wording — not official OOW 3000 text)
WITH secs AS (
  SELECT s.id, s.title, s.sort_order
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-DEMO-TRB-OOW' AND v.version = 'pilot-2026.1'
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance,
  required_signer_role, sort_order, is_required
)
SELECT secs.id, t.task_code, t.title, t.description, t.evidence_guidance, 'captain', t.sort_order, true
FROM secs
JOIN (VALUES
  ('Bridge familiarisation', 'BF-01', 'Locate primary bridge controls',
   'Demonstrate knowledge of helm, thrusters, and main engine telegraph locations on this vessel.',
   'Photo of annotated bridge layout or short note listing control locations verified with the Master.', 1),
  ('Bridge familiarisation', 'BF-02', 'Review standing orders',
   'Read and discuss the Master''s standing orders and night orders relevant to your watch.',
   'Signed acknowledgement note or extract of discussion points with date.', 2),
  ('Bridge familiarisation', 'BF-03', 'Identify navigation equipment suite',
   'Identify ECDIS/radar/AIS/GPS units fitted and their power/backup arrangements.',
   'Checklist of equipment with observed status (on/standby/backup).', 3),
  ('Watchkeeping fundamentals', 'WK-01', 'Prepare a watch handover',
   'Complete a structured watch handover including position, traffic, weather, and defects.',
   'Sample handover note from an actual watch (redact sensitive voyage details if needed).', 1),
  ('Watchkeeping fundamentals', 'WK-02', 'Collision-avoidance assessment',
   'Assess a developing traffic situation and explain the action taken or recommended.',
   'Brief narrative with relative bearing/CPA context and Rule reference (demonstration).', 2),
  ('Watchkeeping fundamentals', 'WK-03', 'Passage monitoring check',
   'Verify cross-track error, next waypoint, and under-keel considerations for the watch.',
   'Screenshot or note of monitoring checks performed during a watch.', 3),
  ('Watchkeeping fundamentals', 'WK-04', 'Communications log practice',
   'Record a VHF or internal communication relevant to navigational safety.',
   'Copy of a communication log entry with time and synopsis.', 4),
  ('Emergency preparedness', 'EM-01', 'Muster station familiarisation',
   'Locate personal muster station, LSA, and fire-fighting equipment relevant to your role.',
   'Photo or annotated plan showing muster station and nearest extinguisher/LSA.', 1),
  ('Emergency preparedness', 'EM-02', 'Man-overboard initial actions',
   'Describe immediate bridge actions for a man-overboard alert during your watch.',
   'Written procedure summary reviewed with the Master or OOW.', 2),
  ('Emergency preparedness', 'EM-03', 'Participate in a drill debrief',
   'Attend a safety drill and capture lessons learned for bridge team performance.',
   'Short debrief notes with date of drill and your role.', 3)
) AS t(section_title, task_code, title, description, evidence_guidance, sort_order)
  ON t.section_title = secs.title
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = secs.id AND x.task_code = t.task_code
);

COMMIT;
