-- Seed MCA OOW (Yachts) Digital Companion Pilot — ONE section only.
-- PART 3: Maintain a Safe Navigational Watch (PDF pages 55–57).
-- Source: MCA Yacht Training Record Book, OGL v3.0.
-- Does NOT alter SJ-DEMO-TRB-OOW.
--
-- Run AFTER sql/extend-trb-mca-oow-pilot.sql

BEGIN;

INSERT INTO public.trb_programs (
  code, name, description, programme_type, issuing_body,
  is_official, is_active, recognition_status,
  source_authority, source_title, source_url, source_published_at,
  source_license, source_license_url
)
VALUES (
  'SJ-PILOT-MCA-OOW-YACHTS',
  'MCA OOW (Yachts) TRB – Digital Companion Pilot',
  'Private SeaJourney pilot importing one section of the official MCA Yacht Training Record Book for OOW (Yachts), less than 3000 GT. Digital companion only — not MCA/PYA approved as a replacement for the official TRB.',
  'mca_pilot',
  'Maritime and Coastguard Agency',
  false,
  true,
  'not_approved',
  'Maritime and Coastguard Agency',
  'Yacht training record book (TRB) for yacht ratings and officer in charge of a navigational watch, yachts less than 3000 GT',
  'https://www.gov.uk/government/publications/yacht-training-record-book-trb',
  '2014-07-07',
  'Open Government Licence v3.0',
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    programme_type = EXCLUDED.programme_type,
    issuing_body = EXCLUDED.issuing_body,
    is_official = false,
    recognition_status = 'not_approved',
    source_authority = EXCLUDED.source_authority,
    source_title = EXCLUDED.source_title,
    source_url = EXCLUDED.source_url,
    source_published_at = EXCLUDED.source_published_at,
    source_license = EXCLUDED.source_license,
    source_license_url = EXCLUDED.source_license_url,
    updated_at = now();

WITH prog AS (
  SELECT id FROM public.trb_programs WHERE code = 'SJ-PILOT-MCA-OOW-YACHTS'
)
INSERT INTO public.trb_program_versions (
  program_id, version, status, effective_from, disclaimer, published_at,
  source_version_reference, source_checked_at, attribution_html, pilot_disclaimer
)
SELECT
  prog.id,
  'mca-source-2014-pilot-1',
  'pilot',
  CURRENT_DATE,
  'Digital companion pilot only. This programme is not currently approved by the Maritime and Coastguard Agency or the Professional Yachting Association as a replacement for the official Training Record Book. Candidates must continue completing and obtaining the required signatures in their official TRB.',
  now(),
  'Rev 2 (30/06/04) — GOV.UK publication dated 2014-07-07',
  CURRENT_DATE,
  'Contains public sector information licensed under the Open Government Licence v3.0. Source: Maritime and Coastguard Agency, Yacht Training Record Book.',
  'Digital companion pilot only. This programme is not currently approved by the Maritime and Coastguard Agency or the Professional Yachting Association as a replacement for the official Training Record Book. Candidates must continue completing and obtaining the required signatures in their official TRB.'
FROM prog
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_program_versions v
  WHERE v.program_id = prog.id AND v.version = 'mca-source-2014-pilot-1'
);

-- Section: Maintain a Safe Navigational Watch (official title preserved)
WITH ver AS (
  SELECT v.id
  FROM public.trb_program_versions v
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS' AND v.version = 'mca-source-2014-pilot-1'
)
INSERT INTO public.trb_sections (
  program_version_id, title, description, sort_order,
  source_section_reference, source_page_start, source_page_end
)
SELECT
  ver.id,
  'Maintain a Safe Navigational Watch',
  $sec$PART 3 — NAVIGATION AT OPERATIONAL LEVEL
TASKS - maintain a safe navigational watch

GENERAL PRINCIPLES (To be read in conjunction with the tasks detailed below)

General Principals 1.
A thorough knowledge of the principals of navigational watchkeeping at sea, including under pilotage, and watchkeeping at anchor and in port.
The principals applying to:
• watchkeeping generally;
• protection of the marine environment;
• keeping a navigational watch.
CRITERIA FOR SATISFACTORY PERFORMANCE: The knowledge and application of the principals will be demonstrated by satisfactory standard of proficiency in the various TASKS.

General Principals 2.
A thorough knowledge of the content, application and intent of the International Regulations for Preventing Collisions at Sea (COLREGS).
Correct knowledge and application of the Regulations in any given situation.
CRITERIA FOR SATISFACTORY PERFORMANCE: The knowledge and application of COLREGS will be demonstrated by satisfactory standard of proficiency in the various TASKS.

General Principals 3.
Knowledge of the 'Bridge Procedures Guide', published by The International Chamber of Shipping (ICS).
The procedures are adopted and applied correctly.
CRITERIA FOR SATISFACTORY PERFORMANCE: The knowledge and application of the procedures will be demonstrated by satisfactory standard of proficiency in the various TASKS.

Note: SeaJourney does not reproduce ICS Bridge Procedures Guide content. Candidates should consult the official ICS publication separately.
$sec$,
  1,
  'PART 3 / TASKS - Maintain a Safe Navigational Watch',
  55,
  57
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections s
  WHERE s.program_version_id = ver.id
    AND s.title = 'Maintain a Safe Navigational Watch'
);

