-- Full-book additive seed: MCA Yacht TRB OOW (Yachts <3,000 GT) digital companion
-- Source: docs/trb/source/training_record_book_revision_22_04-2.pdf · Rev 2 (30/06/04)
-- Programme/version IDs preserved: SJ-PILOT-MCA-OOW-YACHTS / mca-source-2014-pilot-1
-- Idempotent: inserts missing sections/tasks only. Does NOT rewrite curated P3-WATCH tasks.
-- Also backfills trb_task_progress for existing active enrolments on this version.
-- Run AFTER sql/seed-trb-mca-oow-pilot-section.sql
-- Prefer also running sql/promote-trb-oow-yachts-3000gt-companion.sql

BEGIN;

-- Section 1: Yacht Rating Certificate (Support Level Functions)
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
  $trb$Yacht Rating Certificate (Support Level Functions)$trb$,
  $trb$PART 1 — YACHT RATING CERTIFICATE (SUPPORT LEVEL FUNCTIONS)
Seamanship, deck work, watchkeeping and safe working practices at the support level. Required for yacht rating certificate underpinning knowledge.$trb$,
  1,
  $trb$PART 1 / TASKS – Yacht rating certificate (support functions)$trb$,
  24,
  31
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Yacht Rating Certificate (Support Level Functions)$trb$
);

