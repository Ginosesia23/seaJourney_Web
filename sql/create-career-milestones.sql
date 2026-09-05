-- Admin-configurable career milestones (tickets) and their requirements.
-- Crew accounts use published milestones to track progress toward the next ticket.

CREATE TABLE IF NOT EXISTS public.career_milestones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track             TEXT NOT NULL DEFAULT 'deck'
                      CHECK (track IN ('deck', 'engine', 'interior', 'galley', 'any')),
  level_key         TEXT NOT NULL,
  label             TEXT NOT NULL,
  description       TEXT,
  sort_order        INT NOT NULL DEFAULT 0,
  sea_time_metric   TEXT CHECK (sea_time_metric IN ('atSeaDays', 'totalDays', 'standbyDays')),
  sea_time_min      INT,
  sea_time_source   TEXT CHECK (sea_time_source IN ('testimonials', 'tracked')),
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'published', 'archived')),
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (track, level_key)
);

CREATE INDEX IF NOT EXISTS idx_career_milestones_status
  ON public.career_milestones(status, track, sort_order);

CREATE TABLE IF NOT EXISTS public.milestone_requirements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id      UUID NOT NULL REFERENCES public.career_milestones(id) ON DELETE CASCADE,
  sort_order        INT NOT NULL DEFAULT 0,
  title             TEXT NOT NULL,
  description       TEXT,
  requirement_type  TEXT NOT NULL CHECK (requirement_type IN (
                      'profile_fields',
                      'certificate',
                      'testimonial',
                      'proof_of_service',
                      'sea_time_min',
                      'manual_checklist',
                      'external_link',
                      'prior_milestone'
                    )),
  config            JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_required       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestone_requirements_milestone
  ON public.milestone_requirements(milestone_id, sort_order);

CREATE TABLE IF NOT EXISTS public.crew_milestone_progress (
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  milestone_id          UUID NOT NULL REFERENCES public.career_milestones(id) ON DELETE CASCADE,
  completed_manual_ids  UUID[] NOT NULL DEFAULT '{}',
  achieved_at           TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, milestone_id)
);

CREATE OR REPLACE FUNCTION public.touch_career_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_career_milestones_updated_at ON public.career_milestones;
CREATE TRIGGER trg_career_milestones_updated_at
  BEFORE UPDATE ON public.career_milestones
  FOR EACH ROW EXECUTE FUNCTION public.touch_career_milestones_updated_at();

CREATE OR REPLACE FUNCTION public.touch_crew_milestone_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crew_milestone_progress_updated_at ON public.crew_milestone_progress;
CREATE TRIGGER trg_crew_milestone_progress_updated_at
  BEFORE UPDATE ON public.crew_milestone_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_crew_milestone_progress_updated_at();

