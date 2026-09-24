-- Promote MCA OOW (Yachts <3,000 GT) digital companion presentation.
-- Source PDF: docs/trb/source/training_record_book_revision_22_04-2.pdf
-- Rev 2 (30/06/04) · GOV.UK publication 2014-07-07
--
-- Additive. Preserves programme code SJ-PILOT-MCA-OOW-YACHTS and version
-- mca-source-2014-pilot-1 so existing enrolments keep working.
-- Does NOT claim MCA/PYA digital recognition.
--
-- Run AFTER sql/seed-trb-mca-oow-pilot-section.sql (and related TRB migrations).

BEGIN;

-- Optional provenance columns (nullable for older rows)
ALTER TABLE public.trb_programs
  ADD COLUMN IF NOT EXISTS source_pdf_filename text,
  ADD COLUMN IF NOT EXISTS source_document_sha256 text,
  ADD COLUMN IF NOT EXISTS source_revision_label text,
  ADD COLUMN IF NOT EXISTS companion_notice text;

ALTER TABLE public.trb_program_versions
  ADD COLUMN IF NOT EXISTS superseded_by_version_id uuid
    REFERENCES public.trb_program_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content_provenance text;

-- Hide demonstration programme from new discovery (historical enrolments remain)
UPDATE public.trb_programs
SET
  is_active = false,
  updated_at = now()
WHERE code = 'SJ-DEMO-TRB-OOW';

-- Professional companion presentation for the source-verified OOW programme
UPDATE public.trb_programs
SET
  name = 'OOW (Yachts <3,000 GT) Training Record',
  description =
    'A digital training-record companion based on the current MCA-published OOW (Yachts <3,000 GT) Training Record Book. SeaJourney provides a digital companion only — not MCA or PYA approved as a replacement for the official paper book.',
  programme_type = 'mca_companion',
  issuing_body = 'Maritime and Coastguard Agency',
  is_official = false,
  is_active = true,
  recognition_status = 'not_approved',
  recognised_by = null,
  recognised_at = null,
  source_authority = 'Maritime and Coastguard Agency',
  source_title =
    'Yacht training record book (TRB) for yacht ratings and officer in charge of a navigational watch, yachts less than 3000 GT',
  source_url =
    'https://www.gov.uk/government/publications/yacht-training-record-book-trb',
  source_published_at = '2014-07-07',
  source_license = 'Open Government Licence v3.0',
  source_license_url =
    'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  source_pdf_filename = 'training_record_book_revision_22_04-2.pdf',
  source_document_sha256 =
    'f9146a9600b524e1f7947930f84c90f84a85699796ebb8b08fd0af520973e7a6',
  source_revision_label = 'Rev 2 (30/06/04)',
  companion_notice =
    'SeaJourney provides a digital companion to the identified Training Record Book. Continue maintaining any record required by the MCA or your recognised verification body until digital acceptance is confirmed.',
  updated_at = now()
WHERE code = 'SJ-PILOT-MCA-OOW-YACHTS';

UPDATE public.trb_program_versions v
SET
  status = 'active',
  disclaimer =
    'SeaJourney provides a digital companion to the identified Training Record Book. Continue maintaining any record required by the MCA or your recognised verification body until digital acceptance is confirmed. This programme is not approved by the Maritime and Coastguard Agency or the Professional Yachting Association as a replacement for the official Training Record Book.',
  pilot_disclaimer =
    'SeaJourney provides a digital companion to the identified Training Record Book. Continue maintaining any record required by the MCA or your recognised verification body until digital acceptance is confirmed. This programme is not approved by the Maritime and Coastguard Agency or the Professional Yachting Association as a replacement for the official Training Record Book.',
  source_version_reference =
    'training_record_book_revision_22_04-2.pdf · Rev 2 (30/06/04) · GOV.UK publication 2014-07-07 · sha256:f9146a9600b524e1f7947930f84c90f84a85699796ebb8b08fd0af520973e7a6',
  source_checked_at = CURRENT_DATE,
  attribution_html =
    'Contains public sector information licensed under the Open Government Licence v3.0. Source: Maritime and Coastguard Agency, Yacht Training Record Book.',
  content_provenance =
    'Task wording imported from the official MCA Yacht Training Record Book PDF (Rev 2). One section currently published in SeaJourney: PART 3 — Maintain a Safe Navigational Watch (source pages 55–57).',
  published_at = COALESCE(v.published_at, now())
FROM public.trb_programs p
WHERE v.program_id = p.id
  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'
  AND v.version = 'mca-source-2014-pilot-1';

COMMIT;
