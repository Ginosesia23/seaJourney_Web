-- Multiple admin notes per feature flag (history / reasons for toggles).
-- Run after sql/create-platform-feature-flags.sql

CREATE TABLE IF NOT EXISTS public.platform_feature_flag_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL REFERENCES public.platform_feature_flags (key) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS platform_feature_flag_notes_key_created_idx
  ON public.platform_feature_flag_notes (feature_key, created_at DESC);

COMMENT ON TABLE public.platform_feature_flag_notes IS
  'Append-only admin notes for platform feature flags.';

ALTER TABLE public.platform_feature_flag_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage platform_feature_flag_notes"
  ON public.platform_feature_flag_notes;
CREATE POLICY "Admins can manage platform_feature_flag_notes"
ON public.platform_feature_flag_notes
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- One-time: copy legacy single `note` into the history table when present.
INSERT INTO public.platform_feature_flag_notes (feature_key, body, created_at, created_by)
SELECT f.key, f.note, COALESCE(f.updated_at, now()), f.updated_by
FROM public.platform_feature_flags f
WHERE f.note IS NOT NULL
  AND length(trim(f.note)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.platform_feature_flag_notes n
    WHERE n.feature_key = f.key
      AND n.body = f.note
  );
