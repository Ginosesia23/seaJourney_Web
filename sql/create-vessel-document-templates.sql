-- Vessel document templates for the AI scanner's "Custom Templates" feature.
--
-- A template captures everything needed to re-fill an external PDF/image
-- form for any crew member on the vessel:
--   - the original document (stored in Supabase Storage)
--   - the extracted/edited field layout (labels, positions, profile keys)
--   - optional defaults and metadata
--
-- Templates are scoped per vessel. Any user with access to the vessel can
-- see and use its templates; only the creator or a vessel manager of that
-- vessel can delete them. Storage objects are kept in a dedicated bucket
-- keyed by `<vessel_id>/<template_id>/<filename>` so RLS mirrors the DB.

CREATE TABLE IF NOT EXISTS public.vessel_document_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id       UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  -- MIME type of the stored original document (application/pdf, image/png, etc.)
  file_type       TEXT NOT NULL,
  -- Storage object path inside the vessel-document-templates bucket.
  file_path       TEXT NOT NULL,
  -- Original filename for nicer downloads (e.g. MCA_Sea_Service.pdf).
  original_filename TEXT,
  -- JSON array of TemplateField objects. Each entry:
  --   {
  --     id: string,                 -- stable client-side id
  --     label: string,              -- human-facing name shown in the builder
  --     profileKey: string | null,  -- what auto-fills (e.g. firstName, atSeaDays, vesselName)
  --     page: number,               -- 1-indexed PDF page (or 1 for images)
  --     bbox: { xMin, yMin, xMax, yMax }, -- normalized [0..1000] coords
  --     fontSize?: number,          -- optional override
  --     defaultValue?: string|null  -- optional static value (e.g. fixed text)
  --   }
  fields          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Free-form metadata so we can extend without a migration.
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vessel_document_templates_vessel
  ON public.vessel_document_templates(vessel_id, created_at DESC);

COMMENT ON TABLE public.vessel_document_templates IS
  'Reusable fillable document templates scanned via the AI scanner. Scoped per vessel. Each row points at a stored PDF/image and carries the field-layout / profile-key mapping used to auto-fill it for any crew member.';

-- Keep updated_at in sync.
CREATE OR REPLACE FUNCTION public.touch_vessel_document_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vessel_document_templates_updated_at
  ON public.vessel_document_templates;
CREATE TRIGGER trg_vessel_document_templates_updated_at
  BEFORE UPDATE ON public.vessel_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_vessel_document_templates_updated_at();

ALTER TABLE public.vessel_document_templates ENABLE ROW LEVEL SECURITY;

-- READ: vessel managers of the vessel, crew assigned to the vessel, and
-- admins can see templates. We keep this in a single EXISTS check so it
-- matches the other vessel-scoped policies in this project.
DROP POLICY IF EXISTS "Vessel members can read document templates"
  ON public.vessel_document_templates;
CREATE POLICY "Vessel members can read document templates"
ON public.vessel_document_templates
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.role = 'admin'
        OR (u.role = 'vessel' AND u.active_vessel_id = vessel_document_templates.vessel_id)
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.vessel_assignments va
    WHERE va.user_id = auth.uid()
      AND va.vessel_id = vessel_document_templates.vessel_id
  )
);

-- INSERT: only vessel managers (or admins) of the target vessel can
-- create templates. `created_by` is forced to auth.uid() via WITH CHECK.
DROP POLICY IF EXISTS "Vessel managers can create document templates"
  ON public.vessel_document_templates;
CREATE POLICY "Vessel managers can create document templates"
ON public.vessel_document_templates
FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.role = 'admin'
        OR (u.role = 'vessel' AND u.active_vessel_id = vessel_document_templates.vessel_id)
      )
  )
);

-- UPDATE: creator or vessel manager of the vessel (or admin) can edit.
DROP POLICY IF EXISTS "Vessel managers can update document templates"
  ON public.vessel_document_templates;
CREATE POLICY "Vessel managers can update document templates"
ON public.vessel_document_templates
FOR UPDATE
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.role = 'admin'
        OR (u.role = 'vessel' AND u.active_vessel_id = vessel_document_templates.vessel_id)
      )
  )
)
WITH CHECK (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.role = 'admin'
        OR (u.role = 'vessel' AND u.active_vessel_id = vessel_document_templates.vessel_id)
      )
  )
);

-- DELETE: same rule as UPDATE.
DROP POLICY IF EXISTS "Vessel managers can delete document templates"
  ON public.vessel_document_templates;
CREATE POLICY "Vessel managers can delete document templates"
ON public.vessel_document_templates
FOR DELETE
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.role = 'admin'
        OR (u.role = 'vessel' AND u.active_vessel_id = vessel_document_templates.vessel_id)
      )
  )
);

-- ---------------------------------------------------------------------------
-- Storage bucket for the actual document files.
-- Bucket is private; files are served through API routes that stream the
-- bytes after checking template access, so we never expose raw URLs.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('vessel-document-templates', 'vessel-document-templates', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS mirrors the DB table. Object names are laid out as
-- `<vessel_id>/<template_id>/<filename>`, so the first path segment is the
-- vessel id — we use that for access checks.
DROP POLICY IF EXISTS "Vessel members can read template files" ON storage.objects;
CREATE POLICY "Vessel members can read template files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'vessel-document-templates'
  AND (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'admin'
          OR (u.role = 'vessel' AND u.active_vessel_id::text = (storage.foldername(name))[1])
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.vessel_assignments va
      WHERE va.user_id = auth.uid()
        AND va.vessel_id::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS "Vessel managers can write template files" ON storage.objects;
CREATE POLICY "Vessel managers can write template files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'vessel-document-templates'
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.role = 'admin'
        OR (u.role = 'vessel' AND u.active_vessel_id::text = (storage.foldername(name))[1])
      )
  )
);

DROP POLICY IF EXISTS "Vessel managers can delete template files" ON storage.objects;
CREATE POLICY "Vessel managers can delete template files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'vessel-document-templates'
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.role = 'admin'
        OR (u.role = 'vessel' AND u.active_vessel_id::text = (storage.foldername(name))[1])
      )
  )
);
