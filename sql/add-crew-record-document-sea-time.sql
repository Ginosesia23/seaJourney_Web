-- Sea-service totals on uploaded crew records so historical testimonials
-- can count toward career tracking / proof of service.
--
-- Run this in Supabase if you already created public.crew_record_documents.
-- Safe to re-run. New installs that use the updated
-- create-crew-record-documents.sql already include these columns.

ALTER TABLE public.crew_record_documents
  ADD COLUMN IF NOT EXISTS start_date DATE NULL,
  ADD COLUMN IF NOT EXISTS end_date DATE NULL,
  ADD COLUMN IF NOT EXISTS total_days INTEGER NULL CHECK (total_days IS NULL OR total_days >= 0),
  ADD COLUMN IF NOT EXISTS at_sea_days INTEGER NULL CHECK (at_sea_days IS NULL OR at_sea_days >= 0),
  ADD COLUMN IF NOT EXISTS standby_days INTEGER NULL CHECK (standby_days IS NULL OR standby_days >= 0),
  ADD COLUMN IF NOT EXISTS yard_days INTEGER NULL CHECK (yard_days IS NULL OR yard_days >= 0),
  ADD COLUMN IF NOT EXISTS leave_days INTEGER NULL CHECK (leave_days IS NULL OR leave_days >= 0),
  ADD COLUMN IF NOT EXISTS counts_toward_career BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.crew_record_documents
  DROP CONSTRAINT IF EXISTS crew_record_documents_end_after_start;
ALTER TABLE public.crew_record_documents
  ADD CONSTRAINT crew_record_documents_end_after_start
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);

COMMENT ON COLUMN public.crew_record_documents.counts_toward_career IS
  'When true, at-sea / total / standby days are included in career documented sea time.';
COMMENT ON COLUMN public.crew_record_documents.at_sea_days IS
  'At-sea days attested on this uploaded testimonial or proof of service.';
