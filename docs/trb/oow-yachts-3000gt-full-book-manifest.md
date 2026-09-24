# OOW (Yachts <3,000 GT) — full-book task manifest

**Source PDF:** `docs/trb/source/training_record_book_revision_22_04-2.pdf` · Rev 2 (30/06/04)
**Seed:** `sql/seed-trb-oow-yachts-3000gt-full-book.sql`
**Machine extract:** `docs/trb/extracted/oow-yachts-3000gt-tasks.json`
**Extractor:** `scripts/trb/extract_oow_trb_full_book.py`

Personal details, guidance, service records, testimonials, familiarisation checklists (book sections 1–11), and spare forms are **not** imported as signable tasks.

Extracted new tasks (excluding curated watch section): **242**
Curated watch section (`Maintain a Safe Navigational Watch`): **12** tasks from prior seed.
Approximate published total after seed: **254**

| Part | Section | Pages | Tasks |
| --- | --- | --- | ---: |
| 1 | Yacht Rating Certificate (Support Level Functions) | 24–31 | 37 |
| 2 | Familiarisation and Emergency Procedures | 32–35 | 26 |
| 2 | Shipboard Operations | 36–44 | 55 |
| 2 | Shipboard Operations – Sailing and Sail Training Vessels Only | 45–48 | 26 |
| 3 | Plan a Passage and Conduct a Passage and Determine Position | 49–54 | 19 |
| 3 | Maintain a Safe Navigational Watch | 55–57 | 12 |
| 3 | Use Radar and ARPA to Maintain Safety of Navigation | 58–62 | 17 |
| 4 | Manoeuvre the Ship | 63–69 | 22 |
| 4 | Respond to Emergencies | 70–71 | 6 |
| 4 | Prevent, Control and Fight Fires on Board | 72–72 | 5 |
| 4 | Operate Life Saving Appliances | 73–73 | 7 |
| 4 | Apply Medical First Aid on Board | 74–74 | 4 |
| 4 | Respond to a Distress Signal at Sea | 75–75 | 3 |
| 4 | Use of IMO Standard Marine Communication Phrases and Use of English | 76–76 | 5 |
| 4 | Transmit and Receive Information by Visual Signalling | 77–77 | 2 |
| 5 | Ensure Compliance with Pollution Prevention Requirements | 78–78 | 3 |
| 5 | Maintain Seaworthiness of the Ship | 79–79 | 3 |
| 5 | Monitor Compliance with Legislative Requirements | 80–80 | 2 |

## Notes

1. PDF text extraction flattens multi-column Knowledge/Criteria layouts; wording is taken from the official PDF via `pypdf`.
2. Hyphenation and column-reflow artifacts may remain in longer descriptions.
3. Page 58 (radar syllabus prerequisites) has no signable witness rows — stored in section description only.
4. Firefighting tasks on page 72 are filed under contents title *Prevent, Control and Fight Fires on Board*.
5. Existing active enrolments receive new `trb_task_progress` rows via the seed backfill.