-- 12 signable tasks (official wording; spelling "Principals" preserved from source)
WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = 'Maintain a Safe Navigational Watch'
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  'SeaJourney guidance only — not MCA text. Attach private notes/photos that help your Master assess this task; continue to obtain the matching signature in your official TRB.',
  'SeaJourney guidance only — not MCA text. Record how you demonstrated this task on board. Digital captain review does not replace the official TRB signature.',
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  'Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper/PDF Training Record Book.'
FROM sec
CROSS JOIN (VALUES
  ('MCA-P3-WATCH-01', 1, 55, 55, 'PART 3 p.55 task 1',
   'On preparing for sea, check ship''s draught, and check that the necessary equipment on the bridge is operational and proper sailing information is available.',
   E'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nAll navigational and communication equipment is operational and all appropriate charts, tidal and weather information is available.',
   'e25ac0fcd526188c3cb8ced9171645e1347e78736d8077970a38ef923b387b00'),
  ('MCA-P3-WATCH-02', 2, 55, 55, 'PART 3 p.55 task 2',
   'On leaving or entering port notify the master/engine control room as appropriate.',
   E'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nThe master/engine control room is notified as appropriate.',
   '3507469ff6587c93342d2887a63807e1acb7f566216fa35d99b456f29e669e02'),
  ('MCA-P3-WATCH-03', 3, 56, 56, 'PART 3 p.56 task 3',
   'Assist in carrying out the master/pilot''s order/directions.',
   E'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nMaster/pilot''s instructions are verified and essential information recorded and relevant information given to those concerned.',
   'e780af1c1ec04754bc9e09e3a2406dc7cfd9a4820a63a78bfd93e0ecf75fef9d'),
  ('MCA-P3-WATCH-04', 4, 56, 56, 'PART 3 p.56 task 4',
   'Monitor the course, speed and position.',
   E'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nShip''s safety is constantly monitored and the candidate shows to be particularly vigilant and on the alert in confined waters.',
   '22dbe3cd57f6485dafd6af270bf264be1c59949ffce44733bd1850a89dbdcaa5'),
  ('MCA-P3-WATCH-05', 5, 56, 56, 'PART 3 p.56 task 5',
   'Display/sound correct lights, flags, shapes and sound signals.',
   E'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nCorrect lights, flags, shapes and sound signals are displayed/sounded.',
   'e00db59f672bab1b6ea99fbb45a1602689fada9ce920e496590a3851fe5e398b'),
  ('MCA-P3-WATCH-06', 6, 56, 56, 'PART 3 p.56 task 6',
   'Properly monitor the pilot''s safety when boarding and disembarking.',
   E'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nThe pilot''s safety is ensured when boarding and disembarking.',
   'cf20760923363e410571501f3ebc5f9d473509e50750b2aa4ec22acd7431bb62'),
  ('MCA-P3-WATCH-07', 7, 56, 56, 'PART 3 p.56 task 7',
   'On leaving or entering port notify the crew as appropriate.',
   E'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nThe crew is available for handling moorings/anchors when needed.',
   'f15baec704c13a6fe67a8cb1153e4c065787af87122f3e984669be2540c8fe89'),
  ('MCA-P3-WATCH-08', 8, 56, 56, 'PART 3 p.56 task 8',
   'At the commencement of the watch ascertain ship''s position, course and speed and appraise the traffic situation and any danger to the ship.',
   E'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nAll checks are promptly and correctly carried out. A clear statement is given that the situation is under full control when the watch is formally taken over.',
   'e97eed02d5b28eff020e6d0f0094c6f70b8b28eca55278e4b88afe1129d0f810'),
  ('MCA-P3-WATCH-09', 9, 57, 57, 'PART 3 p.57 task 9',
   'Fix the ship''s position regularly, assess risks of collision and/or grounding and take appropriate actions.',
   E'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nApply the International Regulations for Preventing Collisions at Sea properly.',
   '25c0b7b4e100804b4b1649ce262941118251c08683af8c88562d57d93423a4f3'),
  ('MCA-P3-WATCH-10', 10, 57, 57, 'PART 3 p.57 task 10',
   'Check the reliability of the information obtained from the primary method of position fixing at appropriate intervals.',
   E'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nThe reliability of the information obtained from the primary method of position fixing is checked at appropriate intervals.',
   'fbe5e2e3452d33756e334b47cf059cf6bb815af4d5fa9767458de68b24fb0ec8'),
  ('MCA-P3-WATCH-11', 11, 57, 57, 'PART 3 p.57 task 11',
   'Adjust the ship''s course and speed to the traffic, the waters and the meteorological condition.',
   E'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nThe speed and mode of steering is suitable for the prevailing conditions.',
   'f0ca1f18b33286ebef4a876e5fd8ff17a1b13f8eebb0a05d8db1e8a0e0248f05'),
  ('MCA-P3-WATCH-12', 12, 57, 57, 'PART 3 p.57 task 12',
   'Monitor and control navigational instruments and record relevant activities and incidents.',
   E'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nCompasses are regularly checked and errors are correctly applied. All movements and activities related to the navigation of the ship are properly recorded.',
   '63d91d865e23c5c39b52854b4252d1fe26c38e45276fd1e2003de09face42db7')
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

COMMIT;
