-- Prior milestone requirements + achievement tracking for duration rules
-- e.g. OOW requires EDH milestone held for 18 months

ALTER TABLE public.crew_milestone_progress
  ADD COLUMN IF NOT EXISTS achieved_at TIMESTAMPTZ;

COMMENT ON COLUMN public.crew_milestone_progress.achieved_at IS
  'First time all required milestone requirements were met — used for prior-milestone duration checks.';

ALTER TABLE public.milestone_requirements
  DROP CONSTRAINT IF EXISTS milestone_requirements_requirement_type_check;

ALTER TABLE public.milestone_requirements
  ADD CONSTRAINT milestone_requirements_requirement_type_check
  CHECK (requirement_type IN (
    'profile_fields',
    'certificate',
    'testimonial',
    'proof_of_service',
    'sea_time_min',
    'manual_checklist',
    'external_link',
    'prior_milestone'
  ));

-- EDH as its own milestone (between Watch Rating and OOW)
INSERT INTO public.career_milestones (
  track, level_key, label, description, sort_order,
  sea_time_metric, sea_time_min, sea_time_source, status, published_at
) VALUES (
  'deck', 'edh', 'Efficient Deck Hand (EDH)',
  'MCA EDH — required before OOW; often held for 18+ months before applying.',
  15, NULL, NULL, NULL, 'published', NOW()
)
ON CONFLICT (track, level_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  status = EXCLUDED.status,
  published_at = COALESCE(public.career_milestones.published_at, EXCLUDED.published_at),
  updated_at = NOW();

INSERT INTO public.milestone_requirements (
  milestone_id, sort_order, title, description, requirement_type, config, is_required
)
SELECT m.id, r.sort_order, r.title, r.description, r.requirement_type, r.config::jsonb, r.is_required
FROM public.career_milestones m
CROSS JOIN (
  VALUES (
    0,
    'EDH certificate on file',
    'Valid Efficient Deck Hand certificate.',
    'certificate',
    '{"minCount":1,"nameContains":"EDH","mustNotExpired":true,"presetId":"edh"}',
    TRUE
  )
) AS r(sort_order, title, description, requirement_type, config, is_required)
WHERE m.track = 'deck' AND m.level_key = 'edh'
  AND NOT EXISTS (
    SELECT 1 FROM public.milestone_requirements mr WHERE mr.milestone_id = m.id
  );

-- OOW: require EDH milestone held for 18 months (add if not already present)
INSERT INTO public.milestone_requirements (
  milestone_id, sort_order, title, description, requirement_type, config, is_required
)
SELECT m.id, 2, 'EDH held for 18 months',
  'Complete EDH milestone requirements and hold for at least 18 months before OOW.',
  'prior_milestone',
  '{"levelKey":"edh","minMonths":18}',
  TRUE
FROM public.career_milestones m
WHERE m.track = 'deck' AND m.level_key = 'oow'
  AND NOT EXISTS (
    SELECT 1 FROM public.milestone_requirements mr
    WHERE mr.milestone_id = m.id AND mr.requirement_type = 'prior_milestone'
  );
