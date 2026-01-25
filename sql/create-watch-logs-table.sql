-- Create watch_logs table for officers to log their watch times
-- Only officers (rank or higher) can log watches

CREATE TABLE IF NOT EXISTS public.watch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  watch_start TIMESTAMPTZ NOT NULL,
  watch_end TIMESTAMPTZ NULL, -- NULL if watch is still ongoing
  watch_type TEXT NOT NULL CHECK (watch_type IN ('bridge', 'engine', 'deck', 'other')),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT watch_end_after_start CHECK (watch_end IS NULL OR watch_end >= watch_start),
  CONSTRAINT no_overlapping_watches EXCLUDE USING GIST (
    user_id WITH =,
    vessel_id WITH =,
    tstzrange(watch_start, COALESCE(watch_end, 'infinity'::timestamptz), '[)') WITH &&
  )
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_watch_logs_user_id ON public.watch_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_logs_vessel_id ON public.watch_logs(vessel_id);
CREATE INDEX IF NOT EXISTS idx_watch_logs_watch_start ON public.watch_logs(watch_start DESC);

-- Enable RLS
ALTER TABLE public.watch_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own watch logs
CREATE POLICY "Users can view their own watch logs"
  ON public.watch_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own watch logs
CREATE POLICY "Users can insert their own watch logs"
  ON public.watch_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own watch logs
CREATE POLICY "Users can update their own watch logs"
  ON public.watch_logs
  FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own watch logs
CREATE POLICY "Users can delete their own watch logs"
  ON public.watch_logs
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policy: Captains can view watch logs for their vessels
CREATE POLICY "Captains can view watch logs for their vessels"
  ON public.watch_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vessels
      WHERE vessels.id = watch_logs.vessel_id
      AND vessels.vessel_manager_id = auth.uid()
    )
  );

-- Add comments
COMMENT ON TABLE public.watch_logs IS 'Watch logs for officers to record their watch times';
COMMENT ON COLUMN public.watch_logs.watch_type IS 'Type of watch: bridge, engine, deck, or other';
COMMENT ON COLUMN public.watch_logs.watch_end IS 'End time of watch. NULL if watch is still ongoing';
