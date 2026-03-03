-- Vessel offers to send sea time records to a crew member (from start date to end date).
-- Crew sees the offer in Inbox and can accept or reject. On accept, vessel's daily_state_logs
-- for the date range are copied to the crew member (same as crew-requested sea time flow).

CREATE TABLE IF NOT EXISTS public.vessel_sea_time_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  vessel_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crew_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vessel_offers_end_after_start CHECK (end_date >= start_date),
  CONSTRAINT vessel_offers_valid_status CHECK (status IN ('pending', 'accepted', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_vessel_sea_time_offers_crew_user_id ON public.vessel_sea_time_offers(crew_user_id);
CREATE INDEX IF NOT EXISTS idx_vessel_sea_time_offers_vessel_id ON public.vessel_sea_time_offers(vessel_id);
CREATE INDEX IF NOT EXISTS idx_vessel_sea_time_offers_vessel_user_id ON public.vessel_sea_time_offers(vessel_user_id);
CREATE INDEX IF NOT EXISTS idx_vessel_sea_time_offers_status ON public.vessel_sea_time_offers(status);

DROP TRIGGER IF EXISTS trg_vessel_sea_time_offers_updated_at ON public.vessel_sea_time_offers;
CREATE TRIGGER trg_vessel_sea_time_offers_updated_at
BEFORE UPDATE ON public.vessel_sea_time_offers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vessel_sea_time_offers ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist so this script can be re-run safely
DROP POLICY IF EXISTS "Vessel managers can create sea time offers" ON public.vessel_sea_time_offers;
DROP POLICY IF EXISTS "Vessel managers can view own offers" ON public.vessel_sea_time_offers;
DROP POLICY IF EXISTS "Crew can view offers sent to them" ON public.vessel_sea_time_offers;
DROP POLICY IF EXISTS "Crew can respond to pending offers" ON public.vessel_sea_time_offers;

-- Vessel managers can create offers for crew on their vessel
CREATE POLICY "Vessel managers can create sea time offers"
ON public.vessel_sea_time_offers
FOR INSERT
WITH CHECK (
  auth.uid() = vessel_user_id
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND u.active_vessel_id = vessel_sea_time_offers.vessel_id
  )
);

-- Vessel managers can view their own offers
CREATE POLICY "Vessel managers can view own offers"
ON public.vessel_sea_time_offers
FOR SELECT
USING (auth.uid() = vessel_user_id);

-- Crew members can view offers sent to them
CREATE POLICY "Crew can view offers sent to them"
ON public.vessel_sea_time_offers
FOR SELECT
USING (auth.uid() = crew_user_id);

-- Crew members can update (accept/reject) pending offers sent to them
CREATE POLICY "Crew can respond to pending offers"
ON public.vessel_sea_time_offers
FOR UPDATE
USING (auth.uid() = crew_user_id AND status = 'pending')
WITH CHECK (auth.uid() = crew_user_id AND status IN ('accepted', 'rejected'));

COMMENT ON TABLE public.vessel_sea_time_offers IS 'Vessel offers to send sea time records to crew. Crew accepts or rejects in Inbox; on accept, vessel logs are copied to crew (same as crew-requested sea time).';
