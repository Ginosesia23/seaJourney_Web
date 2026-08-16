-- Allow vessel managers to insert (and then read) testimonials for crew on
-- vessels they manage, without requiring an approved sea-time access request.
--
-- Error this fixes:
--   new row violates row-level security policy for table "testimonials"
-- when using "Send to Captain" after generating a testimonial.
--
-- Existing policy "Vessel managers can insert testimonials for crew with
-- approved access" still covers the access-request path. This adds the
-- own-vessel path used when generating from vessel logs.
--
-- Also relaxes crew self-insert so it does not depend on SELECT on public.users
-- (that EXISTS check fails when the captain profile is not visible to the crew
-- member under users RLS). captain_user_id is still validated by the FK.

BEGIN;

-- ── Vessel manager INSERT on their vessel ──────────────────────────────
DROP POLICY IF EXISTS "Vessel managers can insert testimonials for crew on their vessel"
  ON public.testimonials;

CREATE POLICY "Vessel managers can insert testimonials for crew on their vessel"
ON public.testimonials
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.vessels v ON v.id = testimonials.vessel_id
    WHERE u.id = auth.uid()
      AND u.role = 'vessel'
      AND (
        u.active_vessel_id = testimonials.vessel_id
        OR v.vessel_manager_id = auth.uid()
      )
  )
);

COMMENT ON POLICY "Vessel managers can insert testimonials for crew on their vessel"
  ON public.testimonials IS
  'Allows vessel managers to create testimonial requests for crew on their active/managed vessel, including Send to Captain when the crew has not granted sea-time access.';

-- ── Vessel manager SELECT so INSERT … RETURNING / .select() works ──────
DROP POLICY IF EXISTS "Vessel managers can view testimonials they generated"
  ON public.testimonials;

CREATE POLICY "Vessel managers can view testimonials they generated"
ON public.testimonials
FOR SELECT
USING (
  generated_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.vessels v ON v.id = testimonials.vessel_id
    WHERE u.id = auth.uid()
      AND u.role = 'vessel'
      AND (
        u.active_vessel_id = testimonials.vessel_id
        OR v.vessel_manager_id = auth.uid()
      )
  )
);

COMMENT ON POLICY "Vessel managers can view testimonials they generated"
  ON public.testimonials IS
  'Lets vessel managers read testimonials they created or that belong to their vessel, so Send to Captain can return the new row.';

-- ── Crew (and anyone) creating their own testimonial ───────────────────
-- Drop the captain_user_id EXISTS (public.users) check; FK already enforces
-- that captain_user_id points at a real auth user.
DROP POLICY IF EXISTS "Users can create testimonials with captain_user_id"
  ON public.testimonials;

CREATE POLICY "Users can create testimonials with captain_user_id"
ON public.testimonials
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
);

COMMENT ON POLICY "Users can create testimonials with captain_user_id"
  ON public.testimonials IS
  'Crew can create their own testimonials (including Send to Captain). captain_user_id is optional and validated by foreign key.';

COMMIT;
