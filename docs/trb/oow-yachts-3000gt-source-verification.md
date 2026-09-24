# OOW (Yachts &lt;3,000 GT) Training Record — source verification

**Verification date:** 2026-09-20  
**Status:** Source-verified digital companion (not MCA/PYA approved)

SeaJourney publishes this programme as a **digital companion** to the official MCA Yacht Training Record Book. It does **not** replace the paper TRB and does **not** imply MCA or PYA digital recognition.

## Official source

| Field | Value |
| --- | --- |
| Title | Yacht training record book (TRB) for yacht ratings and officer in charge of a navigational watch, yachts less than 3000 GT |
| Authority | Maritime and Coastguard Agency |
| GOV.UK | https://www.gov.uk/government/publications/yacht-training-record-book-trb |
| GOV.UK published | 7 July 2014 |
| PDF URL | https://assets.publishing.service.gov.uk/media/5dd53a5ce5274a06e4c4f7ff/training_record_book_revision_22_04-2.pdf |
| Local archive | `docs/trb/source/training_record_book_revision_22_04-2.pdf` |
| PDF revision (footer) | Rev 2 (30/06/04) |
| Pages | 81 |
| Licence | Open Government Licence v3.0 |
| OGL | https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ |

## Integrity

| Check | Value |
| --- | --- |
| SHA-256 (local PDF) | `f9146a9600b524e1f7947930f84c90f84a85699796ebb8b08fd0af520973e7a6` |
| Matches seed / promote SQL | Yes |
| Matches `MCA_PILOT_PDF_SHA256` in `src/lib/trb/pilot.ts` | Yes |

Re-check:

```bash
shasum -a 256 docs/trb/source/training_record_book_revision_22_04-2.pdf
```

## SeaJourney programme identifiers

Stable IDs (do not rename — existing enrolments depend on them):

| Field | Value |
| --- | --- |
| Programme code | `SJ-PILOT-MCA-OOW-YACHTS` |
| Display name | OOW (Yachts &lt;3,000 GT) Training Record |
| Version string | `mca-source-2014-pilot-1` |
| Version status (after promote) | `active` |
| `is_official` | `false` |
| `recognition_status` | `not_approved` |
| `programme_type` | `mca_companion` |

Promote migration: `sql/promote-trb-oow-yachts-3000gt-companion.sql`  
Task seed: `sql/seed-trb-mca-oow-pilot-section.sql`  
Task-level page map: [`mca-oow-yachts-pilot-source-manifest.md`](./mca-oow-yachts-pilot-source-manifest.md)

## Currently published content

| Item | Detail |
| --- | --- |
| Scope | Parts **1–5** signable task sections from the official PDF |
| Sections | 18 (see [`oow-yachts-3000gt-full-book-manifest.md`](./oow-yachts-3000gt-full-book-manifest.md)) |
| Approx. tasks | ~254 (12 curated watch tasks + extracted remainder) |
| Seed | `sql/seed-trb-mca-oow-pilot-section.sql` then `sql/seed-trb-oow-yachts-3000gt-full-book.sql` |
| Excluded | Personal details, guidance, service/testimonials, spare forms (book §§1–11 & 13) |

Wording is imported from the official PDF (not paraphrased). Spelling quirks in the source (e.g. “Principals”) are preserved where curated. Column-reflow artifacts may remain in auto-extracted descriptions.

## Companion notice (canonical)

> SeaJourney provides a digital companion to the identified Training Record Book. Continue maintaining any record required by the MCA or your recognised verification body until digital acceptance is confirmed.

Full enrolment disclaimer also states that the programme is **not** approved by the MCA or PYA as a replacement for the official Training Record Book.

## Attribution (display)

> Contains public sector information licensed under the Open Government Licence v3.0. Source: Maritime and Coastguard Agency, Yacht Training Record Book.

## API fields for clients (Flutter / web)

Programme list / detail expose (camelCase; snake_case also present during transition):

- `name`, `code`, `description`
- `isOfficial` / `is_official` → `false`
- `recognitionStatus` → `not_approved`
- `isOowYachts3000` / `isMcaPilot` → `true` for this programme
- `companionNotice`
- `sourceAuthority`, `sourceTitle`, `sourceUrl`, `sourcePublishedAt`
- `sourceRevisionLabel`, `sourcePdfFilename`, `sourceDocumentSha256`
- `sourceLicense`, `sourceLicenseUrl`
- Version: `disclaimer`, `companionNotice`, `attributionHtml`, `sourceVersionReference`, `contentProvenance`, `status`

Demonstration programme `SJ-DEMO-TRB-OOW` is deactivated and filtered from discovery.

## Discovery gate

- `TRB_MCA_OOW_PILOT_ENABLED` — kill-switch (default **on** when unset; set `false` to hide)
- `TRB_MCA_OOW_PILOT_ALLOWED_EMAILS` — optional allowlist; **empty = open** to authenticated users
- Feature flag `training_records` still gates dashboard routes
- Admins bypass the allowlist when the programme is enabled
- Demonstration programme `SJ-DEMO-TRB-OOW` is hidden from discovery

## Deliberately not claimed

- MCA or PYA approval of SeaJourney as an electronic TRB
- Replacement of the official paper book
- Full-book digitisation of personal-details / service / testimonial forms (Parts 1–5 **tasks** are published; forms remain excluded)
- Use of MCA crests, logos, or third-party Bridge Procedures Guide content beyond MCA’s own reference text
