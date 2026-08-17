-- Admin operating costs: monthly/yearly recurring spend tracked against revenue.
-- Run in Supabase SQL editor once.

CREATE TABLE IF NOT EXISTS public.admin_operating_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  amount_gbp numeric(12, 2) NOT NULL CHECK (amount_gbp >= 0),
  cadence text NOT NULL DEFAULT 'monthly'
    CHECK (cadence IN ('monthly', 'yearly', 'one_time')),
  billing_day integer CHECK (billing_day IS NULL OR (billing_day >= 1 AND billing_day <= 28)),
  start_date date,
  end_date date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT admin_operating_costs_date_range CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  )
);

COMMENT ON TABLE public.admin_operating_costs IS
  'Admin-managed operating spend (Supabase, domain, hosting, tools). Used with subscription MRR for net profit.';

CREATE INDEX IF NOT EXISTS admin_operating_costs_active_idx
  ON public.admin_operating_costs (is_active, cadence);

ALTER TABLE public.admin_operating_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select admin_operating_costs"
  ON public.admin_operating_costs;
CREATE POLICY "Admins can select admin_operating_costs"
ON public.admin_operating_costs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can insert admin_operating_costs"
  ON public.admin_operating_costs;
CREATE POLICY "Admins can insert admin_operating_costs"
ON public.admin_operating_costs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can update admin_operating_costs"
  ON public.admin_operating_costs;
CREATE POLICY "Admins can update admin_operating_costs"
ON public.admin_operating_costs
FOR UPDATE
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

DROP POLICY IF EXISTS "Admins can delete admin_operating_costs"
  ON public.admin_operating_costs;
CREATE POLICY "Admins can delete admin_operating_costs"
ON public.admin_operating_costs
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);
