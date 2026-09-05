-- Admin-managed certificate catalog (dropdown for crew Certificates + career milestones).
-- Seeded from the previous hard-coded CERTIFICATE_PRESETS list.

CREATE TABLE IF NOT EXISTS public.certificate_catalog (
  id text PRIMARY KEY,
  name text NOT NULL,
  certificate_type text NOT NULL,
  issuing_authority text NOT NULL DEFAULT '',
  typical_validity_years integer,
  renewal_required boolean NOT NULL DEFAULT true,
  renewal_notice_days integer NOT NULL DEFAULT 90,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  aliases text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT certificate_catalog_category_check CHECK (
    category IN ('stcw', 'medical', 'mca', 'radio', 'other')
  ),
  CONSTRAINT certificate_catalog_id_format CHECK (
    id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

COMMENT ON TABLE public.certificate_catalog IS
  'Catalog of certificate types admins maintain. Used for crew add-certificate dropdown and career milestone requirements.';

CREATE INDEX IF NOT EXISTS idx_certificate_catalog_active_sort
  ON public.certificate_catalog (active, sort_order, name);

DROP TRIGGER IF EXISTS trg_certificate_catalog_updated_at ON public.certificate_catalog;
CREATE TRIGGER trg_certificate_catalog_updated_at
BEFORE UPDATE ON public.certificate_catalog
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.certificate_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read certificate_catalog"
  ON public.certificate_catalog;
CREATE POLICY "Anyone authenticated can read certificate_catalog"
ON public.certificate_catalog
FOR SELECT
TO authenticated
USING (active = true OR public.is_admin_user_safe());

DROP POLICY IF EXISTS "Admins manage certificate_catalog"
  ON public.certificate_catalog;
CREATE POLICY "Admins manage certificate_catalog"
ON public.certificate_catalog
FOR ALL
TO authenticated
USING (public.is_admin_user_safe())
WITH CHECK (public.is_admin_user_safe());

INSERT INTO public.certificate_catalog (
  id, name, certificate_type, issuing_authority, typical_validity_years,
  renewal_required, renewal_notice_days, description, category, aliases, sort_order, active
) VALUES
  ('stcw-bst', 'STCW Basic Safety Training', 'STCW', 'MCA', 5, true, 90,
   'Personal survival, fire fighting, elementary first aid, PSSR', 'stcw',
   ARRAY['stcw basic safety','basic safety training','bst','stcw bst'], 10, true),
  ('stcw-security', 'STCW Security Awareness', 'STCW', 'MCA', NULL, false, 90,
   'Ship security awareness (A-VI/6)', 'stcw',
   ARRAY['security awareness','ship security awareness'], 20, true),
  ('stcw-psc', 'STCW Proficiency in Survival Craft', 'STCW', 'MCA', 5, true, 90,
   'PSC & rescue boats (other than fast rescue boats)', 'stcw',
   ARRAY['survival craft','psc'], 30, true),
  ('stcw-aff', 'STCW Advanced Fire Fighting', 'STCW', 'MCA', 5, true, 90,
   'Advanced fire fighting (A-VI/3)', 'stcw',
   ARRAY['advanced fire fighting','aff'], 40, true),
  ('stcw-mfa', 'STCW Medical First Aid', 'STCW', 'MCA', 5, true, 90,
   'Medical first aid (A-VI/4-1)', 'stcw',
   ARRAY['medical first aid'], 50, true),
  ('edh', 'Efficient Deck Hand (EDH)', 'MCA', 'MCA', NULL, false, 90,
   'MCA Efficient Deck Hand certificate', 'mca',
   ARRAY['efficient deck hand','edh'], 60, true),
  ('eng1', 'ENG1 Medical Certificate', 'Medical', 'MCA', 2, true, 60,
   'Seafarer medical fitness certificate (ENG1)', 'medical',
   ARRAY['eng1','eng 1'], 70, true),
  ('ml5', 'ML5 Medical Certificate', 'Medical', 'MCA', 5, true, 90,
   'Medical for small commercial vessels / yachts', 'medical',
   ARRAY['ml5','ml 5'], 80, true),
  ('gmdss', 'GMDSS (GOC / ROC)', 'Radio', 'MCA', 5, true, 90,
   'Global Maritime Distress and Safety System radio cert', 'radio',
   ARRAY['gmdss','goc','roc','gmdss goc','gmdss roc'], 90, true),
  ('ecdis', 'ECDIS Generic', 'STCW', 'MCA', NULL, false, 90,
   'Electronic Chart Display and Information System', 'stcw',
   ARRAY['ecdis'], 100, true),
  ('yachtmaster-offshore', 'Yachtmaster Offshore', 'MCA', 'RYA / MCA', NULL, false, 90,
   'RYA Yachtmaster Offshore (Coastal / Offshore)', 'mca',
   ARRAY['yachtmaster offshore'], 110, true),
  ('yachtmaster-ocean', 'Yachtmaster Ocean', 'MCA', 'RYA / MCA', NULL, false, 90,
   'RYA Yachtmaster Ocean', 'mca',
   ARRAY['yachtmaster ocean'], 120, true),
  ('oow-yacht', 'Officer of the Watch (Yacht)', 'MCA', 'MCA', 5, true, 90,
   'OOW Yacht CoC', 'mca',
   ARRAY['officer of the watch','oow yacht','oow (yacht)'], 130, true),
  ('chief-mate-yacht', 'Chief Mate (Yacht)', 'MCA', 'MCA', 5, true, 90,
   'Chief Mate Yacht CoC', 'mca',
   ARRAY['chief mate'], 140, true),
  ('master-yacht', 'Master (Yacht)', 'MCA', 'MCA', 5, true, 90,
   'Master Yacht CoC (e.g. <200gt / <500gt / <3000gt)', 'mca',
   ARRAY['master (yacht)','master yacht'], 150, true),
  ('aec', 'Approved Engine Course (AEC)', 'MCA', 'MCA', NULL, false, 90,
   'AEC 1 / AEC 2 for yacht engineers', 'mca',
   ARRAY['approved engine course','aec'], 160, true),
  ('pssr', 'Personal Safety & Social Responsibilities', 'STCW', 'MCA', NULL, false, 90,
   'PSSR module (often part of BST)', 'stcw',
   ARRAY['personal safety','pssr'], 170, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  certificate_type = EXCLUDED.certificate_type,
  issuing_authority = EXCLUDED.issuing_authority,
  typical_validity_years = EXCLUDED.typical_validity_years,
  renewal_required = EXCLUDED.renewal_required,
  renewal_notice_days = EXCLUDED.renewal_notice_days,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  aliases = EXCLUDED.aliases,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
