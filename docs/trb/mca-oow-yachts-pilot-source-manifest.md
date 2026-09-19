# MCA OOW (Yachts) TRB — Digital Companion Pilot source manifest

**Access / check date:** 2026-09-19  

## Official publication

| Field | Value |
| --- | --- |
| Title | Yacht training record book (TRB) for yacht ratings and officer in charge of a navigational watch, yachts less than 3000 GT |
| Authority | Maritime and Coastguard Agency |
| GOV.UK page | https://www.gov.uk/government/publications/yacht-training-record-book-trb |
| Published (GOV.UK) | 7 July 2014 |
| PDF | https://assets.publishing.service.gov.uk/media/5dd53a5ce5274a06e4c4f7ff/training_record_book_revision_22_04-2.pdf |
| PDF footer revision | Rev 2 (30/06/04) |
| Pages | 81 |
| Licence (GOV.UK) | Open Government Licence v3.0 unless otherwise stated |
| OGL URL | https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ |

## Selected section (trial)

**PART 3 — NAVIGATION AT OPERATIONAL LEVEL**  
**TASKS — Maintain a Safe Navigational Watch**

| Item | Detail |
| --- | --- |
| Why selected | Complete substantive onboard watchkeeping section (not admin / personal-details pages); clear signable tasks with Master/officer witness columns |
| Source pages | **55–57** (PDF page numbers as printed in footer) |
| Signable tasks imported | **12** (`MCA-P3-WATCH-01` … `MCA-P3-WATCH-12`) |
| General principles | Included in section description (General Principals 1–3) — not separate signable rows |

### Imported task references

| Code | PDF page | Official task statement (title field) |
| --- | --- | --- |
| MCA-P3-WATCH-01 | 55 | On preparing for sea, check ship's draught, and check that the necessary equipment on the bridge is operational and proper sailing information is available. |
| MCA-P3-WATCH-02 | 55 | On leaving or entering port notify the master/engine control room as appropriate. |
| MCA-P3-WATCH-03 | 56 | Assist in carrying out the master/pilot's order/directions. |
| MCA-P3-WATCH-04 | 56 | Monitor the course, speed and position. |
| MCA-P3-WATCH-05 | 56 | Display/sound correct lights, flags, shapes and sound signals. |
| MCA-P3-WATCH-06 | 56 | Properly monitor the pilot's safety when boarding and disembarking. |
| MCA-P3-WATCH-07 | 56 | On leaving or entering port notify the crew as appropriate. |
| MCA-P3-WATCH-08 | 56 | At the commencement of the watch ascertain ship's position, course and speed and appraise the traffic situation and any danger to the ship. |
| MCA-P3-WATCH-09 | 57 | Fix the ship's position regularly, assess risks of collision and/or grounding and take appropriate actions. |
| MCA-P3-WATCH-10 | 57 | Check the reliability of the information obtained from the primary method of position fixing at appropriate intervals. |
| MCA-P3-WATCH-11 | 57 | Adjust the ship's course and speed to the traffic, the waters and the meteorological condition. |
| MCA-P3-WATCH-12 | 57 | Monitor and control navigational instruments and record relevant activities and incidents. |

`source_text_hash` = SHA-256 of `task_code|title|description` (UTF-8). Hashes are stored in `sql/seed-trb-mca-oow-pilot-section.sql`.

## Licence attribution (display copy)

> Contains public sector information licensed under the Open Government Licence v3.0. Source: Maritime and Coastguard Agency, Yacht Training Record Book.

## Deliberately excluded

- Entire Parts 1, 2, 4
- Other Part 3 sections (passage planning / radar & ARPA)
- Personal details, service records, testimonials, familiarisation forms
- MCA crest / logos / diagrams / photographs
- ICS *Bridge Procedures Guide* content (only the MCA reference to it is retained in General Principals 3)
- Third-party diagrams or material beyond Crown/MCA TRB text

## Extraction notes / uncertainties

1. Source spelling **“Principals”** (not “Principles”) is preserved exactly as printed.
2. Column layout in the PDF (Knowledge / Criteria / Witness) is flattened into `title` + `description` for digital display; wording is not paraphrased.
3. GOV.UK lists publication date **2014-07-07**; PDF footer shows **Rev 2 (30/06/04)** — both recorded in metadata.
4. PDF front matter notes Crown copyright / HMSO permission language; GOV.UK states OGL v3.0 for the publication page content unless otherwise stated.
5. Text extraction used the official PDF via `pypdf`; no third-party TRB summaries were used as source wording.

## Programme identifiers

- Code: `SJ-PILOT-MCA-OOW-YACHTS`
- Version: `mca-source-2014-pilot-1`
- `is_official`: false
- `recognition_status`: `not_approved`