UPDATE public.trb_sections s
SET sort_order = 1,
    description = COALESCE(s.description, $trb$PART 1 — YACHT RATING CERTIFICATE (SUPPORT LEVEL FUNCTIONS)
Seamanship, deck work, watchkeeping and safe working practices at the support level. Required for yacht rating certificate underpinning knowledge.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 1 / TASKS – Yacht rating certificate (support functions)$trb$),
    source_page_start = COALESCE(s.source_page_start, 24),
    source_page_end = COALESCE(s.source_page_end, 31)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Yacht Rating Certificate (Support Level Functions)$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Yacht Rating Certificate (Support Level Functions)$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P1-RATING-01$trb$, 1, 24, 24, $trb$PART 1 p.24 task 1$trb$, $trb$Demonstrate knowledge of the compass card in 360o notation$trb$, $trb$Demonstrate knowledge of the compass card in 360o notation$trb$, $trb$b874c4dcd3fff5d5886b21646f76799b63d4d510c088d4229f00644c79b54b8c$trb$),
  ($trb$MCA-P1-RATING-02$trb$, 2, 24, 24, $trb$PART 1 p.24 task 2$trb$, $trb$Demonstrate ab ility to steer using magnetic and gyro-compass in op en waters$trb$, $trb$Demonstrate ab ility to steer using magnetic and gyro-compass in op en waters

Steer the sh ip and co mply with h elm o rders in the English languag e. Steer th e sh ip fo r at least 5 hours, ex cluding periods of i nstruction, demonstrating all of th e kno wledge, understanding and .$trb$, $trb$2ffd0540971d41bcfc8df47a08c902db0f200674732eea5b1886335ff8e01359$trb$),
  ($trb$MCA-P1-RATING-03$trb$, 3, 24, 24, $trb$PART 1 p.24 task 3$trb$, $trb$Demonstrate ability to steer u sing magnetic and gyro-compass in pilotage waters$trb$, $trb$Demonstrate ability to steer u sing magnetic and gyro-compass in pilotage waters

Steer th e ship and comply with helm orders in the English languag e. Steer th e sh ip fo r at least 5 hours, ex cluding periods of i nstruction, demonstrating all of th e kno wledge, understanding and .$trb$, $trb$6d1d555bd3722c81072749f2b957ae20a8666d11ced2649d2b5e59c26f9e1ad8$trb$),
  ($trb$MCA-P1-RATING-04$trb$, 4, 24, 24, $trb$PART 1 p.24 task 4$trb$, $trb$Demonstrate change over procedures from helm to auto steering and vice-versa$trb$, $trb$Demonstrate change over procedures from helm to auto steering and vice-versa$trb$, $trb$22058d9c47cad1b42e1f8fb35a380f66c5c99e1fe69e9c27b391d588961d928c$trb$),
  ($trb$MCA-P1-RATING-05$trb$, 5, 25, 25, $trb$PART 1 p.25 task 5$trb$, $trb$Keeping a Proper Lookout & Lookout Duties Demonstrate ability to report ships, lights, navigation mark and other floating and fixed objects$trb$, $trb$Keeping a Proper Lookout & Lookout Duties Demonstrate ability to report ships, lights, navigation mark and other floating and fixed objects

lights and other objects are properly detected and their appropriate bearing in degrees or points is reported to the officer of the watch.$trb$, $trb$980a050c80bfbf77898cd01ae2a7eba0381e43eb1b5edcf56ee122553469f38e$trb$),
  ($trb$MCA-P1-RATING-06$trb$, 6, 25, 25, $trb$PART 1 p.25 task 6$trb$, $trb$Demonstrate ability to report sound signals$trb$, $trb$Demonstrate ability to report sound signals

sound signals are properly detected and their app ropriate bearing in degrees or points is reported to the officer of the watch.$trb$, $trb$de84219f23dc9a3be7db5bed06d120006199727737db35a67a89aed7f8d28ec4$trb$),
  ($trb$MCA-P1-RATING-07$trb$, 7, 25, 25, $trb$PART 1 p.25 task 7$trb$, $trb$Contribute to Monitoring and Controlling a Safe Watch Demonstrate a knowledge of shipboard terms and definitions$trb$, $trb$Contribute to Monitoring and Controlling a Safe Watch Demonstrate a knowledge of shipboard terms and definitions$trb$, $trb$a02bca061bfb7b3be8856fea55bc280b4511dcdad9ed8c14a33824514c7f47b6$trb$),
  ($trb$MCA-P1-RATING-08$trb$, 8, 25, 25, $trb$PART 1 p.25 task 8$trb$, $trb$Demonstrate use of appropriate internal communications equipment and alarms$trb$, $trb$Demonstrate use of appropriate internal communications equipment and alarms$trb$, $trb$230821efc4acade17303fcb14f29b3877ee99960bca8ea4e57453856dfae98cf$trb$),
  ($trb$MCA-P1-RATING-09$trb$, 9, 25, 25, $trb$PART 1 p.25 task 9$trb$, $trb$Demonstrate the ability to understand common orders and commands from the OOW in matters relevant to watch keeping duties$trb$, $trb$Demonstrate the ability to understand common orders and commands from the OOW in matters relevant to watch keeping duties$trb$, $trb$01ea85d64198f04040dd4747dda67da5f758eca898805cd47b7d86c7d33affa1$trb$),
  ($trb$MCA-P1-RATING-10$trb$, 10, 25, 25, $trb$PART 1 p.25 task 10$trb$, $trb$Demonstrate the ability to respond to orders and commands, and communicate with the OOW in a clear and concise fashion$trb$, $trb$Demonstrate the ability to respond to orders and commands, and communicate with the OOW in a clear and concise fashion$trb$, $trb$9125dcecf378c946465388968911c7835b8db8604ed0ee7eddd2bbb274202055$trb$),
  ($trb$MCA-P1-RATING-11$trb$, 11, 26, 26, $trb$PART 1 p.26 task 11$trb$, $trb$Demonstrate knowledge of the procedures for the relief and handover of the navigational watch in accordance with accepted principles and procedures$trb$, $trb$Demonstrate knowledge of the procedures for the relief and handover of the navigational watch in accordance with accepted principles and procedures$trb$, $trb$97fdae17bef46c59d8885f042d7b9306f8def15333fcce4b7b2d4fc54661bab5$trb$),
  ($trb$MCA-P1-RATING-12$trb$, 12, 26, 26, $trb$PART 1 p.26 task 12$trb$, $trb$Demonstrate knowledge of the information required to maintain a safe navigation watch$trb$, $trb$Demonstrate knowledge of the information required to maintain a safe navigation watch$trb$, $trb$bfb5744885b1187cf2191d8173b41fd261c6642e1f4f499ed012b92fef489386$trb$),
  ($trb$MCA-P1-RATING-13$trb$, 13, 26, 26, $trb$PART 1 p.26 task 13$trb$, $trb$Life Saving and Fire Fighting Equipment Understand the importance of musters and drills and know what action to take on hearing an alarm signal$trb$, $trb$Life Saving and Fire Fighting Equipment Understand the importance of musters and drills and know what action to take on hearing an alarm signal$trb$, $trb$1de53181fea5379c0b657fba70cc831481268d6c0febb50ba38fbcce262e4c08$trb$),
  ($trb$MCA-P1-RATING-14$trb$, 14, 26, 26, $trb$PART 1 p.26 task 14$trb$, $trb$Demonstrate a knowledge of assigned shipboard emergency duties in event of a fire, emergency or Manoverboard both in port and at sea$trb$, $trb$Demonstrate a knowledge of assigned shipboard emergency duties in event of a fire, emergency or Manoverboard both in port and at sea$trb$, $trb$cf4247305aa82e2deba6b141f2721f5462c56c61e6b3e3df6bb8407f83a8ac3a$trb$),
  ($trb$MCA-P1-RATING-15$trb$, 15, 26, 26, $trb$PART 1 p.26 task 15$trb$, $trb$Understand alarm systems and demonstrate the ability to distinguish between the various alarm signals including fire, emergency and Manoverboard alarms, and other operational alarms (as applicable$trb$, $trb$Understand alarm systems and demonstrate the ability to distinguish between the various alarm signals including fire, emergency and Manoverboard alarms, and other operational alarms (as applicable

).$trb$, $trb$abd37819dbc2756174491e648df6e70c2cb3aa75dd9b220414e47c713b0886d5$trb$),
  ($trb$MCA-P1-RATING-16$trb$, 16, 26, 26, $trb$PART 1 p.26 task 16$trb$, $trb$Demonstrate a fam iliarity with type, use and location of fire fighting appliances including fixed fire fighting equipment such as in engine room, galley and petrol storage lockers$trb$, $trb$Demonstrate a fam iliarity with type, use and location of fire fighting appliances including fixed fire fighting equipment such as in engine room, galley and petrol storage lockers$trb$, $trb$8b6e119bbb5361ab780ed336a2bcb1176191ac4e7e994d40b9c906ab38a84c2c$trb$),
  ($trb$MCA-P1-RATING-17$trb$, 17, 27, 27, $trb$PART 1 p.27 task 17$trb$, $trb$Understand the importance and operation of fire doors and fire dampers and ventilations closures$trb$, $trb$Understand the importance and operation of fire doors and fire dampers and ventilations closures$trb$, $trb$a79ec4e0d569686b6d8241f03fcc97de506449531d55767b332ef776d9cacfc9$trb$),
  ($trb$MCA-P1-RATING-18$trb$, 18, 27, 27, $trb$PART 1 p.27 task 18$trb$, $trb$Demonstrate a familiarity with type, use and location of life saving appliances and life saving equipment$trb$, $trb$Demonstrate a familiarity with type, use and location of life saving appliances and life saving equipment$trb$, $trb$40011188f837210c838003d192e39d2b3b54af79be7bdd9c15ad51e91568c9db$trb$),
  ($trb$MCA-P1-RATING-19$trb$, 19, 27, 27, $trb$PART 1 p.27 task 19$trb$, $trb$Understand the correct operation, precautions and the dangers of launching and recovery of rescue and survival craft$trb$, $trb$Understand the correct operation, precautions and the dangers of launching and recovery of rescue and survival craft$trb$, $trb$93cca82fc8e560fea44aef31d2831c795bc24074c73a3fce97b105b7f10d9ca3$trb$),
  ($trb$MCA-P1-RATING-20$trb$, 20, 27, 27, $trb$PART 1 p.27 task 20$trb$, $trb$Seamanship Demonstrate common knots , bends and hitches: • Reef knot$trb$, $trb$Seamanship Demonstrate common knots , bends and hitches: • Reef knot

• Clove hitch. • Bowline. • Bowline on the bight. • Sheet bend. • Double sheet bend. • Rolling hitch. • Round turn and two half hitches. • Figure of eight.$trb$, $trb$e8f7d607ee9b9b5fb01c5b133a7f3fb606356d9803603fb972e97773dc2b3d05$trb$),
  ($trb$MCA-P1-RATING-21$trb$, 21, 28, 28, $trb$PART 1 p.28 task 21$trb$, $trb$Demonstrate the safe and proper procedures for: • Handling of mooring ropes and wires$trb$, $trb$Demonstrate the safe and proper procedures for: • Handling of mooring ropes and wires

• Use of rope stoppers. • Care, use and storage of ropes and wires. • Safe operation of mooring winches, windlass and capstan. • Correct fitting of wire grips. • Slinging a stage and bosun chair. • Rigging overside ladders, gangways and accommodation ladders. • Rigging of hydrostatic releases. • Securing the deck for heavy weather. • Opening and closing of hatches and watertight doors including, stern, side and other shell openings. • Securing of anchors for sea.$trb$, $trb$999f5e5bbfd3b49b3514690f932a2fc195b4ef7a5703c9748068684695094c88$trb$),
  ($trb$MCA-P1-RATING-22$trb$, 22, 28, 28, $trb$PART 1 p.28 task 22$trb$, $trb$Understand the importance and safe operation of watertight doors, hatches and hull openings$trb$, $trb$Understand the importance and safe operation of watertight doors, hatches and hull openings$trb$, $trb$a9f7c907c321c5eef1871868ba15841ceec9109e0edca8fc800668e3c1ed3e4e$trb$),
  ($trb$MCA-P1-RATING-23$trb$, 23, 28, 28, $trb$PART 1 p.28 task 23$trb$, $trb$Engine Watch Keeping Duties Demonstrate knowledge of the information required to maintain a safe engineering watch$trb$, $trb$Engine Watch Keeping Duties Demonstrate knowledge of the information required to maintain a safe engineering watch$trb$, $trb$22562feea21d150330d14a3f6b537cf922961ad2a9e7897a3127c705635c7e77$trb$),
  ($trb$MCA-P1-RATING-24$trb$, 24, 28, 28, $trb$PART 1 p.28 task 24$trb$, $trb$Understand terms used in machinery space and the names of machinery and equipment$trb$, $trb$Understand terms used in machinery space and the names of machinery and equipment$trb$, $trb$46dd803658bd4a1c401173d27b6431d3ddbbe4984bf3f330c0e0a947b9eb7083$trb$),
  ($trb$MCA-P1-RATING-25$trb$, 25, 28, 28, $trb$PART 1 p.28 task 25$trb$, $trb$Understand engine room watchkeeping procedures$trb$, $trb$Understand engine room watchkeeping procedures$trb$, $trb$ccb601c82d30dcb47a2ddd04c75b8673d3ef01416346a5bc2f695a1678ef4bb5$trb$),
  ($trb$MCA-P1-RATING-26$trb$, 26, 29, 29, $trb$PART 1 p.29 task 26$trb$, $trb$Understand bilge pumping arrangements$trb$, $trb$Understand bilge pumping arrangements$trb$, $trb$958aef0404571a92112ad1dfd6ad26b279f755020c633c0bb585bbf26a4eb707$trb$),
  ($trb$MCA-P1-RATING-27$trb$, 27, 29, 29, $trb$PART 1 p.29 task 27$trb$, $trb$Understand safe working practices as related to engine room operations$trb$, $trb$Understand safe working practices as related to engine room operations$trb$, $trb$d7392251c9b1c43d34066102cec4dbf664fb036da8ecfdc0b4be12b2310b5251$trb$),
  ($trb$MCA-P1-RATING-28$trb$, 28, 29, 29, $trb$PART 1 p.29 task 28$trb$, $trb$Understand the requirement for record and log keeping$trb$, $trb$Understand the requirement for record and log keeping$trb$, $trb$f0f3ef0c9888df4d2317dafed178bda686bc0cec3d3b2eb75be7c5a3933a8d8e$trb$),
  ($trb$MCA-P1-RATING-29$trb$, 29, 29, 29, $trb$PART 1 p.29 task 29$trb$, $trb$Demonstrate how to hand over and relieve an engine room watch in accordance with accepted principles and procedures$trb$, $trb$Demonstrate how to hand over and relieve an engine room watch in accordance with accepted principles and procedures$trb$, $trb$67a58b78ecdb18f900b18e5cca18908e4b8a7fd50c0eeaf46498950b00dfabb0$trb$),
  ($trb$MCA-P1-RATING-30$trb$, 30, 29, 29, $trb$PART 1 p.29 task 30$trb$, $trb$Demonstrate clear and concise communications and acknowledgement of machinery space orders$trb$, $trb$Demonstrate clear and concise communications and acknowledgement of machinery space orders$trb$, $trb$af75bb956a0bf6997a89838bd688d578723f245b0e601124f06682bc5831a6ca$trb$),
  ($trb$MCA-P1-RATING-31$trb$, 31, 29, 29, $trb$PART 1 p.29 task 31$trb$, $trb$Demonstrate an knowledge of machinery space emergency escape routes$trb$, $trb$Demonstrate an knowledge of machinery space emergency escape routes$trb$, $trb$b781f9397baae6c43ff6901b4d4b5734246fd7bfdb205b7cfa889a39f160f3d5$trb$),
  ($trb$MCA-P1-RATING-32$trb$, 32, 29, 29, $trb$PART 1 p.29 task 32$trb$, $trb$Demonstrate opening and closing of engine room openings and accesses including water tight doors (if fitted$trb$, $trb$Demonstrate opening and closing of engine room openings and accesses including water tight doors (if fitted

).$trb$, $trb$84e0ebec1dd709cb7f2eef657a292fda9c54f32b68aa4ec08c2d83792ec91615$trb$),
  ($trb$MCA-P1-RATING-33$trb$, 33, 30, 30, $trb$PART 1 p.30 task 33$trb$, $trb$Prevention Understand bunkering and refuelling procedures with regards to protection of the marine environment$trb$, $trb$Prevention Understand bunkering and refuelling procedures with regards to protection of the marine environment$trb$, $trb$30478832016a8179789e9d39e1b610d5b24149d0f4f77e5dbb7214534a667f12$trb$),
  ($trb$MCA-P1-RATING-34$trb$, 34, 30, 30, $trb$PART 1 p.30 task 34$trb$, $trb$Demonstrate knowledge of basic environmental protection procedures$trb$, $trb$Demonstrate knowledge of basic environmental protection procedures$trb$, $trb$a1c01fe74d5f6e572f249225c29d33ab859e2ecc21d9774394175335e11dc47e$trb$),
  ($trb$MCA-P1-RATING-35$trb$, 35, 30, 30, $trb$PART 1 p.30 task 35$trb$, $trb$Understand requirements and prohibitions for discharge of oils, sewage and residues overside$trb$, $trb$Understand requirements and prohibitions for discharge of oils, sewage and residues overside$trb$, $trb$238fdbc766b2c672ede3b319d80576cab001b71856289764d95f99690d235c22$trb$),
  ($trb$MCA-P1-RATING-36$trb$, 36, 30, 30, $trb$PART 1 p.30 task 36$trb$, $trb$Understand requirements and prohibitions for disposal and/or discharge of garbage$trb$, $trb$Understand requirements and prohibitions for disposal and/or discharge of garbage$trb$, $trb$de02866f223818d6abebacf3c3bba950c989cbc95c1d0aa7378a82a463458f0e$trb$),
  ($trb$MCA-P1-RATING-37$trb$, 37, 31, 31, $trb$PART 1 p.31 task 37$trb$, $trb$Safe Working Practices (COSWP) Have working knowledge of the following COSWP relevant to a seaman’s duties: • Personal protective equipment$trb$, $trb$Safe Working Practices (COSWP) Have working knowledge of the following COSWP relevant to a seaman’s duties: • Personal protective equipment

• Safety signs. • Safety induction. • Fire precautions. • Emergency procedures. • Security on board. • Safe movement onboard ship. • Safe systems of work including work aloft, outboard and in machinery spaces. • Entry into enclosed or confined spaces. • Boarding arrangements. • Manual lifting and carrying. • Use of work equipment. • Lifting plant. • Anchoring, mooring and towing operations. • Stowage and safe handling of oils and chemical.$trb$, $trb$1c9e0a72e5248bad4d7ad8d88cad874a377b1419165261d171bede7936137c67$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 2: Familiarisation and Emergency Procedures
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
  $trb$Familiarisation and Emergency Procedures$trb$,
  $trb$PART 2 — EMERGENCY PROCEDURES, SHIPBOARD OPERATIONS & SAFE WORKING PRACTICES
TASKS – Familiarisation and emergency procedures at the operational level.$trb$,
  2,
  $trb$PART 2 / TASKS – Familiarisation and emergency procedures$trb$,
  32,
  35
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Familiarisation and Emergency Procedures$trb$
);

UPDATE public.trb_sections s
SET sort_order = 2,
    description = COALESCE(s.description, $trb$PART 2 — EMERGENCY PROCEDURES, SHIPBOARD OPERATIONS & SAFE WORKING PRACTICES
TASKS – Familiarisation and emergency procedures at the operational level.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 2 / TASKS – Familiarisation and emergency procedures$trb$),
    source_page_start = COALESCE(s.source_page_start, 32),
    source_page_end = COALESCE(s.source_page_end, 35)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Familiarisation and Emergency Procedures$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Familiarisation and Emergency Procedures$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P2-FAM-01$trb$, 1, 32, 32, $trb$PART 2 p.32 task 1$trb$, $trb$& SAFE WORKING PRACTICES Read and understand applicable ship's standing orders and instructions$trb$, $trb$& SAFE WORKING PRACTICES Read and understand applicable ship's standing orders and instructions$trb$, $trb$d1c5de721f7efedc61830370802e3d115b3f50df1cfcbcb960e6418e0e757190$trb$),
  ($trb$MCA-P2-FAM-02$trb$, 2, 32, 32, $trb$PART 2 p.32 task 2$trb$, $trb$Demonstrate an understanding of safety and operational procedures to be followed, the lines of responsibility and to whom you report$trb$, $trb$Demonstrate an understanding of safety and operational procedures to be followed, the lines of responsibility and to whom you report$trb$, $trb$580902c92d5bc21fc6edf8084fe0c78c52f91bc5be4ee21d559013de054fe1dd$trb$),
  ($trb$MCA-P2-FAM-03$trb$, 3, 32, 32, $trb$PART 2 p.32 task 3$trb$, $trb$Describe the arrangements in place to monitor the number of persons on board$trb$, $trb$Describe the arrangements in place to monitor the number of persons on board

Detail any special security measures which are in place or required both at sea and in port.$trb$, $trb$c3e449acc865a64e6b856e1e8abc175627fb68dd3b59a3a759bc9b85650831ac$trb$),
  ($trb$MCA-P2-FAM-04$trb$, 4, 32, 32, $trb$PART 2 p.32 task 4$trb$, $trb$Knows the various muster stations (including emergency and support parties, crew and guest muster points$trb$, $trb$Knows the various muster stations (including emergency and support parties, crew and guest muster points

).$trb$, $trb$e90f6331ee3cea7706643906dd5a321208a8be941aa6c3f008eac9c7c7ca42de$trb$),
  ($trb$MCA-P2-FAM-05$trb$, 5, 32, 32, $trb$PART 2 p.32 task 5$trb$, $trb$Locate and don your life jacket, and immersion suit (if applicable$trb$, $trb$Locate and don your life jacket, and immersion suit (if applicable

). Know the equipment which is associated with the lifejacket and immersion. Determine when you may wear the jacket, and when you must wear it. Describe the difference between a lifejacket and buoyancy aid.$trb$, $trb$0ce9afd111c4436620745ab3c630f5ea76fc6ccf317b8572b460277892934e44$trb$),
  ($trb$MCA-P2-FAM-06$trb$, 6, 32, 32, $trb$PART 2 p.32 task 6$trb$, $trb$Identify the safety information symbols and signs including those for muster stations, various emergency equipment, emergency escape routes and emergency exits$trb$, $trb$Identify the safety information symbols and signs including those for muster stations, various emergency equipment, emergency escape routes and emergency exits$trb$, $trb$0a388b5601ad7627617c9488a7c3cc8a34e47c30a565c9e8572f7a1f077e8c30$trb$),
  ($trb$MCA-P2-FAM-07$trb$, 7, 33, 33, $trb$PART 2 p.33 task 7$trb$, $trb$Understand the risk to persons and action to be taken in event of: • falling overboard, which may result in drowning, injury or hypothermia$trb$, $trb$Understand the risk to persons and action to be taken in event of: • falling overboard, which may result in drowning, injury or hypothermia

• physical injury, such as falling, crushing limbs, trapping fingers cuts, or burns; • illness, which may result from lack of attention to personal hygiene or food preparation; • discomfort, which may result from cold, or heat, or sea sickness, Understand the precautions that may be taken to mitigate the risk of such injuries.$trb$, $trb$590cc091f62eb8fba373d38f43f12b54a5ba3a9f54750722bcd36a81a920e4c5$trb$),
  ($trb$MCA-P2-FAM-08$trb$, 8, 33, 33, $trb$PART 2 p.33 task 8$trb$, $trb$Demonstrate an understanding of use of foul weather gear for crew and trainees (including use of safety harnesses where appropriate) and of the importance of keeping personnel protected from cold and wet$trb$, $trb$Demonstrate an understanding of use of foul weather gear for crew and trainees (including use of safety harnesses where appropriate) and of the importance of keeping personnel protected from cold and wet$trb$, $trb$0e404e4908b8986918a1d8ec12ce6a20249375f8c60e7fc9fb84fbfdcd165b6d$trb$),
  ($trb$MCA-P2-FAM-09$trb$, 9, 33, 33, $trb$PART 2 p.33 task 9$trb$, $trb$Locate the medical stores, (medical locker) and first aid kits$trb$, $trb$Locate the medical stores, (medical locker) and first aid kits

Identify the person responsible for medical care on board, and the procedure for obtaining medical attention both when the person is on board or when absent. Understand under what circumstances you may administer your own first aid without referral. Understand the reporting procedures and record keeping after administering first aid.$trb$, $trb$c9550d6b909fbf3062e1631c01fd7e9e5debfc3591f5ac6aa40cff352a7a54c7$trb$),
  ($trb$MCA-P2-FAM-10$trb$, 10, 33, 33, $trb$PART 2 p.33 task 10$trb$, $trb$Locate and understand the operation of ship board fire fighting equipment including alarm activating points, alarm bells, extinguishers, hydrants, hoses, breathing apparatus and fireman's outfits$trb$, $trb$Locate and understand the operation of ship board fire fighting equipment including alarm activating points, alarm bells, extinguishers, hydrants, hoses, breathing apparatus and fireman's outfits

Understand the maintenance and service requirements for this equipment.$trb$, $trb$c09e1d8730694e665901f0e0168d2a33e98134093935cc7ac6aee6fd939283c8$trb$),
  ($trb$MCA-P2-FAM-11$trb$, 11, 33, 33, $trb$PART 2 p.33 task 11$trb$, $trb$Locate and understand the operation of fixed fire extinguishing systems, including those for the engine room, galley, and accommodation spaces$trb$, $trb$Locate and understand the operation of fixed fire extinguishing systems, including those for the engine room, galley, and accommodation spaces

Describe the precautions you would take before operating a fixed fire extinguishing system in the engine room. Understand the maintenance and service requirements for this equipment.$trb$, $trb$b6b8055aa8ff4ba46fc91df46410a0f66c916d77b1a626f196864d22e153c52f$trb$),
  ($trb$MCA-P2-FAM-12$trb$, 12, 33, 33, $trb$PART 2 p.33 task 12$trb$, $trb$Locate and understand the operation of the emergency stop mechanism for main engines, emergency stop switches for engine room and accommodation ventilation fans, and emergency pump stops and fuel shut-off valves$trb$, $trb$Locate and understand the operation of the emergency stop mechanism for main engines, emergency stop switches for engine room and accommodation ventilation fans, and emergency pump stops and fuel shut-off valves

Understand the circumstances in which they may be operated. Understand the maintenance and service requirements for this equipment$trb$, $trb$ec6d20bf28f262f42cac99beb4c2250178f2dfae4f2b63277b9aa361a0cabc1c$trb$),
  ($trb$MCA-P2-FAM-13$trb$, 13, 33, 33, $trb$PART 2 p.33 task 13$trb$, $trb$Locate and operate the main and emergency fire pumps$trb$, $trb$Locate and operate the main and emergency fire pumps

Describe the pumping and piping arrangement for the fire main including location of riser(s) and isolation valves.$trb$, $trb$13a0581ac0b904faacdf50add2b61b0332fff444542f82ce2d4c05110c534974$trb$),
  ($trb$MCA-P2-FAM-14$trb$, 14, 34, 34, $trb$PART 2 p.34 task 14$trb$, $trb$Locate and understand the operation of life saving appliances carried on board including liferafts, lifebuoys, line throwing apparatus, distress rockets, flares and other pyrotechnics, EPIRB's,$trb$, $trb$Locate and understand the operation of life saving appliances carried on board including liferafts, lifebuoys, line throwing apparatus, distress rockets, flares and other pyrotechnics, EPIRB's,

SART's, emergency radio's, survival suits, thermal protective aids. Understand the maintenance and service requirements for this equipment.$trb$, $trb$30ffd885d1f113095aa3fe4e9c053f458fb5ece24f19b96fe01d44dd42e9fa24$trb$),
  ($trb$MCA-P2-FAM-15$trb$, 15, 34, 34, $trb$PART 2 p.34 task 15$trb$, $trb$Understand of the advantages of the early use of immersion suits and thermal protective aids (TPAs) and the circumstances In which they should be worn$trb$, $trb$Understand of the advantages of the early use of immersion suits and thermal protective aids (TPAs) and the circumstances In which they should be worn$trb$, $trb$3c1b7344f793fadeecf5caa9204f6bc5520272ebdafdc0395187812f8eb4dcff$trb$),
  ($trb$MCA-P2-FAM-16$trb$, 16, 34, 34, $trb$PART 2 p.34 task 16$trb$, $trb$Locate and understand the operation of various sources of emergency power including batteries, emergency generator or other UPS$trb$, $trb$Locate and understand the operation of various sources of emergency power including batteries, emergency generator or other UPS

Detail equipment and system that are required to have an emergency source of power and those that may.$trb$, $trb$6ae0033c82b8a801322a9ba1b6ebaeeabd218177673175c744a4d981853a934e$trb$),
  ($trb$MCA-P2-FAM-17$trb$, 17, 34, 34, $trb$PART 2 p.34 task 17$trb$, $trb$Describe the action to be taken in discovering smoke or fire$trb$, $trb$Describe the action to be taken in discovering smoke or fire

• In port: • At Sea: • From another vessel$trb$, $trb$cb440040f3edf517e1ab934a2f9169d1095246fbfbf358cd7d3814827a1c8d7d$trb$),
  ($trb$MCA-P2-FAM-18$trb$, 18, 34, 34, $trb$PART 2 p.34 task 18$trb$, $trb$Participate in a fire drill$trb$, $trb$Participate in a fire drill

Describe the procedures to be followed, and the correct and appropriate equipment to be used in various scenarios. Understand the most likely cause of fire for various spaces including accommodation, galley, engine room, storerooms etc.$trb$, $trb$d4685dcc562f704eeadc768f8d5ba219ebbef2f42263fcc7c68af48899e896d1$trb$),
  ($trb$MCA-P2-FAM-19$trb$, 19, 34, 34, $trb$PART 2 p.34 task 19$trb$, $trb$Participate in an emergency drill$trb$, $trb$Participate in an emergency drill

Describe the procedures to be followed for mustering and accounting for guest and crew, donning of lifesaving equipment, abandonment and boarding of survival craft.$trb$, $trb$3ec018ce9176f7173e089adf86a307c1e73dc301a6b01fe4b4a3c041adb5fc1e$trb$),
  ($trb$MCA-P2-FAM-20$trb$, 20, 34, 34, $trb$PART 2 p.34 task 20$trb$, $trb$Describe the action to be taken in event of a manoverboard: • In port: • At Sea: • From another vessel$trb$, $trb$Describe the action to be taken in event of a manoverboard: • In port: • At Sea: • From another vessel$trb$, $trb$217534d378070d2c28d2b80ed16bd9bef114f577a25b899a391261b26ae1b132$trb$),
  ($trb$MCA-P2-FAM-21$trb$, 21, 35, 35, $trb$PART 2 p.35 task 21$trb$, $trb$Participate in a manoverboard drill$trb$, $trb$Participate in a manoverboard drill

Describe the procedures to be followed for launching and recovery of a rescue boat, casualty handling and care.$trb$, $trb$09fc24da8a983e860f54be38c7848f1d45cbe01c50e745a482397b8464d04471$trb$),
  ($trb$MCA-P2-FAM-22$trb$, 22, 35, 35, $trb$PART 2 p.35 task 22$trb$, $trb$Participate in a medical casualty drill$trb$, $trb$Participate in a medical casualty drill

Describe the immediate action to be taken upon encountering an accident or other medical emergency, means of rescue and evacuation (including from an enclosed space) and means of obtaining further medical assistance on board.$trb$, $trb$fd9ddbf519458888a5d5c8df2c2ee2afd70184270703d9da6900bd0a0f8a737c$trb$),
  ($trb$MCA-P2-FAM-23$trb$, 23, 35, 35, $trb$PART 2 p.35 task 23$trb$, $trb$ASSIGNMENTS SATISFACTORY COMPLETION OF ASSIGNMENT WITNESSED Under s upervision, gi ve sa fety induction and fam iliarisation traini ng to ne w joining c rew i ncluding a safety briefing a nd$trb$, $trb$ASSIGNMENTS SATISFACTORY COMPLETION OF ASSIGNMENT WITNESSED Under s upervision, gi ve sa fety induction and fam iliarisation traini ng to ne w joining c rew i ncluding a safety briefing a nd

induction/familiarisation tour of the vessel.$trb$, $trb$88ccd1b7057b7bbe336be580763c601b60108ddd7f868a7f729135a2c181e597$trb$),
  ($trb$MCA-P2-FAM-24$trb$, 24, 35, 35, $trb$PART 2 p.35 task 24$trb$, $trb$Life Saving Appliances – demonstrate your ability to use and instruct the crew on the use of lifesaving appliances including lifejackets, distress flares, fire, immersion suits, lifebuoys, liferafts and rescue boats$trb$, $trb$Life Saving Appliances – demonstrate your ability to use and instruct the crew on the use of lifesaving appliances including lifejackets, distress flares, fire, immersion suits, lifebuoys, liferafts and rescue boats

Under drill conditions, take charge of an emergency muster.$trb$, $trb$6b17b5add25e5c066c78e7447cbf7fa3a94ecd46f31da104f59c2a0bb6d07d6e$trb$),
  ($trb$MCA-P2-FAM-25$trb$, 25, 35, 35, $trb$PART 2 p.35 task 25$trb$, $trb$Fire Fighting Appliances - demonstrate your ability to use and instruct the crew on the use of portable fire ex tinguishers, fire hoses, nozzles and hydrants, fire fighting outfits, fixed fire$trb$, $trb$Fire Fighting Appliances - demonstrate your ability to use and instruct the crew on the use of portable fire ex tinguishers, fire hoses, nozzles and hydrants, fire fighting outfits, fixed fire

fighting systems and fire pumps. Under drill conditions, take charge of a fire party$trb$, $trb$cba9e00cd2ed722855efa7e310a0024df1db6e5701847e16ba349f826838db31$trb$),
  ($trb$MCA-P2-FAM-26$trb$, 26, 35, 35, $trb$PART 2 p.35 task 26$trb$, $trb$Under supervision, launch the rescue boat, clear away from ship sides, manoeuvre and recover back on board$trb$, $trb$Under supervision, launch the rescue boat, clear away from ship sides, manoeuvre and recover back on board$trb$, $trb$163faac5b950736d07b557e4ec110722b3a1da0bd2ecec59c2f7459851e9848f$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 3: Shipboard Operations
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
  $trb$Shipboard Operations$trb$,
  $trb$PART 2 — SHIPBOARD OPERATIONS
TASKS & ASSIGNMENTS for shipboard operations and safe working practice at the operational level.$trb$,
  3,
  $trb$PART 2 / TASKS – Shipboard operations$trb$,
  36,
  44
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Shipboard Operations$trb$
);

UPDATE public.trb_sections s
SET sort_order = 3,
    description = COALESCE(s.description, $trb$PART 2 — SHIPBOARD OPERATIONS
TASKS & ASSIGNMENTS for shipboard operations and safe working practice at the operational level.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 2 / TASKS – Shipboard operations$trb$),
    source_page_start = COALESCE(s.source_page_start, 36),
    source_page_end = COALESCE(s.source_page_end, 44)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Shipboard Operations$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Shipboard Operations$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P2-OPS-01$trb$, 1, 36, 36, $trb$PART 2 p.36 task 1$trb$, $trb$Understand the meaning of common nautical terms$trb$, $trb$Understand the meaning of common nautical terms

Describe the type of your ship, her layout, the equipment and machinery on board using appropriate nautical terminology.$trb$, $trb$11b1639564ec5d5063a19bb192382ab47d0cca575557d5dff3d8083d122f139d$trb$),
  ($trb$MCA-P2-OPS-02$trb$, 2, 36, 36, $trb$PART 2 p.36 task 2$trb$, $trb$Know the contents of the Bosun's store or rope locker$trb$, $trb$Know the contents of the Bosun's store or rope locker

Identify the different warps, ropes, lines and small stuff and describe their use.$trb$, $trb$f79f5bf0bebb2cfe605ede77815bce81ecdf75d3dec40ae2956b0927ab4d1ff5$trb$),
  ($trb$MCA-P2-OPS-03$trb$, 3, 36, 36, $trb$PART 2 p.36 task 3$trb$, $trb$Know the properties and strengths of synthetic ropes in common use$trb$, $trb$Know the properties and strengths of synthetic ropes in common use

Know how you would remove rope from a new coil and prepare it for use. Know the correct means of stowing synthetic ropes.$trb$, $trb$0c704c9cdee84b4452e31c7f15bf314d91781ebc868e2fb7b5b2d4a22b910626$trb$),
  ($trb$MCA-P2-OPS-04$trb$, 4, 36, 36, $trb$PART 2 p.36 task 4$trb$, $trb$Make common splices in 3-strand rope including: eye, back, short and long splices$trb$, $trb$Make common splices in 3-strand rope including: eye, back, short and long splices$trb$, $trb$573047f18556b3e0e2a66c92410f098e3bfecaf8fcc7eff1050809bcb2673223$trb$),
  ($trb$MCA-P2-OPS-05$trb$, 5, 36, 36, $trb$PART 2 p.36 task 5$trb$, $trb$Parcel and Serve a Splice$trb$, $trb$Parcel and Serve a Splice$trb$, $trb$3586ff6b568311e036af2e2272f86a2fd544d6032a3689336db0e94bb157c98d$trb$),
  ($trb$MCA-P2-OPS-06$trb$, 6, 36, 36, $trb$PART 2 p.36 task 6$trb$, $trb$Demonstrate Whippings and Seizings$trb$, $trb$Demonstrate Whippings and Seizings$trb$, $trb$4cb584bfd2d441c116007933f4f5a4129c161ee8ff10eb6011a900dbcbcd552f$trb$),
  ($trb$MCA-P2-OPS-07$trb$, 7, 36, 36, $trb$PART 2 p.36 task 7$trb$, $trb$Make up a heaving line of suitable length, with suitable sized line$trb$, $trb$Make up a heaving line of suitable length, with suitable sized line

Form a monkey's fist or a heaving line knot to one end, and work on a common whipping to the other.$trb$, $trb$41a34e1971133fa93ee192ba00dbc2912508a062088ed40b7cacb37546994599$trb$),
  ($trb$MCA-P2-OPS-08$trb$, 8, 37, 37, $trb$PART 2 p.37 task 8$trb$, $trb$Demonstrate the correct and safe use of stoppers for ropes and wires$trb$, $trb$Demonstrate the correct and safe use of stoppers for ropes and wires$trb$, $trb$162ffb5698613b37ab3ded374847a63872f0bb2b3087cd548bb0b9a3f9764252$trb$),
  ($trb$MCA-P2-OPS-09$trb$, 9, 37, 37, $trb$PART 2 p.37 task 9$trb$, $trb$Obtain the formulae for estimating the approximate breaking stress for different types of rope, wire rope and chain$trb$, $trb$Obtain the formulae for estimating the approximate breaking stress for different types of rope, wire rope and chain

Calculate the breaking stress for the anchor chain cable on board, the wire or rope falls or crane used for handling the tender, and the principal mooring ropes. Given the breaking stress of a rope, describe how you would calculate the safe working load (SWL).$trb$, $trb$7e498885ac5deae5e6b5770895106d6d306556b9cea91d00b6c65a3849d56c41$trb$),
  ($trb$MCA-P2-OPS-10$trb$, 10, 37, 37, $trb$PART 2 p.37 task 10$trb$, $trb$Know the lifting gear on board, and the safe working load of each piece of equipment$trb$, $trb$Know the lifting gear on board, and the safe working load of each piece of equipment$trb$, $trb$4d8af5dcf0437d934ffab30695d2f2588d2cd434cdc3407a3f363ae23cd49a0c$trb$),
  ($trb$MCA-P2-OPS-11$trb$, 11, 37, 37, $trb$PART 2 p.37 task 11$trb$, $trb$Demonstrate the ability to properly reeve a two fold and three fold purchase$trb$, $trb$Demonstrate the ability to properly reeve a two fold and three fold purchase

Identify the hauling and standing parts and securing points$trb$, $trb$46f60534d8bf96908e781f40e04bb4d99ca5b29aed50a982d49aa998364ab9e3$trb$),
  ($trb$MCA-P2-OPS-12$trb$, 12, 37, 37, $trb$PART 2 p.37 task 12$trb$, $trb$Know the precautions to be adopted when launching or recovering a tender$trb$, $trb$Know the precautions to be adopted when launching or recovering a tender

Describe pre-launching checks, procedures for launching and recovery, number of personnel required and the responsibilities of each of the team.$trb$, $trb$62b8a5c9d83af79125b984212a453c3c1d6a9dce9e38308e10043eba3ad950cb$trb$),
  ($trb$MCA-P2-OPS-13$trb$, 13, 37, 37, $trb$PART 2 p.37 task 13$trb$, $trb$Demonstrate spreading and lacing a canvas awning, or dodgers$trb$, $trb$Demonstrate spreading and lacing a canvas awning, or dodgers$trb$, $trb$fef1e37bfdda80d55038a5de3bee49d89596aeea5b98f259d6175f746111bfae$trb$),
  ($trb$MCA-P2-OPS-14$trb$, 14, 37, 37, $trb$PART 2 p.37 task 14$trb$, $trb$Know procedures for securing the ship for sea$trb$, $trb$Know procedures for securing the ship for sea

Detail the additional precautions and measures that should be taken in event of expected heavy weather.$trb$, $trb$956d8523eb0b54f193f8947d2abb331867ff44ddbbb444d529acb7558f2a050c$trb$),
  ($trb$MCA-P2-OPS-15$trb$, 15, 37, 37, $trb$PART 2 p.37 task 15$trb$, $trb$Describe gangway and access boarding arrangements including the correct and safe rigging and procedures for control and recording of persons on –board$trb$, $trb$Describe gangway and access boarding arrangements including the correct and safe rigging and procedures for control and recording of persons on –board$trb$, $trb$8fe8a59f07c0f537231a739ee59eeddf14677d30b11e743eb99d5d5240c59158$trb$),
  ($trb$MCA-P2-OPS-16$trb$, 16, 38, 38, $trb$PART 2 p.38 task 16$trb$, $trb$Understand flag etiquette including: • Difference between the UK red, blue and white ensign$trb$, $trb$Understand flag etiquette including: • Difference between the UK red, blue and white ensign

• Protocol for 'dipping the ensign', when and to whom; • Courtesy flags and their use; • When various flags and ensigns should be flown and for what occasions.$trb$, $trb$8561d9e1f34b48ba84a0fa75a3f0f94577e813424815acbbea24947e41480b32$trb$),
  ($trb$MCA-P2-OPS-17$trb$, 17, 38, 38, $trb$PART 2 p.38 task 17$trb$, $trb$Understand the general procedures for carrying out a deck watch in port at night including with respect to the ISPS Code$trb$, $trb$Understand the general procedures for carrying out a deck watch in port at night including with respect to the ISPS Code

Describe the areas of special concern given the particular nature of your ship and where lying. Detail what reports you would make, to whom, and in which circumstances.$trb$, $trb$676cf7db143e0903cbb743c2f47976e7a8782c590b8c14397318a2198246e689$trb$),
  ($trb$MCA-P2-OPS-18$trb$, 18, 38, 38, $trb$PART 2 p.38 task 18$trb$, $trb$Know the procedures for carrying out a deck watch at anchor at night including with respect to the ISPS Code$trb$, $trb$Know the procedures for carrying out a deck watch at anchor at night including with respect to the ISPS Code

Describe what regular checks you would make, and under what circumstances you would summon assistance.$trb$, $trb$8eab435911f9fd5602b4c70040d6e56adac7ccb75c7583ef999313c419da5db1$trb$),
  ($trb$MCA-P2-OPS-19$trb$, 19, 38, 38, $trb$PART 2 p.38 task 19$trb$, $trb$Under supervision, carry out a deck watch at anchor at night$trb$, $trb$Under supervision, carry out a deck watch at anchor at night$trb$, $trb$c626c880de55de23e80de2d47695512a783cd27b0e5b91efbb623717298cc8b9$trb$),
  ($trb$MCA-P2-OPS-20$trb$, 20, 38, 38, $trb$PART 2 p.38 task 20$trb$, $trb$With respect to tenders and water equipment, understand the periodic maintenance and service checks on engines and electrical installations, how to prevent common engine faults, pre-start, running$trb$, $trb$With respect to tenders and water equipment, understand the periodic maintenance and service checks on engines and electrical installations, how to prevent common engine faults, pre-start, running

checks and post use checks. Describe the requirement for tool kits, spares and lubricants.$trb$, $trb$b4dc45cac51642afb437d54424608ecf03fc1c194303ae9f11d0800ab3fc2183$trb$),
  ($trb$MCA-P2-OPS-21$trb$, 21, 38, 38, $trb$PART 2 p.38 task 21$trb$, $trb$Describe the general arrangement of the engine room in the ship, and identify the main and auxiliary machinery$trb$, $trb$Describe the general arrangement of the engine room in the ship, and identify the main and auxiliary machinery

electrical switchboards; main pipe work systems and sea water shut-off valves.$trb$, $trb$166c754a714577242e69a0deb2995111fbe158eef74e1da7d8d00a7267821d69$trb$),
  ($trb$MCA-P2-OPS-22$trb$, 22, 38, 38, $trb$PART 2 p.38 task 22$trb$, $trb$Describe the bilge pump piping and suction arrangements in the ship for all spaces including engine room, void spaces, storerooms, steering flat and peak spaces including any hand pumping arrangements$trb$, $trb$Describe the bilge pump piping and suction arrangements in the ship for all spaces including engine room, void spaces, storerooms, steering flat and peak spaces including any hand pumping arrangements$trb$, $trb$cef58b5b319797ee5114736385411bf8e25c117b50a591514ecba6a5eeabf6c1$trb$),
  ($trb$MCA-P2-OPS-23$trb$, 23, 39, 39, $trb$PART 2 p.39 task 23$trb$, $trb$Describe the fuel transfer system and pumping arrangements in the ship including location of fuel shut-off valves$trb$, $trb$Describe the fuel transfer system and pumping arrangements in the ship including location of fuel shut-off valves

fuel tank gauges or level indicators; waste tank level indicators and pumping arrangements.$trb$, $trb$5de8b8305a1de4d301151bdf9d173411dc8967550d5704e8e3df9aaf970cb00a$trb$),
  ($trb$MCA-P2-OPS-24$trb$, 24, 39, 39, $trb$PART 2 p.39 task 24$trb$, $trb$Describe the hotel service systems in the ship including heating and ventilation systems, water making systems, domestic pumping and piping arrangements, service lifts and elevators$trb$, $trb$Describe the hotel service systems in the ship including heating and ventilation systems, water making systems, domestic pumping and piping arrangements, service lifts and elevators$trb$, $trb$fac29c8ec81ecde7f844dcdf54a9abe7fc976823e4bcae298384f8e75d9fe31e$trb$),
  ($trb$MCA-P2-OPS-25$trb$, 25, 39, 39, $trb$PART 2 p.39 task 25$trb$, $trb$Know procedures and precautions to be taken and pre-start checks to be made before starting main engines$trb$, $trb$Know procedures and precautions to be taken and pre-start checks to be made before starting main engines

If in port, detail any additional precautions you should take to prevent damage to own or other vessel and/or equipment. Detail any arrangements you would make and any permissions you would seek with the port authorities and others before starting.$trb$, $trb$93158a7135d7ecfba884495c7432912a92112c9c870a8a273681e51a4b09aa89$trb$),
  ($trb$MCA-P2-OPS-26$trb$, 26, 39, 39, $trb$PART 2 p.39 task 26$trb$, $trb$Identify all tank fill points, air pipes and ventilators associated with bunker, water (potable and ballast), bilges and voids$trb$, $trb$Identify all tank fill points, air pipes and ventilators associated with bunker, water (potable and ballast), bilges and voids

Sound and record bunker, water and bilge spaces levels.$trb$, $trb$92aa540c7528bbfcb4f06f9cd541d363a1ac9481d2d53d44b613378e550b3477$trb$),
  ($trb$MCA-P2-OPS-27$trb$, 27, 39, 39, $trb$PART 2 p.39 task 27$trb$, $trb$Understand the vessel procedures for garbage handling, segregation, stowage and disposal both in port and at sea$trb$, $trb$Understand the vessel procedures for garbage handling, segregation, stowage and disposal both in port and at sea

Understand the operation of garbage handling equipment such as compactors, masticators. Understand the records to be kept with respect to garbage disposal.$trb$, $trb$25c208b92dd576a2b8de85390c06f6dbf33e8fe48f5981883b5aa9b8c90f6306$trb$),
  ($trb$MCA-P2-OPS-28$trb$, 28, 39, 39, $trb$PART 2 p.39 task 28$trb$, $trb$Locate a nd operate, inte rnal fire, weathertight and watertight doors, Understand t he haza rds a nd precautions to be ta ken when operating power operated doors (including hydraulic sliding watertight doors$trb$, $trb$Locate a nd operate, inte rnal fire, weathertight and watertight doors, Understand t he haza rds a nd precautions to be ta ken when operating power operated doors (including hydraulic sliding watertight doors

). Describe the circumstances when these doors may be open and should remain closed, both at sea and in port.$trb$, $trb$a766ad8d4ce966389f16d2d4729ecf2b97ec575eba942caac021632b66883b34$trb$),
  ($trb$MCA-P2-OPS-29$trb$, 29, 39, 39, $trb$PART 2 p.39 task 29$trb$, $trb$Locate and operate, external hull opening, including side and stern doors, and hatches$trb$, $trb$Locate and operate, external hull opening, including side and stern doors, and hatches

Understand the hazards a nd precautions to be taken when operating power operated doors and hatches. Describe the circumstances when these doors may be open and should remain closed, both at sea and in port.$trb$, $trb$64578a4a96a5adcc66d689626c9b5ed5ed2424566080d83fd75b1d55747c8065$trb$),
  ($trb$MCA-P2-OPS-30$trb$, 30, 39, 39, $trb$PART 2 p.39 task 30$trb$, $trb$Understand the safe use a nd operation, and precautions to be taken when working with power equipment and tools commonly found on board including paint spray equipment, grinding and buffing machines,$trb$, $trb$Understand the safe use a nd operation, and precautions to be taken when working with power equipment and tools commonly found on board including paint spray equipment, grinding and buffing machines,

compressors and high pressure washing equipment. Discuss the advantages and disa dvantages of air tools against electric powe r tools. Describe the appropriate personal protective equipment to be worn when using this various equipment.$trb$, $trb$a654ace455560028525920f1151e341d1c013b14120c2e6967c6211f50de343c$trb$),
  ($trb$MCA-P2-OPS-31$trb$, 31, 40, 40, $trb$PART 2 p.40 task 31$trb$, $trb$Understand the safe use, operation, and precautions to be taken when working with hand tools such as hammer, chisel, knife, hac k saw, screwdriver, pliers, wire cutters, file or rasp, fid, sock et$trb$, $trb$Understand the safe use, operation, and precautions to be taken when working with hand tools such as hammer, chisel, knife, hac k saw, screwdriver, pliers, wire cutters, file or rasp, fid, sock et

set, open ended spanners, ring spanners, electric drill, batt ery drill, grinder, power saw. Describe the appropriate personal protective equipment to be worn when using this various equipment.$trb$, $trb$c6129a8f74b0cafc3b1213ee64bc11050caf03287f6930af8974a9a2b2b7e799$trb$),
  ($trb$MCA-P2-OPS-32$trb$, 32, 40, 40, $trb$PART 2 p.40 task 32$trb$, $trb$Understand the arrangements for correct storage and care of powe r and hand tools, and describe the maintenance, inspection and service requirements$trb$, $trb$Understand the arrangements for correct storage and care of powe r and hand tools, and describe the maintenance, inspection and service requirements$trb$, $trb$9d04ad21b3466afaa031a2004cbbaef85921b370aa2a22fe4d934f7b3069718a$trb$),
  ($trb$MCA-P2-OPS-33$trb$, 33, 40, 40, $trb$PART 2 p.40 task 33$trb$, $trb$Understand the precautions to be observed when handling chemical agents su ch as cleaning fluids, rust remover, etc$trb$, $trb$Understand the precautions to be observed when handling chemical agents su ch as cleaning fluids, rust remover, etc

Describe wh ere details of precautions, storage, handling, use, and any medical treatment that may be required following contact, inhalation or ingestion may be found$trb$, $trb$d66bb5dc1e869507fdf1d8562565e790355fb63c7f6cf8189b0c42e6a867de13$trb$),
  ($trb$MCA-P2-OPS-34$trb$, 34, 40, 40, $trb$PART 2 p.40 task 34$trb$, $trb$Understand the procedures to be followed and precautions to be observed when carrying out a full wash down of the ship's decks and superstructure$trb$, $trb$Understand the procedures to be followed and precautions to be observed when carrying out a full wash down of the ship's decks and superstructure

Detail the precautions to adopt to eliminate risk to personnel, avoid pollution, and to minimise effect to adjacent ships. List the measures you would take to avoid ingress of water and damage to wood decks, surface finishes or equipment.$trb$, $trb$a0bf8a03e46d368972b1a113cfdead682c3d510837dd568e0fd4806b1c1ff246$trb$),
  ($trb$MCA-P2-OPS-35$trb$, 35, 40, 40, $trb$PART 2 p.40 task 35$trb$, $trb$Know the contents of the paint locker, and use of the different products$trb$, $trb$Know the contents of the paint locker, and use of the different products

Understand the significance of product shelf life. Read product data sheets for details of storage, safe handling and application. Determine the use of varying products including: • Products for wood, steel, aluminium, GRP etc; • types of primers, fillers, undercoats and topcoats; • which paints and varnishes are to be used with which thinners; • which products are used by themselves or with their thinners (single part products); and • which are twin pack epoxy based products which require a catalyst. Describe the advantages and disadvantages of various paint and coating systems, and particular safety precautions to be taken when handling or using the different products.$trb$, $trb$728f93048fd029e62acc25c008e833a85a050b824bb80d07c011c742ec75feb7$trb$),
  ($trb$MCA-P2-OPS-36$trb$, 36, 40, 40, $trb$PART 2 p.40 task 36$trb$, $trb$Describe the surface preparation for various surfaces prior to coating including the safe and proper use of appropriate equipment such as, and including, power tools (grinders rotary, orbital and belt and sanders$trb$, $trb$Describe the surface preparation for various surfaces prior to coating including the safe and proper use of appropriate equipment such as, and including, power tools (grinders rotary, orbital and belt and sanders

); sandpapers, wet-or-dry rubbing paper of differing grades and coarseness.$trb$, $trb$6dcb25f70ef3dfdeefa3c64c2cb6e7d42e536a0c1f9a26d377ef9ab581261e55$trb$),
  ($trb$MCA-P2-OPS-37$trb$, 37, 41, 41, $trb$PART 2 p.41 task 37$trb$, $trb$Describe the various methods of paint application including the safe and proper use of paint spray equipment (airless and conventional$trb$, $trb$Describe the various methods of paint application including the safe and proper use of paint spray equipment (airless and conventional

); brushes and rollers (various types, shape and size); masking tapes. Describe the personal protective equipment that must be worn when applying paint by various means of application including any additional precautions necessary when painting in enclosed spaces.$trb$, $trb$15b05bc8a3806fcd2f7b24ce91476c4ef0379d9b1066e9f049e39e41d1d4d1bc$trb$),
  ($trb$MCA-P2-OPS-38$trb$, 38, 41, 41, $trb$PART 2 p.41 task 38$trb$, $trb$Describe the process for preparation and painting of an item of deck equipment$trb$, $trb$Describe the process for preparation and painting of an item of deck equipment

Detail the products you would use and the precautions you would adopt to eliminate risk to personnel, avoid pollution, minimise upset to other ships, and to avoid spills or damage. List the safety products or equipment you would have in place to cope with any spills or accidents. Give estimates of preparation, application and drying times, and a proposed starting time for the job.$trb$, $trb$bdb42541700d67c29edefc6e339c0923a59099cc49b21020d4fa9a28c249306d$trb$),
  ($trb$MCA-P2-OPS-39$trb$, 39, 41, 41, $trb$PART 2 p.41 task 39$trb$, $trb$Describe how you would deal with a spillage of petrol, solvent or other chemical on deck so as to prevent fire and/or eliminate risk to personnel and avoid pollution$trb$, $trb$Describe how you would deal with a spillage of petrol, solvent or other chemical on deck so as to prevent fire and/or eliminate risk to personnel and avoid pollution$trb$, $trb$e441027d1503e0b32ed68ef47ae8b5ce9779cd240a161c941ba755c36960fea8$trb$),
  ($trb$MCA-P2-OPS-40$trb$, 40, 41, 41, $trb$PART 2 p.41 task 40$trb$, $trb$Demonstrate a thorough knowledge of the Code of Safe Working Practices for Merchant Seamen Code by detailing the requirements or recommendations relating various operations, including: • Protective clothing and equipment$trb$, $trb$Demonstrate a thorough knowledge of the Code of Safe Working Practices for Merchant Seamen Code by detailing the requirements or recommendations relating various operations, including: • Protective clothing and equipment

• Safety signs and to include standard signs for dangerous goods, pipe lines, fire extinguishers and gas cylinders; • Safety induction; • Fire precautions; • Emergency procedures; • Safe movement on board ship; • Working aloft and outboard; • Work in machinery spaces; • Permit to work; • Enclosed spaces; • Boarding arrangements; • Manual lifting and carrying; • Use of work equipment; • Lifting plant; • Hydraulic and pneumatic equipment; • Batteries; Painting; • Anchoring and mooring; • Hatches; • Hazardous substances.$trb$, $trb$b7a889216ce42a6886eac88688179335ec8358d23e5c1456d97eb5a87f14eede$trb$),
  ($trb$MCA-P2-OPS-41$trb$, 41, 42, 42, $trb$PART 2 p.42 task 41$trb$, $trb$ASSIGNMENTS SATISFACTORY COMPLETION OF ASSIGNMENT WITNESSED Under supervision, secure the ship for sea including the stowage and securing of gear above and below deck$trb$, $trb$ASSIGNMENTS SATISFACTORY COMPLETION OF ASSIGNMENT WITNESSED Under supervision, secure the ship for sea including the stowage and securing of gear above and below deck$trb$, $trb$2cdf1ace004eb47dae6d46be56b11769068c010d520af0fe21bcaf6d2db560cb$trb$),
  ($trb$MCA-P2-OPS-42$trb$, 42, 42, 42, $trb$PART 2 p.42 task 42$trb$, $trb$Under supervision, carry out a deck watch in port at night$trb$, $trb$Under supervision, carry out a deck watch in port at night$trb$, $trb$b871eab067f6ffe40e66589a81d43a53d2912d73d6dfbb95e5cbbab5c583ac38$trb$),
  ($trb$MCA-P2-OPS-43$trb$, 43, 42, 42, $trb$PART 2 p.42 task 43$trb$, $trb$Under supervision, and with use of a check list, carry out pre-start checks in engine room$trb$, $trb$Under supervision, and with use of a check list, carry out pre-start checks in engine room

Start the main engines from the engine room or bridge. Monitor the running. Shut down. Secure engines.$trb$, $trb$98befadaa1d2cdb7fe0bcd7b2e3049dcbceafbe1951aab487624e696153f307a$trb$),
  ($trb$MCA-P2-OPS-44$trb$, 44, 42, 42, $trb$PART 2 p.42 task 44$trb$, $trb$Under supervision, take charge of the team and carry out a full wash down of the ship's decks and superstructure$trb$, $trb$Under supervision, take charge of the team and carry out a full wash down of the ship's decks and superstructure$trb$, $trb$860f8eb3fa51548a04172b32e3a785568095745f39a144bbe7925eb20ce8c664$trb$),
  ($trb$MCA-P2-OPS-45$trb$, 45, 42, 42, $trb$PART 2 p.42 task 45$trb$, $trb$Under supervision, carry out the preparation and painting of a piece of deck equipment$trb$, $trb$Under supervision, carry out the preparation and painting of a piece of deck equipment

Observe all the relevant safety procedures. Clean and stow re-useable brushes, equipment and product when completed. Safely dispose of waste materials and product so as to ensure no danger to persons and to avoid pollution to the marine or land environment.$trb$, $trb$29f2ac24361e6e2604447bbd5282c15a4fd8db0e9a515e374a71b0db2bab1755$trb$),
  ($trb$MCA-P2-OPS-46$trb$, 46, 42, 42, $trb$PART 2 p.42 task 46$trb$, $trb$LAUNCH AND TENDER DRIVING Under supervision safely prepare, launch and embark a tender, including: • Crew safety brief, both launching and operating crew$trb$, $trb$LAUNCH AND TENDER DRIVING Under supervision safely prepare, launch and embark a tender, including: • Crew safety brief, both launching and operating crew

Establish manning levels; • Pre-check of launching equipment, tender, equipment (including emergency and survival equipment), fuel and engine(s); • Pre-departure checks (including relevant local regulations, weather forecast, trip duration, tender range, communications etc.); • Emergency procedures and means of summoning assistance; • Lower and launch the tender and secure alongside the ship; • Secure the launch crane or davits. • Safely embark and clear safely from the ships side.$trb$, $trb$1f88e7510d497d8f7a0b0a20422682a2d818e6d26140512f1e1a2b62dede4790$trb$),
  ($trb$MCA-P2-OPS-47$trb$, 47, 43, 43, $trb$PART 2 p.43 task 47$trb$, $trb$ASSIGNMENTS SATISFACTORY COMPLETION OF ASSIGNMENT WITNESSED Under supervision, un-berth and safely manoeuvre a tender including: • Communicate effectively with the crew$trb$, $trb$ASSIGNMENTS SATISFACTORY COMPLETION OF ASSIGNMENT WITNESSED Under supervision, un-berth and safely manoeuvre a tender including: • Communicate effectively with the crew

• Use of springs to depart from lee side; • Manoeuvre alongside a gangway or over side ladder; • Manoeuvre in a confined space, including 360P 0 P turn; and • Position fenders and warps correctly.$trb$, $trb$74fb1e393d3d226c6e939a07e6900018021e7b3ca9807f612487e9b629788f6f$trb$),
  ($trb$MCA-P2-OPS-48$trb$, 48, 43, 43, $trb$PART 2 p.43 task 48$trb$, $trb$Under supervision, safely secure a tender to a buoy including: • Communicate effectively with crew$trb$, $trb$Under supervision, safely secure a tender to a buoy including: • Communicate effectively with crew

• Preparation and use of warps and fenders; • Choice of correct speed and angle of approach; • Secure boat effectively; and • Depart from the mooring safely.$trb$, $trb$2c7771aed682abd96ada6ea859355f6ad4204c5c74d069f4be230df57e1b884f$trb$),
  ($trb$MCA-P2-OPS-49$trb$, 49, 43, 43, $trb$PART 2 p.43 task 49$trb$, $trb$Under supervision conduct a man overboard recovery using tender or rescue boat including: • Communicate effectively with crew$trb$, $trb$Under supervision conduct a man overboard recovery using tender or rescue boat including: • Communicate effectively with crew

• Preparation for recovery on board; • Correct approach to casualty; • Correct speed of approach to make recovery; • Recover and tend the MOB; and • Transfer casualty to mother ship.$trb$, $trb$57f7e07acc0a203efe351abd4df0785d630222ba7825bbea59b5e0588849afd9$trb$),
  ($trb$MCA-P2-OPS-50$trb$, 50, 43, 43, $trb$PART 2 p.43 task 50$trb$, $trb$Under supervision conduct high speed manoeuvres (if appropriate) including: • Communicate effectively with crew before and during manoeuvres$trb$, $trb$Under supervision conduct high speed manoeuvres (if appropriate) including: • Communicate effectively with crew before and during manoeuvres

• Use kill-cord if appropriate; • Choose suitable area; • Show awareness of other water users; • Display lateral awareness during manoeuvres; and • Perform an emergency stop.$trb$, $trb$a4aaadd50f1252f0043305a5c5ba14c27574dcb3b3c70fd40f446379c46976ba$trb$),
  ($trb$MCA-P2-OPS-51$trb$, 51, 44, 44, $trb$PART 2 p.44 task 51$trb$, $trb$ASSIGNMENTS SATISFACTORY COMPLETION OF ASSIGNMENT WITNESSED Under supervision manoeuvre alongside a windward pontoon or swimming platform including: • Communicate effectively with crew$trb$, $trb$ASSIGNMENTS SATISFACTORY COMPLETION OF ASSIGNMENT WITNESSED Under supervision manoeuvre alongside a windward pontoon or swimming platform including: • Communicate effectively with crew

• Awareness of other water users; • Preparation and use of warps and fenders; • Choice of correct speed and angle of approach; • Positioning the tender in the place required; and • Secure to pontoon/swimming platform. Stop engine.$trb$, $trb$15f048d97c097584f9537c1cf1db0a7a1fd2a4c203b0f64a082b75c32bc06a46$trb$),
  ($trb$MCA-P2-OPS-52$trb$, 52, 44, 44, $trb$PART 2 p.44 task 52$trb$, $trb$Under supervision safely disembark the tender including: • Manoeuvre and secure alongside$trb$, $trb$Under supervision safely disembark the tender including: • Manoeuvre and secure alongside

• Secure boat correctly and safely; • Make allowance for any changes in tidal stream or height; • Clear away and stow gear; • Disembark guest and crew in an orderly and seamanlike manner, giving due consideration to the danger of standing up in a boat.$trb$, $trb$ee72f9c9487209a6b1a1efcb39a7e88739375a6c7503e3ce24ca52282b307916$trb$),
  ($trb$MCA-P2-OPS-53$trb$, 53, 44, 44, $trb$PART 2 p.44 task 53$trb$, $trb$Under supervision, take charge of the team for recovering the tender$trb$, $trb$Under supervision, take charge of the team for recovering the tender

Recover the tender and lift on board. Stow ready for sea and secure. Secure crane or davits.$trb$, $trb$bf3d0540728e4d868d829c18da56b8725123c63ad98aeb9819a62450b0863627$trb$),
  ($trb$MCA-P2-OPS-54$trb$, 54, 44, 44, $trb$PART 2 p.44 task 54$trb$, $trb$TENDER/DINGY HANDLING UNDER SAIL (IF APPROPRIATE) - Sail triangular course with one leg to windward$trb$, $trb$TENDER/DINGY HANDLING UNDER SAIL (IF APPROPRIATE) - Sail triangular course with one leg to windward

choose suitable area for hoisting/lowering sails. Use sails suitable for prevailing conditions. Show awareness of wind direction. Trim sails correctly on each point of sailing. Warn crew before manoeuvres. Look round before tacking and gybing. Control sails during tacking and gybing.$trb$, $trb$ee23fa12cfd4cf1614f1500b0c4c48ab50852233dca7085b9bc454b12c671bc3$trb$),
  ($trb$MCA-P2-OPS-55$trb$, 55, 44, 44, $trb$PART 2 p.44 task 55$trb$, $trb$the tender/dingy including tacking and gybing$trb$, $trb$the tender/dingy including tacking and gybing

Use correct orders and control sail during tacking and gibing. Warn crew members before carrying out a manoeuvre.$trb$, $trb$6870721da7d638dc9f069d2b26a825f4377c583de775478638d12c7a2a85a712$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 4: Shipboard Operations – Sailing and Sail Training Vessels Only
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
  $trb$Shipboard Operations – Sailing and Sail Training Vessels Only$trb$,
  $trb$PART 2 — SHIPBOARD OPERATIONS – SAILING AND SAIL TRAINING VESSELS ONLY
Additional yacht-specific tasks for sailing / sail training vessels.$trb$,
  4,
  $trb$PART 2 / TASKS – Shipboard operations (sailing and sail training vessels only)$trb$,
  45,
  48
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Shipboard Operations – Sailing and Sail Training Vessels Only$trb$
);

UPDATE public.trb_sections s
SET sort_order = 4,
    description = COALESCE(s.description, $trb$PART 2 — SHIPBOARD OPERATIONS – SAILING AND SAIL TRAINING VESSELS ONLY
Additional yacht-specific tasks for sailing / sail training vessels.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 2 / TASKS – Shipboard operations (sailing and sail training vessels only)$trb$),
    source_page_start = COALESCE(s.source_page_start, 45),
    source_page_end = COALESCE(s.source_page_end, 48)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Shipboard Operations – Sailing and Sail Training Vessels Only$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Shipboard Operations – Sailing and Sail Training Vessels Only$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P2-SAIL-01$trb$, 1, 45, 45, $trb$PART 2 p.45 task 1$trb$, $trb$As officer of the watch of a Sailing Yacht, or a Sail Training Ship, your actions will affect the safety of others - especially young persons - that may be working on deck or aloft$trb$, $trb$As officer of the watch of a Sailing Yacht, or a Sail Training Ship, your actions will affect the safety of others - especially young persons - that may be working on deck or aloft

Special consideration should be given to the following tasks and assignments to enable the prospective officer to practice (under supervision) manoeuvring the ship under sail. Understand sailing vessel terminology.$trb$, $trb$408f39f1f55311fbd3c96f9169a2e1dd5b315f359d3d2fe04c0e693d0d697a98$trb$),
  ($trb$MCA-P2-SAIL-02$trb$, 2, 45, 45, $trb$PART 2 p.45 task 2$trb$, $trb$Demonstrate an understanding of the use of safety harnesses and life lines both on deck and aloft$trb$, $trb$Demonstrate an understanding of the use of safety harnesses and life lines both on deck and aloft

Discuss the rigging of safety lines, and when and where you would rig them.$trb$, $trb$d4398675153d4bfb9d43408d1fa99143117d5a498dc2d2bfe74c32277a2d38fc$trb$),
  ($trb$MCA-P2-SAIL-03$trb$, 3, 45, 45, $trb$PART 2 p.45 task 3$trb$, $trb$Understand the precautions and procedures to be taken when moving around on deck, working and handling ropes$trb$, $trb$Understand the precautions and procedures to be taken when moving around on deck, working and handling ropes$trb$, $trb$20fa33bfd3b273f98979c4543716c037887e85603e12b89f285850d941abb1f0$trb$),
  ($trb$MCA-P2-SAIL-04$trb$, 4, 45, 45, $trb$PART 2 p.45 task 4$trb$, $trb$Understand the precautions and procedures to be taken when working aloft, the induction training and safety precautions you would adopt before sending trainees aloft$trb$, $trb$Understand the precautions and procedures to be taken when working aloft, the induction training and safety precautions you would adopt before sending trainees aloft$trb$, $trb$d72e76f8e3f5097bdabd90044b0abbb1fab476c17ac859158ece7e73490e84c2$trb$),
  ($trb$MCA-P2-SAIL-05$trb$, 5, 45, 45, $trb$PART 2 p.45 task 5$trb$, $trb$Demonstrate confidence and ability to work aloft, including taking of proper safety precautions to protect the safety of yourself and others$trb$, $trb$Demonstrate confidence and ability to work aloft, including taking of proper safety precautions to protect the safety of yourself and others$trb$, $trb$a93ae0bfc1a7d1c0dc10e7519d8bcb3a3ffef7704f1b514e4bfec5ed3b25a51c$trb$),
  ($trb$MCA-P2-SAIL-06$trb$, 6, 45, 45, $trb$PART 2 p.45 task 6$trb$, $trb$Demonstrate a knowledge and ability to set and hand all sails including the order for setting and shortening sail$trb$, $trb$Demonstrate a knowledge and ability to set and hand all sails including the order for setting and shortening sail$trb$, $trb$859745a3c28f9d203877d20bd4e48743519e0717ca7e6809f4aec7a2a2aea975$trb$),
  ($trb$MCA-P2-SAIL-07$trb$, 7, 45, 45, $trb$PART 2 p.45 task 7$trb$, $trb$Demonstrate your ability to set the appropriate sail plan for expected prevailing conditions including coping with squalls and the precautions to be taken in squally weather$trb$, $trb$Demonstrate your ability to set the appropriate sail plan for expected prevailing conditions including coping with squalls and the precautions to be taken in squally weather$trb$, $trb$4100373c79b7533e388d01f3898b479c40ecab95765f56d99abbf4a4bb1fb40f$trb$),
  ($trb$MCA-P2-SAIL-08$trb$, 8, 46, 46, $trb$PART 2 p.46 task 8$trb$, $trb$Monitor weather forecasts and discuss the precautions you would take on the receipt of a weather forecast which indicated a worsening weather situation$trb$, $trb$Monitor weather forecasts and discuss the precautions you would take on the receipt of a weather forecast which indicated a worsening weather situation$trb$, $trb$b2b39fe6d0c680c3be1af44f287351592c72133bb230215c62a056373b9a8272$trb$),
  ($trb$MCA-P2-SAIL-09$trb$, 9, 46, 46, $trb$PART 2 p.46 task 9$trb$, $trb$Demonstrate the ability to set and hand sail underway to suit changing conditions including the order for handing and setting sails$trb$, $trb$Demonstrate the ability to set and hand sail underway to suit changing conditions including the order for handing and setting sails$trb$, $trb$67dda9f5ad25bc670e4b22e7f4bf1ac47c9ec0e6a5cd6e396b41edba2aae6f85$trb$),
  ($trb$MCA-P2-SAIL-10$trb$, 10, 46, 46, $trb$PART 2 p.46 task 10$trb$, $trb$Demonstrate the ability to reef and reduce sails according to anticipated conditions$trb$, $trb$Demonstrate the ability to reef and reduce sails according to anticipated conditions$trb$, $trb$00d9d384d6531e43ba77845e772615595ad5f363eeef9e16375e24e2fb8d751a$trb$),
  ($trb$MCA-P2-SAIL-11$trb$, 11, 46, 46, $trb$PART 2 p.46 task 11$trb$, $trb$Demonstrate your ability to set storm canvas, and discuss other precautions you would take to best protect the crew and trainees in case of storm$trb$, $trb$Demonstrate your ability to set storm canvas, and discuss other precautions you would take to best protect the crew and trainees in case of storm$trb$, $trb$e6769a2fcbda56131252961572048fb7e2d0430508136c6c9f4d868b511b53da$trb$),
  ($trb$MCA-P2-SAIL-12$trb$, 12, 46, 46, $trb$PART 2 p.46 task 12$trb$, $trb$Understand the precautions and actions necessary to prepare the vessel, crew and trainees for heavy weather$trb$, $trb$Understand the precautions and actions necessary to prepare the vessel, crew and trainees for heavy weather

Discuss the arrangements you would make for meals and rest periods for the crew and trainees on board.$trb$, $trb$cc4e4f6a8d1e89708fd641f5aad8f1c6e2a8715956c076a83f90b4c87a7602a8$trb$),
  ($trb$MCA-P2-SAIL-13$trb$, 13, 46, 46, $trb$PART 2 p.46 task 13$trb$, $trb$Detail the actions to be taken by the crew and trainees in event of 'knock-down'$trb$, $trb$Detail the actions to be taken by the crew and trainees in event of 'knock-down'$trb$, $trb$086d622b0a1529030221b6c9e20d2d214c4bccbc445c09446c5c0fdcb091b04c$trb$),
  ($trb$MCA-P2-SAIL-14$trb$, 14, 46, 46, $trb$PART 2 p.46 task 14$trb$, $trb$Understand watchkeeping arrangements underway to ensure that there are sufficient hands to maintain both a safe navigational watch and hand/set sails (including arrangements for meal reliefs etc$trb$, $trb$Understand watchkeeping arrangements underway to ensure that there are sufficient hands to maintain both a safe navigational watch and hand/set sails (including arrangements for meal reliefs etc

).$trb$, $trb$b6bbe51346fa034bc7a695ed0a6574518874a5fa7bf8b1b9e976606703876e8f$trb$),
  ($trb$MCA-P2-SAIL-15$trb$, 15, 46, 46, $trb$PART 2 p.46 task 15$trb$, $trb$Demonstrate knowledge of tacking$trb$, $trb$Demonstrate knowledge of tacking$trb$, $trb$1f4fe402cf4aa15282fcd590d866914a6f66fcf82c22840d247cb3e101f153f7$trb$),
  ($trb$MCA-P2-SAIL-16$trb$, 16, 47, 47, $trb$PART 2 p.47 task 16$trb$, $trb$Demonstrate knowledge of wearing or gybing$trb$, $trb$Demonstrate knowledge of wearing or gybing$trb$, $trb$6d2a8f0e0ebb6cfb64d83f5f1e54a770344833e6907642f2fdfcd8b5978bb5ce$trb$),
  ($trb$MCA-P2-SAIL-17$trb$, 17, 47, 47, $trb$PART 2 p.47 task 17$trb$, $trb$Demonstrate knowledge of heaving to$trb$, $trb$Demonstrate knowledge of heaving to$trb$, $trb$5d467774a301a50054ebe7d7a0e0269465a1f95c107801bae290f03f6aaa779a$trb$),
  ($trb$MCA-P2-SAIL-18$trb$, 18, 47, 47, $trb$PART 2 p.47 task 18$trb$, $trb$Demonstrate an understanding of the action on being caught aback$trb$, $trb$Demonstrate an understanding of the action on being caught aback$trb$, $trb$79d3c88fc00066ea268f0c37a32b30a9a04a7e7952e023c388db866b9789108a$trb$),
  ($trb$MCA-P2-SAIL-19$trb$, 19, 47, 47, $trb$PART 2 p.47 task 19$trb$, $trb$Demonstrate an understanding of a 'crash-stop' with the vessel under sail$trb$, $trb$Demonstrate an understanding of a 'crash-stop' with the vessel under sail$trb$, $trb$6f6c679f1996a7f1952083999a81902bff701d8c557b1d871edcd294d4856fcc$trb$),
  ($trb$MCA-P2-SAIL-20$trb$, 20, 47, 47, $trb$PART 2 p.47 task 20$trb$, $trb$Demonstrate an understanding of the recovering a man overboard under sail$trb$, $trb$Demonstrate an understanding of the recovering a man overboard under sail$trb$, $trb$98d210c55286eff32afec6b72eee106dabcff517afceaf29de15cd8f0eaab6f5$trb$),
  ($trb$MCA-P2-SAIL-21$trb$, 21, 47, 47, $trb$PART 2 p.47 task 21$trb$, $trb$Describe the procedures and equipment required for a rescue from aloft$trb$, $trb$Describe the procedures and equipment required for a rescue from aloft

Participate in a rescue from aloft drill.$trb$, $trb$174d49cec1ca451db4b533123e3b4e61ee975b752b7d99550bf35d4dd454a9ba$trb$),
  ($trb$MCA-P2-SAIL-22$trb$, 22, 47, 47, $trb$PART 2 p.47 task 22$trb$, $trb$Under supervision demonstrate the ability to tack the vessel$trb$, $trb$Under supervision demonstrate the ability to tack the vessel$trb$, $trb$da2da5da959b5037a77af511b325d989c06330a92a00c9f34286dfbefc474af5$trb$),
  ($trb$MCA-P2-SAIL-23$trb$, 23, 48, 48, $trb$PART 2 p.48 task 23$trb$, $trb$ASSIGNMENTS Under supervision demonstrate the ability to wear/gybe the vessel$trb$, $trb$ASSIGNMENTS Under supervision demonstrate the ability to wear/gybe the vessel$trb$, $trb$16e097fee7ac168e03d6262c730199046a89bb579c9770f51cfc02c72b56fce3$trb$),
  ($trb$MCA-P2-SAIL-24$trb$, 24, 48, 48, $trb$PART 2 p.48 task 24$trb$, $trb$Under supervision, demonstrate your ability to anchor the vessel under sail$trb$, $trb$Under supervision, demonstrate your ability to anchor the vessel under sail$trb$, $trb$2a73a5612f81b1a24b964358597b0518b76c49517da9f4aef7301aa4b5a170ea$trb$),
  ($trb$MCA-P2-SAIL-25$trb$, 25, 48, 48, $trb$PART 2 p.48 task 25$trb$, $trb$Under supervision, demonstrate your ability to weigh anchor and leave an anchorage under sail$trb$, $trb$Under supervision, demonstrate your ability to weigh anchor and leave an anchorage under sail$trb$, $trb$2279f17c78025edc25ec065f186fd998d06542579e4169c29e835b6e9bc0f486$trb$),
  ($trb$MCA-P2-SAIL-26$trb$, 26, 48, 48, $trb$PART 2 p.48 task 26$trb$, $trb$Under supervision, and as part of a drill, demonstrate your ability to recover a man overboard under sail$trb$, $trb$Under supervision, and as part of a drill, demonstrate your ability to recover a man overboard under sail$trb$, $trb$70deb25b92b8eb70343d065e6f96b39e9bc10013b231bfbe498688b495215d75$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 5: Plan a Passage and Conduct a Passage and Determine Position
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
  $trb$Plan a Passage and Conduct a Passage and Determine Position$trb$,
  $trb$PART 3 — NAVIGATION AT OPERATIONAL LEVEL
TASKS – Plan a passage and conduct a passage and determine position.$trb$,
  5,
  $trb$PART 3 / TASKS – Plan a passage and conduct a passage and determine position$trb$,
  49,
  54
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Plan a Passage and Conduct a Passage and Determine Position$trb$
);

UPDATE public.trb_sections s
SET sort_order = 5,
    description = COALESCE(s.description, $trb$PART 3 — NAVIGATION AT OPERATIONAL LEVEL
TASKS – Plan a passage and conduct a passage and determine position.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 3 / TASKS – Plan a passage and conduct a passage and determine position$trb$),
    source_page_start = COALESCE(s.source_page_start, 49),
    source_page_end = COALESCE(s.source_page_end, 54)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Plan a Passage and Conduct a Passage and Determine Position$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Plan a Passage and Conduct a Passage and Determine Position$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P3-PASSAGE-01$trb$, 1, 49, 49, $trb$PART 3 p.49 task 1$trb$, $trb$Determine in advance the needs of the intended voyage, taking into consideration the requirements for fuel, water, lubricants, chemicals, expendable and other spare parts, tools, supplies,$trb$, $trb$Determine in advance the needs of the intended voyage, taking into consideration the requirements for fuel, water, lubricants, chemicals, expendable and other spare parts, tools, supplies,

victualling and any other requirements. All the requirements are considered, and any shortages correctly identified.$trb$, $trb$d3e60fee3439b0be4a985d4a7cb8c6cdc740774c6ba68a089432024b35b934f3$trb$),
  ($trb$MCA-P3-PASSAGE-02$trb$, 2, 49, 49, $trb$PART 3 p.49 task 2$trb$, $trb$Calculation of fuel consumption at different speeds$trb$, $trb$Calculation of fuel consumption at different speeds

Estimated fuel consumption is correctly calculated.$trb$, $trb$7f2d6f845b046c9578fc7439abc0240e4d820f9e15e6d8d1927ec903bf32d698$trb$),
  ($trb$MCA-P3-PASSAGE-03$trb$, 3, 49, 49, $trb$PART 3 p.49 task 3$trb$, $trb$Select charts of adequate scale$trb$, $trb$Select charts of adequate scale

The use of: The Admiralty navigational chart folio system; Admiralty charts including mercator and gnomonic charts; Electronic navigational charts, including ECDIS and raster systems. The charts selected are the largest scale suitable for the area of navigation.$trb$, $trb$c19ececf4546700ab6ac05f5762941c09f29246b38e40e279e483ecdae4382d1$trb$),
  ($trb$MCA-P3-PASSAGE-04$trb$, 4, 49, 49, $trb$PART 3 p.49 task 4$trb$, $trb$Chart corrections Chart corrections (including navigation warnings, and temporary and preliminary corrections$trb$, $trb$Chart corrections Chart corrections (including navigation warnings, and temporary and preliminary corrections

). Admiralty Notices to Mariners.and the chart correction system. Charts are corrected in accordance with the latest information available.$trb$, $trb$068d14759c1bbf69ee616663ab7b4fa468f03e4f12993ffd3bab77ba7791d9a4$trb$),
  ($trb$MCA-P3-PASSAGE-05$trb$, 5, 49, 49, $trb$PART 3 p.49 task 5$trb$, $trb$Corrections to Admiralty Publications Publication corrections including List of Radio Signals, List of Lights and Pilot books$trb$, $trb$Corrections to Admiralty Publications Publication corrections including List of Radio Signals, List of Lights and Pilot books

Publications are corrected in accordance with the latest information available.$trb$, $trb$4cca9adeeb7e13f6b847188c591302786f1032c5283b3fa299ed0470fd771d7e$trb$),
  ($trb$MCA-P3-PASSAGE-06$trb$, 6, 50, 50, $trb$PART 3 p.50 task 6$trb$, $trb$Consult nautical publications$trb$, $trb$Consult nautical publications

Sources and use of navigational information, including: Admiralty List of Lights and Fog Signals; Admiralty Tide Tables; Admiralty Tidal Stream Atlas; Admiralty Sailing Directions (Pilots); Admiralty List of Radio Signals; Admiralty Distance Tables; Routing charts; and Admiralty Notices to Mariners. The information obtained from navigational charts and publications is relevant, interpreted correctly and properly applied. All potential navigational hazards are accurately identified.$trb$, $trb$0be89a4841c4a3ab7dbc8e685bdac5db5bf38b79c9e41d7a8c682a8612e2688e$trb$),
  ($trb$MCA-P3-PASSAGE-07$trb$, 7, 50, 50, $trb$PART 3 p.50 task 7$trb$, $trb$Obtain weather forecast Sources of meteorological information, ability to use and interpret information obtained from ship borne meteorological instruments, knowledge of characteristics of various$trb$, $trb$Obtain weather forecast Sources of meteorological information, ability to use and interpret information obtained from ship borne meteorological instruments, knowledge of characteristics of various

weather systems, reporting and recording systems. A suitable forecast for the intended passage is obtained, and the information is correctly interpreted.$trb$, $trb$e74e4257114443381839e51daeddb1054de6907785233942c9d3139d9ac546ea$trb$),
  ($trb$MCA-P3-PASSAGE-08$trb$, 8, 50, 50, $trb$PART 3 p.50 task 8$trb$, $trb$Set courses. Use of parallel rulers, dividers and proprietary plotting instruments$trb$, $trb$Set courses. Use of parallel rulers, dividers and proprietary plotting instruments

Interpret information shown on charts, chart symbols, longitude and latitude, and representation of direction and distance. Ability to apply meteorological information available. The use of routing in accordance with the General Provisions on Ship's Routing. The courses are suitably set in respect of the ship’s size, draft and manoeuvrability, and set with sufficient distance off shallow waters, banks and other dangers to navigation. Due consideration is given to current, ice, prevailing meteorological conditions and routing and traffic separation schemes.$trb$, $trb$2faa25d019b52e6f3280651ab7d1b3792f6786ffdd63805764de7e98c4016886$trb$),
  ($trb$MCA-P3-PASSAGE-09$trb$, 9, 50, 50, $trb$PART 3 p.50 task 9$trb$, $trb$Make a pilotage plan for departure and arrival$trb$, $trb$Make a pilotage plan for departure and arrival

IALA systems of maritime buoyage for Regions A and B. Use of transits, leading lines and clearing lines. Pilotage plans and harbour regulations. Tidal considerations: Use of appropriate publications: Port & Operational communications. Available aids to pilotage are identified. Buoyage is correctly identified. Harbour regulations are respected.$trb$, $trb$f91f59036345ae897e7336386e60f80952908c54bcfd17f9e014c40e8ecb5f70$trb$),
  ($trb$MCA-P3-PASSAGE-10$trb$, 10, 51, 51, $trb$PART 3 p.51 task 10$trb$, $trb$determine position Calculate estimated time of arrival (ETA$trb$, $trb$determine position Calculate estimated time of arrival (ETA

). Speed of the ship. Effect of prevailing and predicted tides, currents, weather, visibility upon course and speed. Tidal stream information. Times of tides. The total distance is correctly calculated and ETA given within acceptable time limits.$trb$, $trb$52d759e2d242334505586751c2daba48ca96e48b82743aa98c63c54f8aa7c465$trb$),
  ($trb$MCA-P3-PASSAGE-11$trb$, 11, 51, 51, $trb$PART 3 p.51 task 11$trb$, $trb$Determine and apply compass error for courses and compass bearings$trb$, $trb$Determine and apply compass error for courses and compass bearings

1. Basic principals of magnetic and gyro- compasses. 2. Ability to determine errors of the magnetic and gyro-compasses, using terrestrial means, and to allow for such errors. 3. The Magnetic Compass: Allowance for variation. Change of variation with time and position. Siting compass and causes of deviation. Allowance for deviation. Steering and hand bearing compasses. Swing for deviation. Use of the ship's Deviation Card. 4. The Gyro Compass: Correction for error which depends on the ship's course, speed and latitude. The need to frequently compare the magnetic and gyro-compasses, and synchronise repeaters with their master compass. 5. The use of the Compass Error Book. Errors in magnetic and gyro compasses are determined and correctly applied to courses and bearings.$trb$, $trb$76bd0a3ef0349b7df20c87ddc0f9dc220c4e152b14bebe5e982c0a8497d98400$trb$),
  ($trb$MCA-P3-PASSAGE-12$trb$, 12, 52, 52, $trb$PART 3 p.52 task 12$trb$, $trb$determine position (continued) Recognise conspicuous objects and other terrestrial aids to navigation in daylight and at night$trb$, $trb$determine position (continued) Recognise conspicuous objects and other terrestrial aids to navigation in daylight and at night

IALA systems of maritime buoyage. Information shown on charts, chart symbols. Use of navigational information given in nautical publications. Sources and use of radio navigational warnings. The information obtained from navigational charts and publications is relevant, interpreted correctly and properly applied. All potential navigational hazards are accurately identified.$trb$, $trb$013f8c97c57c9f72dfab24d53d13f88d6a4b93b7020a1c28c293a71e85ccc934$trb$),
  ($trb$MCA-P3-PASSAGE-13$trb$, 13, 52, 52, $trb$PART 3 p.52 task 13$trb$, $trb$Establish position by terrestrial observations, i.e$trb$, $trb$Establish position by terrestrial observations, i.e

lighthouses, buoys and beacons. Techniques of visual position fixing. Running Fixes. Ranges by Dipping Distances. Use of an azimuth mirror, pelorus, and hand bearing compass for taking bearings. The position is determined within the limits of acceptable instrument/system errors.$trb$, $trb$14dbef65fdcb5bab6db04b6e8fb683cf879abbf6d9442f022a4bc300a66d95c4$trb$),
  ($trb$MCA-P3-PASSAGE-14$trb$, 14, 52, 52, $trb$PART 3 p.52 task 14$trb$, $trb$Establish position by use of electronic navigational equipment$trb$, $trb$Establish position by use of electronic navigational equipment

Use and limitations of navigational aids such as radar, GPS or other position fixing or indicating devices. The position is determined within the limits of acceptable instrument/system errors.$trb$, $trb$f8b550e031b9e7f969d69ad3f8ac3a4a64b0b2defdbc565de111d0e940749d4a$trb$),
  ($trb$MCA-P3-PASSAGE-15$trb$, 15, 52, 52, $trb$PART 3 p.52 task 15$trb$, $trb$Determine ship's position by dead reckoning$trb$, $trb$Determine ship's position by dead reckoning

Calculation of dead reckoning position (DR) from course steered and distance run. Calculation of estimated position (EP) taking into account the effect of Leeway, Set and drift of current or tidal Stream on intended course and DR. The position is determined within acceptable limits.$trb$, $trb$c78f498c91aef3c1cfee75517028ce6b42d35bbcaca202f279d41e80554e12ae$trb$),
  ($trb$MCA-P3-PASSAGE-16$trb$, 16, 53, 53, $trb$PART 3 p.53 task 16$trb$, $trb$determine position (continued) Operate electronic position fixing and navigational equipment$trb$, $trb$determine position (continued) Operate electronic position fixing and navigational equipment

1. Use of modern electronic navigational aids (which includes the echo sounder), with knowledge of their operating principals, limitations, sources of error, detection of misrepresentation of information and methods of correction to obtain accurate position fixing. 2. Ability to set up the equipment for optimum performance in accordance with guidelines. 3. Methods of testing for malfunctions of the equipment, including functional self-testing, and precautions to be taken after a malfunction occurs. Performance checks and tests to navigation systems comply with manufacturer's recommendations and good navigational practice.$trb$, $trb$57fb1da156fadf8d2e5d5426545a7f67afe874f82639323bb05c153a87aa9fc5$trb$),
  ($trb$MCA-P3-PASSAGE-17$trb$, 17, 53, 53, $trb$PART 3 p.53 task 17$trb$, $trb$Operate the steering control systems (autopilot$trb$, $trb$Operate the steering control systems (autopilot

). 1. Know the operational procedures and changeover from manual to automatic control and vice-versa. Adjust the controls for optimum performance. 2. Understand the need to put the steering into manual control in good time to allow any potential hazardous situation to be dealt with in a safe manner. 3. Understand the operational limitations of the automatic steering control system in heavy weather. The selection of steering mode is the most suitable for the prevailing weather, sea and traffic conditions and intended manoeuvres.$trb$, $trb$1005c9e84738edab417beeb5538b69be28d7fa9234b6a6e02f73658d324f352b$trb$),
  ($trb$MCA-P3-PASSAGE-18$trb$, 18, 54, 54, $trb$PART 3 p.54 task 18$trb$, $trb$determine position (continued) Use and interpret information obtained from shipborne meteorological instruments$trb$, $trb$determine position (continued) Use and interpret information obtained from shipborne meteorological instruments

Sources of meteorological information, ability to use and interpret information obtained from ship borne meteorological instruments including weather fax and weather satellite information. Knowledge of characteristics of various weather systems, reporting and recording systems. Use of a barometer as a forecasting aid. Measurements and observations of weather conditions are accurate.$trb$, $trb$57bc5cd84ede72a2c616afc2a7b8a37ae9415b4cd6ec9788d7236728c2813543$trb$),
  ($trb$MCA-P3-PASSAGE-19$trb$, 19, 54, 54, $trb$PART 3 p.54 task 19$trb$, $trb$Apply the meteorological information available$trb$, $trb$Apply the meteorological information available

Appreciation of the operational limitations of the ship, and the effect of weather on comfort and safety. Precautions for heavy weather sailing are taken in good time. Use of meteorological information for passage planning strategy. Meteorological information is correctly interpreted and applied.$trb$, $trb$a183a7007737e969e1ecb813791a84acc204b0197424d4e6a6570edff358c525$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 6: Maintain a Safe Navigational Watch
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
  $trb$Maintain a Safe Navigational Watch$trb$,
  $trb$PART 3 — NAVIGATION AT OPERATIONAL LEVEL
TASKS – maintain a safe navigational watch.
(Existing curated 12 tasks retained from prior seed.)$trb$,
  6,
  $trb$PART 3 / TASKS – Maintain a Safe Navigational Watch$trb$,
  55,
  57
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Maintain a Safe Navigational Watch$trb$
);

UPDATE public.trb_sections s
SET sort_order = 6,
    description = COALESCE(s.description, $trb$PART 3 — NAVIGATION AT OPERATIONAL LEVEL
TASKS – maintain a safe navigational watch.
(Existing curated 12 tasks retained from prior seed.)$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 3 / TASKS – Maintain a Safe Navigational Watch$trb$),
    source_page_start = COALESCE(s.source_page_start, 55),
    source_page_end = COALESCE(s.source_page_end, 57)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Maintain a Safe Navigational Watch$trb$;

-- Section 7: Use Radar and ARPA to Maintain Safety of Navigation
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
  $trb$Use Radar and ARPA to Maintain Safety of Navigation$trb$,
  $trb$PART 3 — NAVIGATION AT OPERATIONAL LEVEL
TASKS – use radar and ARPA to maintain safety of navigation.
Page 58 contains shore-based radar/ARPA syllabus prerequisites (not signable rows).$trb$,
  7,
  $trb$PART 3 / TASKS – Use radar and ARPA to maintain safety of navigation$trb$,
  58,
  62
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Use Radar and ARPA to Maintain Safety of Navigation$trb$
);

UPDATE public.trb_sections s
SET sort_order = 7,
    description = COALESCE(s.description, $trb$PART 3 — NAVIGATION AT OPERATIONAL LEVEL
TASKS – use radar and ARPA to maintain safety of navigation.
Page 58 contains shore-based radar/ARPA syllabus prerequisites (not signable rows).$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 3 / TASKS – Use radar and ARPA to maintain safety of navigation$trb$),
    source_page_start = COALESCE(s.source_page_start, 58),
    source_page_end = COALESCE(s.source_page_end, 62)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Use Radar and ARPA to Maintain Safety of Navigation$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Use Radar and ARPA to Maintain Safety of Navigation$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P3-RADAR-01$trb$, 1, 59, 59, $trb$PART 3 p.59 task 1$trb$, $trb$Carry out operational checks and adjust the equipment to proper performance$trb$, $trb$Carry out operational checks and adjust the equipment to proper performance

As radar observation and plotting syllabus detailed above. The equipment is functioning properly and in accordance with the manufacturer specifications.$trb$, $trb$3420a970937c2b1ca1f30e690f8c0eec88fcd32812d5bc4808088b4864d69019$trb$),
  ($trb$MCA-P3-RADAR-02$trb$, 2, 59, 59, $trb$PART 3 p.59 task 2$trb$, $trb$Able to operate and to interpret and analyse information obtained from radar and ARPA, as applicable$trb$, $trb$Able to operate and to interpret and analyse information obtained from radar and ARPA, as applicable

As radar observation and plotting , and ARPA syllabus as detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions.$trb$, $trb$76367ad4c58fe7960301944d74e49df38354c0ccdbf40b46030ffd9c97604a41$trb$),
  ($trb$MCA-P3-RADAR-03$trb$, 3, 59, 59, $trb$PART 3 p.59 task 3$trb$, $trb$Interpret and analyse factors affecting performance and accuracy$trb$, $trb$Interpret and analyse factors affecting performance and accuracy

As radar observation and plotting syllabus detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions.$trb$, $trb$9bfedef3b696bfe9a4830b4dbc17f9f059b5c3efa1baf8b2b5b6dace9c0bb4d0$trb$),
  ($trb$MCA-P3-RADAR-04$trb$, 4, 59, 59, $trb$PART 3 p.59 task 4$trb$, $trb$Set up and maintain displays$trb$, $trb$Set up and maintain displays

As radar observation and plotting syllabus detailed above. The displays are properly set up and maintained.$trb$, $trb$8b6992837f7fdd8d299c5637a85cd1e879f75f6978f1349b74c501f79e8c8aa6$trb$),
  ($trb$MCA-P3-RADAR-05$trb$, 5, 59, 59, $trb$PART 3 p.59 task 5$trb$, $trb$Detect and be aware of the possibility of misinterpretation of information, false echoes, sea returns, etc$trb$, $trb$Detect and be aware of the possibility of misinterpretation of information, false echoes, sea returns, etc

As radar observation and plotting syllabus detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions.$trb$, $trb$9ad5239dcb39524f67115ec1aeefaf36ba1a67745e5e1d3a74e59676917e369d$trb$),
  ($trb$MCA-P3-RADAR-06$trb$, 6, 60, 60, $trb$PART 3 p.60 task 6$trb$, $trb$Interpret and analyse information obtained from beacons and SARTs$trb$, $trb$Interpret and analyse information obtained from beacons and SARTs

As radar observation and plotting syllabus detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions.$trb$, $trb$6d5bb55f2ca9ad6b213b707fcbe44a0c319a99d6ce2dc3c6e4f49462c62893e2$trb$),
  ($trb$MCA-P3-RADAR-07$trb$, 7, 60, 60, $trb$PART 3 p.60 task 7$trb$, $trb$Detect and calculate range and bearing, course and speed of other ships, time and distance of closest approach of crossing, meeting and overtaking ships$trb$, $trb$Detect and calculate range and bearing, course and speed of other ships, time and distance of closest approach of crossing, meeting and overtaking ships

As radar observation and plotting syllabus detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions. The course and speed of other ships, as well as time and distance of assumed closest approach to other ships, are ascertained with sufficient accuracy to take appropriate actions.$trb$, $trb$a942c9f8444532eea9dfa232e70d14596c604ec94e8249a05550fb576cc1f712$trb$),
  ($trb$MCA-P3-RADAR-08$trb$, 8, 60, 60, $trb$PART 3 p.60 task 8$trb$, $trb$Identity critical echoes, detect course and speed changes of other ships, take into account the effect of changes in own ship's course or speed or both$trb$, $trb$Identity critical echoes, detect course and speed changes of other ships, take into account the effect of changes in own ship's course or speed or both

As radar observation and plotting syllabus detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions.$trb$, $trb$52709109d1e55a01feb494f4c76cf24a3c59637949ccd336898d18036d12c88d$trb$),
  ($trb$MCA-P3-RADAR-09$trb$, 9, 60, 60, $trb$PART 3 p.60 task 9$trb$, $trb$Apply the International Regulations for Preventing Collisions at Sea$trb$, $trb$Apply the International Regulations for Preventing Collisions at Sea

As radar observation and plotting syllabus detailed above. Action taken to avoid close encounter or collision with other vessels is in accordance with the International Regulations for Preventing Collisions at Sea .$trb$, $trb$d4755998f70f587c7f6b93be254bb115f2d6b13a629d94b352e7e6974a833fb2$trb$),
  ($trb$MCA-P3-RADAR-10$trb$, 10, 61, 61, $trb$PART 3 p.61 task 10$trb$, $trb$Use plotting techniques and relative and true motion concepts$trb$, $trb$Use plotting techniques and relative and true motion concepts

As radar observation and plotting syllabus detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions.$trb$, $trb$7c024eca25f2608117e1bea03b69989fb181933aac5d61f255666d5900ff90ca$trb$),
  ($trb$MCA-P3-RADAR-11$trb$, 11, 61, 61, $trb$PART 3 p.61 task 11$trb$, $trb$Use parallel indexing techniques$trb$, $trb$Use parallel indexing techniques

As radar observation and plotting syllabus detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions.$trb$, $trb$8574b6f040b67e726eb6197cf38606e60c38f68062362852f8199db9c28d077c$trb$),
  ($trb$MCA-P3-RADAR-12$trb$, 12, 61, 61, $trb$PART 3 p.61 task 12$trb$, $trb$Interpret and analyse information related to system performance and accuracy, tracking capabilities and limitations, and processing delays$trb$, $trb$Interpret and analyse information related to system performance and accuracy, tracking capabilities and limitations, and processing delays

As radar observation and plotting syllabus detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions. The course and speed of other ships as well as time and distance of assumed closest approach to other snips are ascertained with sufficient accuracy to take appropriate actions.$trb$, $trb$be975725848c571f6a164fac0aac710fc018ed4e93d1edd2256e9bb304523bac$trb$),
  ($trb$MCA-P3-RADAR-13$trb$, 13, 61, 61, $trb$PART 3 p.61 task 13$trb$, $trb$Use operational warnings and Systems tests$trb$, $trb$Use operational warnings and Systems tests

As radar observation and plotting syllabus detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions.$trb$, $trb$f630d6c28dcaebb3964f394509edc7f21a19be18d1c418bbd891e83b0a5109ab$trb$),
  ($trb$MCA-P3-RADAR-14$trb$, 14, 61, 61, $trb$PART 3 p.61 task 14$trb$, $trb$Use of the target acquisition and its limitations$trb$, $trb$Use of the target acquisition and its limitations

As radar observation and plotting syllabus, and ARPA syllabus as detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions.$trb$, $trb$2413048833d0ce29ebb2f8fb7c4269060e5063def0456f704010d27fbebffd6a$trb$),
  ($trb$MCA-P3-RADAR-15$trb$, 15, 62, 62, $trb$PART 3 p.62 task 15$trb$, $trb$Use true and relative vectors, graphic representation of target information and danger areas$trb$, $trb$Use true and relative vectors, graphic representation of target information and danger areas

As radar observation and plotting syllabus, and ARPA syllabus as detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions. The course and speed of other ships as well as time and distance of assumed closest approach to other ships are ascertained with sufficient accuracy to take appropriate actions.$trb$, $trb$abb6b052fa5c8eb9673bb7c4843bf986b58bdc1dee85a545ce44b935386864b2$trb$),
  ($trb$MCA-P3-RADAR-16$trb$, 16, 62, 62, $trb$PART 3 p.62 task 16$trb$, $trb$Derive and analyse information, critical echoes, exclusion areas and trial manoeuvres$trb$, $trb$Derive and analyse information, critical echoes, exclusion areas and trial manoeuvres

As radar observation and plotting syllabus, and ARPA syllabus as detailed above. The information obtained from the equipment is correctly interpreted and applied with due regard to the limitations of the equipment and prevailing circumstances and conditions. The course and speed of other ships as well as time and distance of closest approach to other ships are ascertained with sufficient accuracy to take appropriate actions.$trb$, $trb$51831b7a17b90e795e6851e78fbb18a42a86fd3c9c62e1bade3d5786a94e6bb4$trb$),
  ($trb$MCA-P3-RADAR-17$trb$, 17, 62, 62, $trb$PART 3 p.62 task 17$trb$, $trb$Take appropriate actions to avoid accidents$trb$, $trb$Take appropriate actions to avoid accidents

As radar observation and plotting syllabus, and ARPA syllabus as detailed above. Action taken to avoid a close encounter or collision with other vessels is in accordance with the International Regulations for Preventing Collisions at Sea. Decisions to amend course and/or speed are both timely and in accordance with accepted navigation practice. Adjustments made to the ship's course and speed maintain safety of navigation. Manoeuvring signals are made at the appropriate time and are in accordance with the International Regulations for Preventing Collisions at Sea.$trb$, $trb$73124787e39476b3a46570c6308ac3203c2f31661421cbac04fc221f03433759$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 8: Manoeuvre the Ship
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
  $trb$Manoeuvre the Ship$trb$,
  $trb$PART 4 — NAVIGATION AT OPERATIONAL LEVEL
STCW Competence: Manoeuvre the ship.$trb$,
  8,
  $trb$PART 4 / TASKS – Manoeuvre the ship$trb$,
  63,
  69
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Manoeuvre the Ship$trb$
);

UPDATE public.trb_sections s
SET sort_order = 8,
    description = COALESCE(s.description, $trb$PART 4 — NAVIGATION AT OPERATIONAL LEVEL
STCW Competence: Manoeuvre the ship.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 4 / TASKS – Manoeuvre the ship$trb$),
    source_page_start = COALESCE(s.source_page_start, 63),
    source_page_end = COALESCE(s.source_page_end, 69)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Manoeuvre the Ship$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Manoeuvre the Ship$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P4-MANOEUVRE-01$trb$, 1, 63, 63, $trb$PART 4 p.63 task 1$trb$, $trb$Prepare the ship for getting under way$trb$, $trb$Prepare the ship for getting under way

• Safety equipment required for the voyage. • Stowage of equipment and victuals. • Safety Briefing. • Deck gear and equipment ready. • Equipment, fuel and engine room checks. • General duties prior to proceeding to sea. The ship is properly prepared for getting under way.$trb$, $trb$2c13b0e8db8918708b8f4cf056f6238b686e386c0b6e748131189e847865c151$trb$),
  ($trb$MCA-P4-MANOEUVRE-02$trb$, 2, 63, 63, $trb$PART 4 p.63 task 2$trb$, $trb$Under supervision, take charge of one of the teams in preparing for un-mooring operations$trb$, $trb$Under supervision, take charge of one of the teams in preparing for un-mooring operations

• Sufficient number of personnel available. • Communications with OOW and other team members. • Protective clothing and equipment. • Operation of windlass/winches. • Fairleads and rollers turning freely. • Working area properly lit and clutter free. • Positions of safety identified (avoiding 'snap-back' zones). • Wires and ropes separated and able to run freely. • Stowage arrangements for mooring wires and ropes identified. • Heaving line ready. • Emergency tools ready. The ship is, in all respects, ready to un- moor.$trb$, $trb$a8ddbf000f24f206d7c94617d531f9a8eb8cb44ad36a9934c5ddf531cc83707f$trb$),
  ($trb$MCA-P4-MANOEUVRE-03$trb$, 3, 64, 64, $trb$PART 4 p.64 task 3$trb$, $trb$From alongside and under supervision, take charge of the team for un-mooring at the forward position$trb$, $trb$From alongside and under supervision, take charge of the team for un-mooring at the forward position

• Safety Briefing. • Single up, as ordered, by taking in all mooring lines except those to be used for manoeuvring clear of the berth. • Shore lines for telephone, water, power etc. to be clear. • Cast off and take in mooring lines as ordered. • Care of mooring lines and associated equipment. • Securing to cleats and bits, use of windlass/winch, and general rope handling. • Clear reporting to the OOW. The ship is safely un-moored.$trb$, $trb$57f7f4de30cac8d81d27989b45848b9709c2fd4ad1f84d3ee6f447e7b58fcfc7$trb$),
  ($trb$MCA-P4-MANOEUVRE-04$trb$, 4, 64, 64, $trb$PART 4 p.64 task 4$trb$, $trb$From alongside and under supervision, take charge of the team for un-mooring at the aft position$trb$, $trb$From alongside and under supervision, take charge of the team for un-mooring at the aft position

• Safety Briefing. • Single up, as ordered, by taking in all mooring lines except those to be used for manoeuvring clear of the berth. • Shore lines for telephone, water, power etc. to be clear. • Gangways secured. • Cast off and take in mooring lines as ordered. Report when clear. • Care of mooring lines and associated equipment. • Securing to cleats and bits, use of capstan, and general rope handling. • Clear reporting to the OOW. The ship is safely un-moored.$trb$, $trb$968a3bca64312229e08a40cfaa06789c464e293631d921ff241d5223592fa72a$trb$),
  ($trb$MCA-P4-MANOEUVRE-05$trb$, 5, 65, 65, $trb$PART 4 p.65 task 5$trb$, $trb$From alongside and under supervision, take charge of un-mooring operations overall$trb$, $trb$From alongside and under supervision, take charge of un-mooring operations overall

• Appraisal of weather. • Un-mooring plan, using extra mooring lines as required to manoeuvre the ship clear of the berth. • Permission from port and/or pilot, if required. • Safety briefing to un-mooring teams. • Shore lines for telephone, water, power etc. to be clear. • Gangways secured. • Engines ready. • Ship ready for sea. The ship is safely un-moored and manoeuvred clear of the berth.$trb$, $trb$3fffbaac2b792ccc850c8275d4671158aa62198dd6fe5bbd18b451403e1b2328$trb$),
  ($trb$MCA-P4-MANOEUVRE-06$trb$, 6, 65, 65, $trb$PART 4 p.65 task 6$trb$, $trb$Under supervision, take charge the team for mooring alongside forward$trb$, $trb$Under supervision, take charge the team for mooring alongside forward

• As for un-mooring: plus • Knowledge of the properties of synthetic ropes in common use. • General ropework. • Mooring lines flaked out and heaving lines ready. • Use of mooring lines including: headline, forward breastline and forward backspring, • Use of fenders. • Preparation of windlass and winches. The ship is, in all respects, ready to moor at given berth.$trb$, $trb$ef24491c4d8eba6f385a1551b72955ede823c13bc37aaa38143310f42d09fe81$trb$),
  ($trb$MCA-P4-MANOEUVRE-07$trb$, 7, 65, 65, $trb$PART 4 p.65 task 7$trb$, $trb$Under supervision, take charge of the team for mooring alongside aft$trb$, $trb$Under supervision, take charge of the team for mooring alongside aft

• As for un-mooring: plus • Knowledge of the properties of synthetic ropes in common use. • General ropework. • Mooring lines flaked out and heaving lines ready. • Use of mooring lines including: sternline, aft breastline and aft backspring, • Use of fenders. • Preparation of capstan and winches. Moorings are made fast or taken onboard as ordered. Ship is safely moored at the aft position without undue delay.$trb$, $trb$9f82cd1acf2bf9dfbeca95ed27632ab1c509f186309c5fc6bb717da4e9afe614$trb$),
  ($trb$MCA-P4-MANOEUVRE-08$trb$, 8, 66, 66, $trb$PART 4 p.66 task 8$trb$, $trb$From alongside and under supervision, take charge of mooring alongside overall$trb$, $trb$From alongside and under supervision, take charge of mooring alongside overall

• As for preparing to moor at the forward and aft position: plus • Duties for preparing to moor. • Mooring Plan. • Effect of current, tidal stream and windage on the manoeuvrability of the ship. • Use of engines and bowthruster. • Rigging of side gangways. • Connection of shore services. Moorings are made fast, and the ship is safely moored.$trb$, $trb$639d199b6bddbb766aefa97bd541ecea6605e560b33596bc40e070d1dda5119e$trb$),
  ($trb$MCA-P4-MANOEUVRE-09$trb$, 9, 66, 66, $trb$PART 4 p.66 task 9$trb$, $trb$Under supervision, take charge of mooring operations berthing stern-to (Mediterranean mooring$trb$, $trb$Under supervision, take charge of mooring operations berthing stern-to (Mediterranean mooring

). • As for mooring alongside, plus: • Rigging of after gangway. The ship is manoeuvred into the berth and safely moored.$trb$, $trb$1bef5dcbd1cd96578cb7ec2eda1bc1b7248c8a7177e435b2c7538a06d618c098$trb$),
  ($trb$MCA-P4-MANOEUVRE-10$trb$, 10, 66, 66, $trb$PART 4 p.66 task 10$trb$, $trb$the ship in normal conditions$trb$, $trb$the ship in normal conditions

Use available information as to the ship's turning circles and stopping distances when manoeuvring taking into account the effects of dead-weight, draught, trim, speed and under- keel clearance on turning circles and stopping distances. The information is adequately used during normal situations while taking note of draught and trim. Safe operating limits of ship propulsion, steering and power systems are not exceeded in normal manoeuvres. Adjustments made to the ship's course and speed maintain safety of navigation.$trb$, $trb$4458268b7ccf8b44ae150ba298c5499012e813af36ac278c49d4c0a340471607$trb$),
  ($trb$MCA-P4-MANOEUVRE-11$trb$, 11, 66, 66, $trb$PART 4 p.66 task 11$trb$, $trb$the ship taking into account the effects of wind or current$trb$, $trb$the ship taking into account the effects of wind or current

Use available information as to the ship's turning circles and stopping distances when manoeuvring taking into account the effects of wind and current on ship handling. The information is adequately used during normal situations while taking due regard to wind and current. Safe operating limits of ship propulsion, steering and power systems are not exceeded in normal manoeuvres. Adjustments made to the ship's course and speed maintain safety of navigation.$trb$, $trb$7734d06d2ed6b47517d5c7de20f6449d1dd6764937763396b55d85bc17d2d9e3$trb$),
  ($trb$MCA-P4-MANOEUVRE-12$trb$, 12, 67, 67, $trb$PART 4 p.67 task 12$trb$, $trb$Demonstrate knowledge of manoeuvring the ship in narrow, shallow or restricted waters$trb$, $trb$Demonstrate knowledge of manoeuvring the ship in narrow, shallow or restricted waters

Turning short around. Going astern. Use available information as to the ship's turning circles and stopping distances when manoeuvring taking into account the effects of squat, shallow water and similar effects. The information is adequately used during normal situations while taking due regard to squat, shallow water and similar effects. Safe operating limits of ship propulsion, steering and power systems are not exceeded in normal manoeuvres. Adjustments made to the ship's course and speed maintain safety of navigation.$trb$, $trb$8582dd5a41886fe2b29fd7c90e77df8c7502e7ba7c72078e4e0c827a1368aa7e$trb$),
  ($trb$MCA-P4-MANOEUVRE-13$trb$, 13, 67, 67, $trb$PART 4 p.67 task 13$trb$, $trb$Demonstrate knowledge of manoeuvring the ship in the vicinity of pilot vessels and other craft$trb$, $trb$Demonstrate knowledge of manoeuvring the ship in the vicinity of pilot vessels and other craft

• Handling characteristics of the ship in all conditions. • International Regulations for Preventing Collisions at Sea. The ship is manoeuvred safely, and adjustments made to the ship's course and speed maintain safety of navigation.$trb$, $trb$2d2ee9ed53f18da7989b16b2a82c4d6ea6a5d1237f8284db9399f828e5d34821$trb$),
  ($trb$MCA-P4-MANOEUVRE-14$trb$, 14, 67, 67, $trb$PART 4 p.67 task 14$trb$, $trb$Demonstrate knowledge of manoeuvring the ship to embark and disembark a pilot or other persons whilst underway$trb$, $trb$Demonstrate knowledge of manoeuvring the ship to embark and disembark a pilot or other persons whilst underway

• Merchant Shipping Notice 1716 - Pilot Transfer Arrangements. • The Boarding and Landing of Pilot by Pilot Boat - a Code of Practice. The ship is manoeuvred safely on a steady course at appropriate speed, providing a lee for the pilot boat as required. Arrangements for the safe transfer of the persons are made in advance and properly supervised.$trb$, $trb$0849bd06502d37c3208d93a0dd851e4066df6b55cad5afcfec6e64e920f85955$trb$),
  ($trb$MCA-P4-MANOEUVRE-15$trb$, 15, 67, 67, $trb$PART 4 p.67 task 15$trb$, $trb$During a drill, take appropriate action in case of failure of: • Bridge engine controls, • Main engines or propulsion system$trb$, $trb$During a drill, take appropriate action in case of failure of: • Bridge engine controls, • Main engines or propulsion system

Action to be taken in case of a navigational emergency: • NUC lights or shapes. • Advise the Master. • Take immediate action to avoid any dangerous situation.. The actions taken are the most appropriate given the exact circumstances of the case. NUC lights or shapes are correctly used.$trb$, $trb$3217cba5196f989800745149805333cb6959dfd214db832b18566df9d6c2d3fd$trb$),
  ($trb$MCA-P4-MANOEUVRE-16$trb$, 16, 67, 67, $trb$PART 4 p.67 task 16$trb$, $trb$Demonstrate ability to manoeuvre the ship to rescue a man overboard$trb$, $trb$Demonstrate ability to manoeuvre the ship to rescue a man overboard

Manoverboard rescue manoeuvre. • Lifebuoy with light/smoke signal. • Keep in sight and point. • Williamson turn or double turn. • Sound alarm. • Activate GPS, plotter or other electronic markers. • Ladders or nets put out. • Advise shipping in the vicinity • Boat prepared for launching. The actions taken are as generally recommended and the turning manoeuvre brings the ship into its wake.$trb$, $trb$69a87a7bae1f4e289158a2e7a7f224aa0de9f17fcaff2576766bfe15ae12e6da$trb$),
  ($trb$MCA-P4-MANOEUVRE-17$trb$, 17, 68, 68, $trb$PART 4 p.68 task 17$trb$, $trb$During a drill, take appropriate action in case of failure of the steering$trb$, $trb$During a drill, take appropriate action in case of failure of the steering

Action to be taken in case of a navigational emergency: • NUC lights or shapes. • Advise the Master. • Rig and steer using emergency steering. The actions taken are the most appropriate given the exact circumstances of the case. NUC lights or shapes are correctly used. Communications are established between the emergency steering position and the bridge.$trb$, $trb$4fac8ce5b5bda58cccf23c6041579c97284dfd2b615b5dda4332501c29ac0584$trb$),
  ($trb$MCA-P4-MANOEUVRE-18$trb$, 18, 68, 68, $trb$PART 4 p.68 task 18$trb$, $trb$Under supervision, take charge of the anchor party to prepare to let go the anchor(s$trb$, $trb$Under supervision, take charge of the anchor party to prepare to let go the anchor(s

). • Sufficient number of personnel available. • Communications with OOW and other team members. • Safety briefing. • Protective clothing and equipment. • Operation of windlass. Power available. Windlass turned over out of gear. • Bow stoppers free and rollers turning freely. • Working area properly lit and clutter free. • Positions of safety identified • Anchor chain cable able to run freely, and inboard bitter end made fast (lashing or easy-to-slip pin) in chain locker. • Emergency tools ready. • Hawse and spurling pipes clear. • Anchor walked back. • Anchor ball and/or light ready. The anchors are ready to let go.$trb$, $trb$ef4682867739bb5a4a53cf4a309ccdaf84a94337d4bdb33a1a3be92c362c3825$trb$),
  ($trb$MCA-P4-MANOEUVRE-19$trb$, 19, 68, 68, $trb$PART 4 p.68 task 19$trb$, $trb$Under supervision, take charge of the anchor party and let go the anchor(s$trb$, $trb$Under supervision, take charge of the anchor party and let go the anchor(s

). As for preparing to let go the anchor(s): plus • Shackle Marks on anchor chain cable are understood. • Depth of water. • Scope of cable required. • Use of Bow stoppers. Anchors are walked back and let go as appropriate. Correct scope is paid out in a controlled fashion. Ship is safely anchored and anchor chain secured. Anchor signal is correctly displayed.$trb$, $trb$527bc6e4a93502a345570e49dd029bd652b843ab8ec617cba14266980ec1a360$trb$),
  ($trb$MCA-P4-MANOEUVRE-20$trb$, 20, 69, 69, $trb$PART 4 p.69 task 20$trb$, $trb$Under supervision, take charge of the anchor party for weighing anchor and securing for sea$trb$, $trb$Under supervision, take charge of the anchor party for weighing anchor and securing for sea

As for letting go the anchor(s): plus • Anchor wash system. • Procedures for clearing a fouled anchor. • Procedure for guiding the cable in the chain locker if not self-stowing, and safety measures to take for the protection of personnel. • Signals for indicating how the cable (is leading and procedures to adopt if nipped, leading astern or otherwise impeded. Operations are carried out correctly. Bridge is advised of the progress and lead of the cable. Correct action is taken to clear a fouled anchor. Anchor(s) are correctly weighed, stowed and secured. Anchor signal is removed at the appropriate moment. Bowstoppers are applied, and the windlass is secured.$trb$, $trb$3e5898ef17590139d35a33674c3c48dddecd874669e29949de247345e3b68df0$trb$),
  ($trb$MCA-P4-MANOEUVRE-21$trb$, 21, 69, 69, $trb$PART 4 p.69 task 21$trb$, $trb$Under supervision, take charge of anchoring operations$trb$, $trb$Under supervision, take charge of anchoring operations

As for letting go the anchor(s): plus • Prepare anchor Plan, • Appreciation of effect of wind, current and tidal stream on the ship whilst at anchor. • Consideration of the positions of other ships anchored locally. • Calculation of scope of cable required, given the depth of water and nature of the seabed. • Expected stay at the anchorage. The ship is safely anchored using suitable scope of cable(s). Signals between the anchor party and the bridge are clearly understood. Anchor signal is correctly displayed.$trb$, $trb$ca8f51cf06a1d835d7e538fba551f7f7ec699eb76c4bb4db75ddb9c0c70341a9$trb$),
  ($trb$MCA-P4-MANOEUVRE-22$trb$, 22, 69, 69, $trb$PART 4 p.69 task 22$trb$, $trb$the ship and secure to a buoy$trb$, $trb$the ship and secure to a buoy

As for mooring and anchoring: plus • Safety precautions to be adopted where mooring to buoys is undertaken from a ship's tender, or from the ship. The ship is safely moored to the buoy, and operations do not put personnel at risk. Correct signal is displayed.$trb$, $trb$40583bd52d7adc6d4edd503c2af1dab69bb89799468f905aa20719513814a3de$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 9: Respond to Emergencies
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
  $trb$Respond to Emergencies$trb$,
  $trb$PART 4 — RESPONSE TO EMERGENCIES
TASKS – respond to emergencies.$trb$,
  9,
  $trb$PART 4 / TASKS – Respond to emergencies$trb$,
  70,
  71
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Respond to Emergencies$trb$
);

UPDATE public.trb_sections s
SET sort_order = 9,
    description = COALESCE(s.description, $trb$PART 4 — RESPONSE TO EMERGENCIES
TASKS – respond to emergencies.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 4 / TASKS – Respond to emergencies$trb$),
    source_page_start = COALESCE(s.source_page_start, 70),
    source_page_end = COALESCE(s.source_page_end, 71)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Respond to Emergencies$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Respond to Emergencies$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P4-EMERG-01$trb$, 1, 70, 70, $trb$PART 4 p.70 task 1$trb$, $trb$Respond to an emergency drill in port • Take action on recognising an alarm signal to comply with the ship's muster requirements$trb$, $trb$Respond to an emergency drill in port • Take action on recognising an alarm signal to comply with the ship's muster requirements

• Demonstrate ability to take precautions for the protection and safety of passengers and crew in emergency situations. • Take initial action to conform to the ship's emergency procedures, and raise the alarm by the most appropriate method. • Implement the necessary evacuation, emergency shut down and isolation procedures. • Communicate information to the emergency services promptly and accurately. • Protection of the marine environment. The type and scale of the emergency is promptly identified. Initial actions are in accordance with contingency plans and are appropriate to the urgency of the situation and nature of the emergency.$trb$, $trb$338507d53c10689293dc6d93df40ff04ebfbfd8b5b4e7a96d3147e17438d4e22$trb$),
  ($trb$MCA-P4-EMERG-02$trb$, 2, 70, 70, $trb$PART 4 p.70 task 2$trb$, $trb$Respond to an emergency drill at sea following a collision or grounding$trb$, $trb$Respond to an emergency drill at sea following a collision or grounding

• Take initial action to conform to the ship's emergency procedures, and raise the alarm by the most appropriate method. • Implement the necessary evacuation, emergency shut down and isolation procedures. • Demonstrate ability to take initial actions following a collision or grounding, initial damage assessment and control. • Protection of personnel. • Protection of the marine environment. The type and scale of the emergency is promptly identified. Initial actions and, if appropriate, manoeuvring of the ship are in accordance with contingency plans and are appropriate to the urgency of the situation and nature of the emergency.$trb$, $trb$fae8d7e3f074b0303d02c0efccc3686f633649406afd1d666058f8d72932942c$trb$),
  ($trb$MCA-P4-EMERG-03$trb$, 3, 71, 71, $trb$PART 4 p.71 task 3$trb$, $trb$Understand the full procedure for sending a distress message using radio/GMDSS communications$trb$, $trb$Understand the full procedure for sending a distress message using radio/GMDSS communications

• Correct use of equipment and messages, and awareness of penalties for misuse. • Knowledge of the contents and use of the International Aeronautical and Maritime Search and Rescue (IAMSAR) Manual, Volume III. A correct message or signal is made. The contents of IAMSAR, Vol III, and SAR procedures, is understood.$trb$, $trb$becf5ec9468cb4a81aada1b1c40442598b7a9cc366bd63cd51d60ae16f85c99f$trb$),
  ($trb$MCA-P4-EMERG-04$trb$, 4, 71, 71, $trb$PART 4 p.71 task 4$trb$, $trb$Understand the full procedure for sending a distress message using visual distress signals$trb$, $trb$Understand the full procedure for sending a distress message using visual distress signals

• Correct use of distress signals, and awareness of penalties for misuse. • Knowledge of the contents and use of the International Aeronautical and Maritime Search and Rescue (IAMSAR) Manual, Volume III. A correct message or signal is made. The contents of IAMSAR, Vol III, and SAR procedures, is understood.$trb$, $trb$7556d272bb859b300675370a82b58ac2d3d8cca11f6ade40d88f8c8610f7d539$trb$),
  ($trb$MCA-P4-EMERG-05$trb$, 5, 71, 71, $trb$PART 4 p.71 task 5$trb$, $trb$Respond to a manoverboard emergency drill$trb$, $trb$Respond to a manoverboard emergency drill

• Manoverboard rescue manoeuvre. • Keep manoverboard in sight. • Activate electronic marking systems and deploy Manoverboard markers. • Demonstrate ability to act correctly when rescuing persons from the sea. • Manoverboard recovery system is prepared and ready for deployment. Safety or rescue boat is ready for launching. The type and scale of the emergency is promptly identified. Initial actions and, if appropriate, manoeuvring of the ship are in accordance with contingency plans and are appropriate to the urgency of the situation and nature of the emergency.$trb$, $trb$34d4c8c0a29e21e266658e6e35992e381e85e8e832c2a13781375433be0a17c1$trb$),
  ($trb$MCA-P4-EMERG-06$trb$, 6, 71, 71, $trb$PART 4 p.71 task 6$trb$, $trb$Respond to assisting a ship in distress drill$trb$, $trb$Respond to assisting a ship in distress drill

• Correct appreciation of the situation. • Correct response to distress call. • Demonstrate ability to act correctly when assisting a ship in distress. • Demonstrate ability to take precautions for the protection and safety of passengers and crew in emergency situations. • Prepare the ship to render assistance. The type and scale of the emergency is promptly identified. Initial actions and, if appropriate, manoeuvring of the ship are in accordance with contingency plans and are appropriate to the urgency of the situation and nature of the emergency.$trb$, $trb$e1b06f9509d06f2459955f8a6015de505c7cbc849a50477788165abd3be589a4$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 10: Prevent, Control and Fight Fires on Board
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
  $trb$Prevent, Control and Fight Fires on Board$trb$,
  $trb$PART 4 — RESPONSE TO EMERGENCIES
TASKS – prevent, control and fight fires on board (contents title; printed on emergency-response pages).$trb$,
  10,
  $trb$PART 4 / TASKS – Prevent, control and fight fires on board$trb$,
  72,
  72
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Prevent, Control and Fight Fires on Board$trb$
);

UPDATE public.trb_sections s
SET sort_order = 10,
    description = COALESCE(s.description, $trb$PART 4 — RESPONSE TO EMERGENCIES
TASKS – prevent, control and fight fires on board (contents title; printed on emergency-response pages).$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 4 / TASKS – Prevent, control and fight fires on board$trb$),
    source_page_start = COALESCE(s.source_page_start, 72),
    source_page_end = COALESCE(s.source_page_end, 72)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Prevent, Control and Fight Fires on Board$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Prevent, Control and Fight Fires on Board$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P4-FIRE-01$trb$, 1, 72, 72, $trb$PART 4 p.72 task 1$trb$, $trb$Locate fire-stations and fire fighting equipment$trb$, $trb$Locate fire-stations and fire fighting equipment

Demonstrate the proper use of fixed and portable equipment and installations. • Fire Prevention and Fire Fighting Course (STCW Code A-VI/1-2). • Familiarisation Training. • Experience on board. All stations are located and the most suitable one selected in the event of a fire. Proper equipment and extinguishing agents selected for the various materials on fire.$trb$, $trb$808ddbb836f4c9e5622cce0d40dfcc03faebddeddc1e548cb21e802680e83c21$trb$),
  ($trb$MCA-P4-FIRE-02$trb$, 2, 72, 72, $trb$PART 4 p.72 task 2$trb$, $trb$Locate and use fire-protective equipment (fireman's outfit, including breathing apparatus$trb$, $trb$Locate and use fire-protective equipment (fireman's outfit, including breathing apparatus

). • Fire Prevention and Fire Fighting Course (STCW Code A-VI/1-2). • Familiarisation Training. • Experience on board. The equipment is quickly donned and used in a way that no accidents are likely to occur.$trb$, $trb$40ff4a5aaa1ba436115fafb34de3c54c5d7be2accbdea2639137e89509affc21$trb$),
  ($trb$MCA-P4-FIRE-03$trb$, 3, 72, 72, $trb$PART 4 p.72 task 3$trb$, $trb$Demonstrate ability to act in accordance with the vessel’s fire-fighting plan/procedures during fire-drills$trb$, $trb$Demonstrate ability to act in accordance with the vessel’s fire-fighting plan/procedures during fire-drills

• Fire Prevention and Fire Fighting Course (STCW Code A-VI/1-2). • Familiarisation Training. • Experience on board. During debriefing after an exercise or a real fire extinguishing action the reasons for each action taken, including the priority in which they were taken, are explained and accepted as the most appropriate.$trb$, $trb$087b08ec5f01494e5527e67fb7646fda42f7a5129bd21716a5f1bcc4d8e7325d$trb$),
  ($trb$MCA-P4-FIRE-04$trb$, 4, 72, 72, $trb$PART 4 p.72 task 4$trb$, $trb$During relevant drills carry out rescue operations wearing breathing apparatus$trb$, $trb$During relevant drills carry out rescue operations wearing breathing apparatus

• Fire Prevention and Fire Fighting Course (STCW Code A-VI/1-2). The breathing apparatus is tested and used in accordance with manufacturers manual and the rescue operation is successful.$trb$, $trb$bf57c17f822d0f551432fb5c5194b1c38958b2df18737272aab835a9cc963757$trb$),
  ($trb$MCA-P4-FIRE-05$trb$, 5, 72, 72, $trb$PART 4 p.72 task 5$trb$, $trb$Ensure that all fire fighting equipment on board is properly maintained and functioning$trb$, $trb$Ensure that all fire fighting equipment on board is properly maintained and functioning

• Fire Prevention and Fire Fighting Course (STCW Code A-VI/1-2). • Experience on board. Equipment is maintained in accordance with manufacturer’s instructions and regulatory requirements.$trb$, $trb$fa44cb9dab064eb0cc9db7a4db0bad59e8709e2adaefb97b70fd074e870aa998$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 11: Operate Life Saving Appliances
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
  $trb$Operate Life Saving Appliances$trb$,
  $trb$PART 4 — RESPONSE TO EMERGENCIES
TASKS – operate life saving appliances.$trb$,
  11,
  $trb$PART 4 / TASKS – Operate life saving appliances$trb$,
  73,
  73
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Operate Life Saving Appliances$trb$
);

UPDATE public.trb_sections s
SET sort_order = 11,
    description = COALESCE(s.description, $trb$PART 4 — RESPONSE TO EMERGENCIES
TASKS – operate life saving appliances.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 4 / TASKS – Operate life saving appliances$trb$),
    source_page_start = COALESCE(s.source_page_start, 73),
    source_page_end = COALESCE(s.source_page_end, 73)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Operate Life Saving Appliances$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Operate Life Saving Appliances$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P4-LSA-01$trb$, 1, 73, 73, $trb$PART 4 p.73 task 1$trb$, $trb$Operate life saving appliances saving appliances Organise abandon ship drills$trb$, $trb$Operate life saving appliances saving appliances Organise abandon ship drills

• Personal Safety and Social Responsibilities Course (STCW Code A-VI/1-4). • Experience on board. On sounding the alarm all persons muster at the designated muster station wearing life jackets or as required.$trb$, $trb$8125774d041d684b8e53701119d71c5a2dc782e84470386401e75f8667678a6c$trb$),
  ($trb$MCA-P4-LSA-02$trb$, 2, 73, 73, $trb$PART 4 p.73 task 2$trb$, $trb$Demonstrate the ability to organise and supervise the launching, handling and recovery of a lifeboat or rescue boat or safety boat - as may be carried on board$trb$, $trb$Demonstrate the ability to organise and supervise the launching, handling and recovery of a lifeboat or rescue boat or safety boat - as may be carried on board

• Experience on board. • Apply safety procedures during launching and recovery. Correct orders for embarkation, launching, clearing the ship's side, and safely handling the boat under motor, oars or sail as appropriate. Safe recovery and stowage.$trb$, $trb$7eb1cd3d9b716ec5e2ce74da76ef0af083ac2a0887fa8fa235b5b949206c4647$trb$),
  ($trb$MCA-P4-LSA-03$trb$, 3, 73, 73, $trb$PART 4 p.73 task 3$trb$, $trb$Demonstrate the ability to organise and supervise the launching a liferaft (by manual and automatic means), boarding and manoeuvring clear of ship's side$trb$, $trb$Demonstrate the ability to organise and supervise the launching a liferaft (by manual and automatic means), boarding and manoeuvring clear of ship's side

• Personal Survival Techniques Course (STCW Code A-VI/1-1). The duties for the persons designated for the raft are clearly allocated and orders efficiently executed.$trb$, $trb$2605cf672165c32de8a6a8b78899230f8c8f1894b907ead2c0a6af14c4704902$trb$),
  ($trb$MCA-P4-LSA-04$trb$, 4, 73, 73, $trb$PART 4 p.73 task 4$trb$, $trb$Demonstrate proper use of life-saving communications and location equipment including VHFs, EPIRBs and SARTs$trb$, $trb$Demonstrate proper use of life-saving communications and location equipment including VHFs, EPIRBs and SARTs

• GMDSS (GOC) Course Equipment is operated in accordance with manufacturer's instruction.$trb$, $trb$d23ae703fdf180ac83913175d10bbe98f0cf89998413bf6cc7ed27fa5f0e564d$trb$),
  ($trb$MCA-P4-LSA-05$trb$, 5, 73, 73, $trb$PART 4 p.73 task 5$trb$, $trb$Ensure that all survival craft launching equipment on board is properly maintained and functioning$trb$, $trb$Ensure that all survival craft launching equipment on board is properly maintained and functioning

• Personal Survival Techniques Course (STCW Code A-VI/1-1). • Experience on board. Equipment is maintained in accordance with manufacturer’s instructions and regulatory requirements.$trb$, $trb$cf8eadab5ae20c389bd5d62ad16d150d4d259a676c053fc612ec1e8412212d33$trb$),
  ($trb$MCA-P4-LSA-06$trb$, 6, 73, 73, $trb$PART 4 p.73 task 6$trb$, $trb$Ensure all survival craft equipment, (including water rations, pyrotechnics and survival equipment etc.) is correct and properly maintained$trb$, $trb$Ensure all survival craft equipment, (including water rations, pyrotechnics and survival equipment etc.) is correct and properly maintained

• Personal Survival Techniques Course (STCW Code A-VI/1-1) • Experience on board. Equipment meets requirements for the designated survival craft.$trb$, $trb$044a55a6181bbe0df8abda369f988139e4ddfe976174e1e95cf0e0b3cf0ab916$trb$),
  ($trb$MCA-P4-LSA-07$trb$, 7, 73, 73, $trb$PART 4 p.73 task 7$trb$, $trb$During a drill assist in the evacuation of a casualty from the ship by helicopter$trb$, $trb$During a drill assist in the evacuation of a casualty from the ship by helicopter

• Knowledge of the contents and use of the International Aeronautical and Maritime Search and Rescue (IAMSAR) Manual, Volume III. • Preparations for operation with helicopters. • Helicopter rescue techniques and communications including helicopter Hi-Line Technique. The casualty is safely evacuated, without putting personnel (ship's or helicopter crew) at risk. Correct procedures are followed, and the rescue helicopter Hi-Line Technique is understood and demonstrated.$trb$, $trb$fad4c92925dca5a59a11a90def56382e89ddeef1f7c56b1055f16c52b4c40014$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 12: Apply Medical First Aid on Board
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
  $trb$Apply Medical First Aid on Board$trb$,
  $trb$PART 4 — RESPONSE TO EMERGENCIES
TASKS – apply medical first aid on board.$trb$,
  12,
  $trb$PART 4 / TASKS – Apply medical first aid on board$trb$,
  74,
  74
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Apply Medical First Aid on Board$trb$
);

UPDATE public.trb_sections s
SET sort_order = 12,
    description = COALESCE(s.description, $trb$PART 4 — RESPONSE TO EMERGENCIES
TASKS – apply medical first aid on board.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 4 / TASKS – Apply medical first aid on board$trb$),
    source_page_start = COALESCE(s.source_page_start, 74),
    source_page_end = COALESCE(s.source_page_end, 74)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Apply Medical First Aid on Board$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Apply Medical First Aid on Board$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P4-FIRSTAID-01$trb$, 1, 74, 74, $trb$PART 4 p.74 task 1$trb$, $trb$Apply medical first aid on board first aid on board During relevant drills demonstrate procedures to stop excessive bleeding, ensure clear airway/breathing and put injured persons in proper position$trb$, $trb$Apply medical first aid on board first aid on board During relevant drills demonstrate procedures to stop excessive bleeding, ensure clear airway/breathing and put injured persons in proper position

Elementary First Aid Course (STCW Code A-VI/1-3). The actions demonstrated are in compliance with accepted recommendations given in international medical first aid guidance.$trb$, $trb$ac6f0518a75445d8ef15e3de47df2b10c163bb083e35b10803151c97247736db$trb$),
  ($trb$MCA-P4-FIRSTAID-02$trb$, 2, 74, 74, $trb$PART 4 p.74 task 2$trb$, $trb$During relevant drills demonstrate how to detect signs of shock and heat stroke and act accordingly$trb$, $trb$During relevant drills demonstrate how to detect signs of shock and heat stroke and act accordingly

Elementary First Aid Course (STCW Code A-VI/1-3). The treatment recommended or given is adequate. Ability to request Radio Medico for advice is demonstrated.$trb$, $trb$bcee28ef5617b8a682cab9c18c58090b5319333d6d00c332da54b876ec322ca6$trb$),
  ($trb$MCA-P4-FIRSTAID-03$trb$, 3, 74, 74, $trb$PART 4 p.74 task 3$trb$, $trb$During relevant drills demonstrate how to treat burns, scalds, fractures and hypothermia$trb$, $trb$During relevant drills demonstrate how to treat burns, scalds, fractures and hypothermia

Elementary First Aid Course (STCW Code A-VI/1-3). Recommended guidelines for proper actions are explained and the basic principles for avoiding hypothermia are demonstrated.$trb$, $trb$e1cc6ea27ec2ddb80b60e1a0584fc9dfa850626080d1cc052a241bf56b7911ce$trb$),
  ($trb$MCA-P4-FIRSTAID-04$trb$, 4, 74, 74, $trb$PART 4 p.74 task 4$trb$, $trb$During relevant drills, locate and access shipboard medicine and equipment$trb$, $trb$During relevant drills, locate and access shipboard medicine and equipment

• Familiarisation Training. • Experience on board. Ability to access the medical cabinet in a timely way.$trb$, $trb$6675b45ffdff3b5d1d1b06e3fb8565dae09a2c7ca5bfc2f6f4315babd08e5497$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 13: Respond to a Distress Signal at Sea
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
  $trb$Respond to a Distress Signal at Sea$trb$,
  $trb$PART 4 — RESPONSE TO EMERGENCIES
TASKS – respond to a distress signal at sea.$trb$,
  13,
  $trb$PART 4 / TASKS – Respond to a distress signal at sea$trb$,
  75,
  75
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Respond to a Distress Signal at Sea$trb$
);

UPDATE public.trb_sections s
SET sort_order = 13,
    description = COALESCE(s.description, $trb$PART 4 — RESPONSE TO EMERGENCIES
TASKS – respond to a distress signal at sea.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 4 / TASKS – Respond to a distress signal at sea$trb$),
    source_page_start = COALESCE(s.source_page_start, 75),
    source_page_end = COALESCE(s.source_page_end, 75)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Respond to a Distress Signal at Sea$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Respond to a Distress Signal at Sea$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P4-DISTRESS-01$trb$, 1, 75, 75, $trb$PART 4 p.75 task 1$trb$, $trb$Respond to a distress signal at sea at sea Understand the actions to be taken on receiving a distress message by VHF$trb$, $trb$Respond to a distress signal at sea at sea Understand the actions to be taken on receiving a distress message by VHF

• Distress procedure. • Correctly identify the nature of the signal. • Advise master. • Acknowledge the signal correctly and promptly. • Obligation to respond. • Obligation to render assistance. The distress or emergency signal is immediately recognised and correctly acknowledged. Information is given in a clear and concise manner.$trb$, $trb$deb6c7354c64c6c5ff003d581a6bafd09d1023a4919bc1d59256c4aaf7420c17$trb$),
  ($trb$MCA-P4-DISTRESS-02$trb$, 2, 75, 75, $trb$PART 4 p.75 task 2$trb$, $trb$On receipt of a distress establish the position of the casualty and make a preliminary assessment of the situation$trb$, $trb$On receipt of a distress establish the position of the casualty and make a preliminary assessment of the situation

• Selection of Charts & Chartwork. • Calculation of distance and time to reach the unit in distress. • Knowledge of standing orders. • Communication is clear, concise and acknowledged in a seaman-like manner. The positions are correctly plotted in suitable charts. Contingency plans and instructions in standing orders are implemented and complied with.$trb$, $trb$a70b1f953d4bd6f31a715573a76166bd6f8d2074467e893ade1539ead600774f$trb$),
  ($trb$MCA-P4-DISTRESS-03$trb$, 3, 75, 75, $trb$PART 4 p.75 task 3$trb$, $trb$Understand the preparations that may be made prior to rendering assistance to a vessel in distress • Preparation of ships equipment including rescue boats and medical equipment$trb$, $trb$Understand the preparations that may be made prior to rendering assistance to a vessel in distress • Preparation of ships equipment including rescue boats and medical equipment

• Co-ordinate assistance with other vessels and SAR stations. • Assess environmental conditions. . Contingency plans and instructions in standing orders are implemented and complied with.$trb$, $trb$44466a3348cd950fda19afb67a2ca26ceec40287881e206f3d9a3f11c4b16fbd$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 14: Use of IMO Standard Marine Communication Phrases and Use of English
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
  $trb$Use of IMO Standard Marine Communication Phrases and Use of English$trb$,
  $trb$PART 4 — RESPONSE TO EMERGENCIES
TASK – Use the IMO Standard Marine Communication Phrases, write and speak English.$trb$,
  14,
  $trb$PART 4 / TASKS – Use of IMO SMCP and use of English$trb$,
  76,
  76
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Use of IMO Standard Marine Communication Phrases and Use of English$trb$
);

UPDATE public.trb_sections s
SET sort_order = 14,
    description = COALESCE(s.description, $trb$PART 4 — RESPONSE TO EMERGENCIES
TASK – Use the IMO Standard Marine Communication Phrases, write and speak English.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 4 / TASKS – Use of IMO SMCP and use of English$trb$),
    source_page_start = COALESCE(s.source_page_start, 76),
    source_page_end = COALESCE(s.source_page_end, 76)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Use of IMO Standard Marine Communication Phrases and Use of English$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Use of IMO Standard Marine Communication Phrases and Use of English$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P4-ENGLISH-01$trb$, 1, 76, 76, $trb$PART 4 p.76 task 1$trb$, $trb$Marine Communication Phrases, write and speak English In the normal course of operations, request and obtain a safety message by radio telephone from a foreign station$trb$, $trb$Marine Communication Phrases, write and speak English In the normal course of operations, request and obtain a safety message by radio telephone from a foreign station

• IMO Standard Marine Communication Phrases. • A full knowledge of the phonetic alphabet. Navigation and Safety communication is satisfactorily conducted with persons unable to understand the officer’s national language.$trb$, $trb$dee01a4b30e542315c52bbad4c9a7307a79069268f393e95026925f9d49a75ec$trb$),
  ($trb$MCA-P4-ENGLISH-02$trb$, 2, 76, 76, $trb$PART 4 p.76 task 2$trb$, $trb$Obtain a weather forecast and safety message by radio telephone, in English$trb$, $trb$Obtain a weather forecast and safety message by radio telephone, in English

• Understand Meteorological and Marine Safety messages. • Ability to speak clearly in the English language. The messages relevant to the safety of the ship are correctly interpreted or drafted$trb$, $trb$2d0e8e5f76fa8679ffab5cce7a9e8d65ce841ad3fce8e7010f3b4bcbe2ed61bb$trb$),
  ($trb$MCA-P4-ENGLISH-03$trb$, 3, 76, 76, $trb$PART 4 p.76 task 3$trb$, $trb$Fill in standard English nautical reports and forms$trb$, $trb$Fill in standard English nautical reports and forms

• Ability to write in the English language. All reports and forms relevant to the duties of an officer in charge of a navigational watch are correctly fulfilled.$trb$, $trb$fc9357269d217f4e1bd0d6a09bacfae8e4273f7a4f12b303877fe6b6a340b04a$trb$),
  ($trb$MCA-P4-ENGLISH-04$trb$, 4, 76, 76, $trb$PART 4 p.76 task 4$trb$, $trb$In the normal course of operations, communicate with other ships, port operations and coast stations$trb$, $trb$In the normal course of operations, communicate with other ships, port operations and coast stations

• Radio procedures. • IMO Standard Marine Communication Phrases. Communications are clear and understood.$trb$, $trb$6e442b090a4529f4f42ebb99d8b9253882845bf9207b3c52d4574e9c54c12292$trb$),
  ($trb$MCA-P4-ENGLISH-05$trb$, 5, 76, 76, $trb$PART 4 p.76 task 5$trb$, $trb$Satisfactorily perform the officer’s duties with multi-lingual crew$trb$, $trb$Satisfactorily perform the officer’s duties with multi-lingual crew

• IMO Standard Marine Communication Phrases. • Knowledge of the working routine of the ship. Communications are clear and understood.$trb$, $trb$96fbc81c831b5a60d9d9da7b102ba2648fd22c9a7344caa7f9dbfd2325c3201d$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 15: Transmit and Receive Information by Visual Signalling
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
  $trb$Transmit and Receive Information by Visual Signalling$trb$,
  $trb$PART 4 — RESPONSE TO EMERGENCIES
TASKS – transmit and receive information by visual signalling.$trb$,
  15,
  $trb$PART 4 / TASKS – Transmit and receive information by visual signalling$trb$,
  77,
  77
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Transmit and Receive Information by Visual Signalling$trb$
);

UPDATE public.trb_sections s
SET sort_order = 15,
    description = COALESCE(s.description, $trb$PART 4 — RESPONSE TO EMERGENCIES
TASKS – transmit and receive information by visual signalling.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 4 / TASKS – Transmit and receive information by visual signalling$trb$),
    source_page_start = COALESCE(s.source_page_start, 77),
    source_page_end = COALESCE(s.source_page_end, 77)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Transmit and Receive Information by Visual Signalling$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Transmit and Receive Information by Visual Signalling$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P4-VISUAL-01$trb$, 1, 77, 77, $trb$PART 4 p.77 task 1$trb$, $trb$Transmit and receive information by visual signalling visual signals Identify the meaning of a random selection of International Code Flags$trb$, $trb$Transmit and receive information by visual signalling visual signals Identify the meaning of a random selection of International Code Flags

To be able to recognise the principle International Code Flags and their single letter meaning. The flags are recognised and their meaning identified.$trb$, $trb$1378a2c3199c2a00fc0d6d7a7fd5f786161daf428f25320812b086fe32b830f1$trb$),
  ($trb$MCA-P4-VISUAL-02$trb$, 2, 77, 77, $trb$PART 4 p.77 task 2$trb$, $trb$Use the International Code of Signals to interpret messages given by flags and pennants$trb$, $trb$Use the International Code of Signals to interpret messages given by flags and pennants

Recognise the signal NC. Prospective officers must have an understanding of the principals of signalling by flags, and of the International Code of Signals. Communication are consistently successful.$trb$, $trb$71d2a26f208f99cea1acb15e666d229cbecb16db55da2b5c6daadb9eb0140ba6$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 16: Ensure Compliance with Pollution Prevention Requirements
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
  $trb$Ensure Compliance with Pollution Prevention Requirements$trb$,
  $trb$PART 5 — ONBOARD SHIP OPERATIONS
TASKS – Take actions to prevent pollution.$trb$,
  16,
  $trb$PART 5 / TASKS – Ensure compliance with pollution prevention requirements$trb$,
  78,
  78
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Ensure Compliance with Pollution Prevention Requirements$trb$
);

UPDATE public.trb_sections s
SET sort_order = 16,
    description = COALESCE(s.description, $trb$PART 5 — ONBOARD SHIP OPERATIONS
TASKS – Take actions to prevent pollution.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 5 / TASKS – Ensure compliance with pollution prevention requirements$trb$),
    source_page_start = COALESCE(s.source_page_start, 78),
    source_page_end = COALESCE(s.source_page_end, 78)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Ensure Compliance with Pollution Prevention Requirements$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Ensure Compliance with Pollution Prevention Requirements$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P5-POLLUTION-01$trb$, 1, 78, 78, $trb$PART 5 p.78 task 1$trb$, $trb$Under supervision, prepare the ship to bunker fuel$trb$, $trb$Under supervision, prepare the ship to bunker fuel

• Ensure that procedures are agreed and observed and all scuppers are plugged prior to bunkering. • Equipment in place to contain or deal with any spillage. • Emergency stop procedures agreed • Communications system established. • Pipes clean and kept clear of water. • Ship's tanks have capacity to accept the amount ordered. • No smoking and correct signals displayed • All crew advised. The operations are fully observed, all scuppers are blocked and pipes and hoses inspected before bunkering takes place.$trb$, $trb$f9bab5027a5f23893ca9e7d1c1d247bbba68aad3e01b615ab1718aace73899e5$trb$),
  ($trb$MCA-P5-POLLUTION-02$trb$, 2, 78, 78, $trb$PART 5 p.78 task 2$trb$, $trb$Understand procedures to be followed in event of an oil spillage from own or other vessel$trb$, $trb$Understand procedures to be followed in event of an oil spillage from own or other vessel

• Contain spill. • Initiate immediate investigation to detect the source of pollution. • Execute procedures as set out in your SOPEP. • Advise master and inform authorities. All available resources are utilised to detect the source and the master or appropriate authorities are informed.$trb$, $trb$97a9a3d8ff9896f04a2b241485ac2956ddf617971df4b1c354241477eacba32a$trb$),
  ($trb$MCA-P5-POLLUTION-03$trb$, 3, 78, 78, $trb$PART 5 p.78 task 3$trb$, $trb$Carry out bilge and ballast pumping operations$trb$, $trb$Carry out bilge and ballast pumping operations

• Precautions to avoid noxious discharges, and • As for 'preparing the ship for bunkering fuel'. • Use of oily water separator and on- board retention facilities All operations are carried out in accordance with MARPOL and due regard paid to Shipboard Oil Pollution Emergency Plan (SOPEP if applicable).$trb$, $trb$b1e86b5f5c6bcf59a2b7d3e1e62a489814d5edede53f06b94846c5f05248f317$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 17: Maintain Seaworthiness of the Ship
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
  $trb$Maintain Seaworthiness of the Ship$trb$,
  $trb$PART 5 — ONBOARD SHIP OPERATIONS
TASKS – Monitor the stability of the ship / maintain seaworthiness.$trb$,
  17,
  $trb$PART 5 / TASKS – Maintain seaworthiness of the ship$trb$,
  79,
  79
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Maintain Seaworthiness of the Ship$trb$
);

UPDATE public.trb_sections s
SET sort_order = 17,
    description = COALESCE(s.description, $trb$PART 5 — ONBOARD SHIP OPERATIONS
TASKS – Monitor the stability of the ship / maintain seaworthiness.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 5 / TASKS – Maintain seaworthiness of the ship$trb$),
    source_page_start = COALESCE(s.source_page_start, 79),
    source_page_end = COALESCE(s.source_page_end, 79)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Maintain Seaworthiness of the Ship$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Maintain Seaworthiness of the Ship$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P5-SEAWORTHY-01$trb$, 1, 79, 79, $trb$PART 5 p.79 task 1$trb$, $trb$ship Prepare the ship for sea, and ensure watertight integrity$trb$, $trb$ship Prepare the ship for sea, and ensure watertight integrity

• Inspect hull and hull openings, compartments, hatch covers, watertight doors, equipment and gear and take action if any defects are detected. • Ensure that all loose objects are securely fastened to avoid damage. • Understanding of the fundamentals of watertight integrity. The inspection is properly carried out, due regard paid to the prevailing circumstances and areas where defects are most likely to occur. Any defect is immediately reported and recorded and the suggested or executed action adequate for the situation.$trb$, $trb$56aad9a33690d9457f3f41746678d0ade5f10b63ad150f7636d1ce5246ba206c$trb$),
  ($trb$MCA-P5-SEAWORTHY-02$trb$, 2, 79, 79, $trb$PART 5 p.79 task 2$trb$, $trb$Explain the precautions you would adopt relating to the trim and stability of the ship during a voyage$trb$, $trb$Explain the precautions you would adopt relating to the trim and stability of the ship during a voyage

• Working knowledge and application of stability and trim. • Understanding of fundamental actions to be taken in the event of partial loss of intact buoyancy. Inspection is carried out at regular intervals and more frequently in heavy weather or if other incidents occur. Heavy or otherwise dangerous objects are given the highest priority and good seamanship exercised.$trb$, $trb$5320938a6e28931646e780287f5bbfc8dbff9d6e1a9f2213f8c938f0bc8d5c0b$trb$),
  ($trb$MCA-P5-SEAWORTHY-03$trb$, 3, 79, 79, $trb$PART 5 p.79 task 3$trb$, $trb$Understand the precautions relating to the trim and stability of the ship before dry-docking and un-docking$trb$, $trb$Understand the precautions relating to the trim and stability of the ship before dry-docking and un-docking

• Working knowledge and application of stability and trim. • Understanding the result to the ship of partial loss of intact buoyancy. The positioning of heavy gear and equipment is considered. The effects of extra weights added or removed during the dry-docking is considered. Options for minimising free surface effect by emptying or pressing tanks full are considered.$trb$, $trb$3af971158653f34569942eb969a47b20f6e47ab5bc0719030b53240fd7bb3e0c$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Section 18: Monitor Compliance with Legislative Requirements
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
  $trb$Monitor Compliance with Legislative Requirements$trb$,
  $trb$PART 5 — ONBOARD SHIP OPERATIONS
TASK – Monitor compliance with legislation.$trb$,
  18,
  $trb$PART 5 / TASKS – Monitor compliance with legislation requirements$trb$,
  80,
  80
FROM ver
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_sections x
  WHERE x.program_version_id = ver.id
    AND x.title = $trb$Monitor Compliance with Legislative Requirements$trb$
);

UPDATE public.trb_sections s
SET sort_order = 18,
    description = COALESCE(s.description, $trb$PART 5 — ONBOARD SHIP OPERATIONS
TASK – Monitor compliance with legislation.$trb$),
    source_section_reference = COALESCE(s.source_section_reference, $trb$PART 5 / TASKS – Monitor compliance with legislation requirements$trb$),
    source_page_start = COALESCE(s.source_page_start, 80),
    source_page_end = COALESCE(s.source_page_end, 80)
FROM public.trb_program_versions v
JOIN public.trb_programs p ON p.id = v.program_id
WHERE s.program_version_id = v.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND s.title = $trb$Monitor Compliance with Legislative Requirements$trb$;

WITH sec AS (
  SELECT s.id
  FROM public.trb_sections s
  JOIN public.trb_program_versions v ON v.id = s.program_version_id
  JOIN public.trb_programs p ON p.id = v.program_id
  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
    AND v.version = 'mca-source-2014-pilot-1'
    AND s.title = $trb$Monitor Compliance with Legislative Requirements$trb$
)
INSERT INTO public.trb_tasks (
  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,
  required_signer_role, sort_order, is_required,
  source_task_reference, source_page_start, source_page_end, source_text_hash,
  official_signer_instruction
)
SELECT sec.id, t.task_code, t.title, t.description,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  $trb$SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that supports this task. Continue obtaining required signatures in the official Training Record Book.$trb$,
  'captain', t.sort_order, true,
  t.source_ref, t.page_start, t.page_end, t.source_hash,
  $trb$Official TRB: Name of Ship / Date / Signature columns must still be completed in the paper Training Record Book. Digital sign-off does not replace the official book.$trb$
FROM sec
CROSS JOIN (VALUES
  ($trb$MCA-P5-LEGISLATION-01$trb$, 1, 80, 80, $trb$PART 5 p.80 task 1$trb$, $trb$with legislation State where the various international laws, rules and regulations concerning ship safety, manning operation and pollution prevention are detailed$trb$, $trb$with legislation State where the various international laws, rules and regulations concerning ship safety, manning operation and pollution prevention are detailed

Basic working knowledge of the relevant IMO conventions concerning safety of life at sea and protection of the marine environment. The statement given is correct and includes relevant bodies or organisations which may be contacted to attain special information or guidance which is not easily accessible. Legislative requirements relating to safety of life at sea and protection of the marine environment and manning are correctly identified.$trb$, $trb$d38ba95b3901308a0b3295f0d9e21e4a3fa3cf69d0f2647f76482d5df019a6e9$trb$),
  ($trb$MCA-P5-LEGISLATION-02$trb$, 2, 80, 80, $trb$PART 5 p.80 task 2$trb$, $trb$State where the various national laws, rules and regulations concerning ship safety, manning operation and pollution prevention are detailed$trb$, $trb$State where the various national laws, rules and regulations concerning ship safety, manning operation and pollution prevention are detailed

Basis working knowledge of the source and structure of Merchant Shipping Acts, Regulations, Merchant Shipping Notices, Marine Guidance Notes and Marine Information Notes. National legislative requirements relating to safety of life at sea and protection of the marine environment and manning are correctly identified$trb$, $trb$4b369c17c3b9249263038d30ea75edb6e8b10fa5dd7929f304e7db510556076e$trb$)
) AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)
WHERE NOT EXISTS (
  SELECT 1 FROM public.trb_tasks x
  WHERE x.section_id = sec.id AND x.task_code = t.task_code
);

-- Backfill progress rows for existing active enrolments on this version
INSERT INTO public.trb_task_progress (enrollment_id, task_id, status)
SELECT e.id, t.id, 'not_started'
FROM public.trb_enrollments e
JOIN public.trb_program_versions v ON v.id = e.program_version_id
JOIN public.trb_programs p ON p.id = v.program_id
JOIN public.trb_sections s ON s.program_version_id = v.id
JOIN public.trb_tasks t ON t.section_id = s.id
WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1'
  AND e.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.trb_task_progress tp
    WHERE tp.enrollment_id = e.id AND tp.task_id = t.id
  );

UPDATE public.trb_programs
SET
  name = 'OOW (Yachts <3,000 GT) Training Record',
  description =
    'A digital training-record companion based on the MCA-published OOW (Yachts <3,000 GT) Training Record Book (Parts 1–5 task sections). SeaJourney provides a digital companion only — not MCA or PYA approved as a replacement for the official paper book.',
  updated_at = now()
WHERE code = 'SJ-PILOT-MCA-OOW-YACHTS';

UPDATE public.trb_program_versions v
SET
  content_provenance =
    'Task wording imported from the official MCA Yacht Training Record Book PDF (Rev 2). Signable task sections from Parts 1–5 are published in SeaJourney (personal-details / service / testimonial / spare forms excluded). PART 3 Maintain a Safe Navigational Watch retains the curated pilot seed wording.',
  source_checked_at = CURRENT_DATE
FROM public.trb_programs p
WHERE v.program_id = p.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1';

COMMIT;