ALTER TABLE public.career_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestone_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_milestone_progress ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin_user_safe()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.users WHERE id = auth.uid();
  RETURN COALESCE(user_role = 'admin', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_admin_user_safe() TO authenticated;

DROP POLICY IF EXISTS "Read published career milestones" ON public.career_milestones;
CREATE POLICY "Read published career milestones"
ON public.career_milestones FOR SELECT
USING (status = 'published' OR public.is_admin_user_safe());

DROP POLICY IF EXISTS "Admins manage career milestones" ON public.career_milestones;
CREATE POLICY "Admins manage career milestones"
ON public.career_milestones FOR ALL
USING (public.is_admin_user_safe())
WITH CHECK (public.is_admin_user_safe());

DROP POLICY IF EXISTS "Read milestone requirements" ON public.milestone_requirements;
CREATE POLICY "Read milestone requirements"
ON public.milestone_requirements FOR SELECT
USING (
  public.is_admin_user_safe()
  OR EXISTS (
    SELECT 1 FROM public.career_milestones m
    WHERE m.id = milestone_requirements.milestone_id
      AND m.status = 'published'
  )
);

DROP POLICY IF EXISTS "Admins manage milestone requirements" ON public.milestone_requirements;
CREATE POLICY "Admins manage milestone requirements"
ON public.milestone_requirements FOR ALL
USING (public.is_admin_user_safe())
WITH CHECK (public.is_admin_user_safe());

DROP POLICY IF EXISTS "Users manage own milestone progress" ON public.crew_milestone_progress;
CREATE POLICY "Users manage own milestone progress"
ON public.crew_milestone_progress FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read milestone progress" ON public.crew_milestone_progress;
CREATE POLICY "Admins read milestone progress"
ON public.crew_milestone_progress FOR SELECT
USING (public.is_admin_user_safe());

-- Seed deck ladder (idempotent via ON CONFLICT)
INSERT INTO public.career_milestones (
  track, level_key, label, description, sort_order,
  sea_time_metric, sea_time_min, sea_time_source, status, published_at
) VALUES
  (
    'deck', 'watch_rating', 'Watch Rating',
    'MCA Watch Rating Certificate — first deck ticket for many crew.',
    10, 'totalDays', 180, 'testimonials', 'published', NOW()
  ),
  (
    'deck', 'oow', 'Officer of the Watch (OOW)',
    'MCA OOW Certificate of Competency — typically after Watch Rating and sufficient sea service.',
    20, 'totalDays', 1095, 'testimonials', 'published', NOW()
  ),
  (
    'deck', 'chief_mate', 'Chief Mate',
    'Chief Mate CoC — senior deck officer ticket after OOW experience.',
    30, 'totalDays', 1460, 'testimonials', 'published', NOW()
  ),
  (
    'deck', 'master', 'Master / Captain',
    'Master Mariner CoC — command-level ticket.',
    40, 'totalDays', 1825, 'testimonials', 'published', NOW()
  )
ON CONFLICT (track, level_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  sea_time_metric = EXCLUDED.sea_time_metric,
  sea_time_min = EXCLUDED.sea_time_min,
  sea_time_source = EXCLUDED.sea_time_source,
  status = EXCLUDED.status,
  published_at = COALESCE(public.career_milestones.published_at, EXCLUDED.published_at),
  updated_at = NOW();

-- OOW requirements (only insert if milestone has none yet)
INSERT INTO public.milestone_requirements (
  milestone_id, sort_order, title, description, requirement_type, config, is_required
)
SELECT m.id, r.sort_order, r.title, r.description, r.requirement_type, r.config::jsonb, r.is_required
FROM public.career_milestones m
CROSS JOIN (
  VALUES
    (
      0,
      'Complete identity profile',
      'Name, nationality, date of birth, and discharge book number.',
      'profile_fields',
      '{"fields":["first_name","last_name","nationality","date_of_birth","discharge_book_number"]}',
      TRUE
    ),
    (
      1,
      'STCW Basic Safety Training',
      'Valid STCW BST certificate on file.',
      'certificate',
      '{"minCount":1,"nameContains":"Basic Safety","mustNotExpired":true,"presetId":"stcw-bst"}',
      TRUE
    ),
    (
      2,
      'Efficient Deck Hand (EDH)',
      'EDH certificate for OOW pathway.',
      'certificate',
      '{"minCount":1,"nameContains":"EDH","mustNotExpired":true,"presetId":"edh"}',
      TRUE
    ),
    (
      3,
      'Approved sea service testimonials',
      'At least one approved testimonial documenting sea time.',
      'testimonial',
      '{"minCount":1,"status":"approved"}',
      TRUE
    ),
    (
      4,
      '36 months total sea service',
      'Documented total sea service toward OOW (1095 days).',
      'sea_time_min',
      '{"metric":"totalDays","min":1095,"source":"testimonials"}',
      TRUE
    ),
    (
      5,
      'Navigational watch training complete',
      'Confirm navigational watch / OOW prep courses completed.',
      'manual_checklist',
      '{"hint":"Tick when your OOW prep modules and oral prep are complete."}',
      FALSE
    )
) AS r(sort_order, title, description, requirement_type, config, is_required)
WHERE m.track = 'deck' AND m.level_key = 'oow'
  AND NOT EXISTS (
    SELECT 1 FROM public.milestone_requirements mr WHERE mr.milestone_id = m.id
  );
