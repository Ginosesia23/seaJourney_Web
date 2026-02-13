-- Allow 'passenger-yacht' (and keep in sync with frontend vessel-types.ts)
-- Drop existing type check and recreate with full list including passenger-yacht

ALTER TABLE public.vessels
DROP CONSTRAINT IF EXISTS vessels_type_check;

ALTER TABLE public.vessels
ADD CONSTRAINT vessels_type_check CHECK (
  type IS NULL
  OR type IN (
    'motor-yacht',
    'sailing-yacht',
    'catamaran',
    'superyacht',
    'megayacht',
    'passenger-yacht',
    'trawler',
    'fishing-vessel',
    'cargo-ship',
    'container-ship',
    'tanker',
    'cruise-ship',
    'ferry',
    'research-vessel',
    'offshore-vessel',
    'other'
  )
);

COMMENT ON CONSTRAINT vessels_type_check ON public.vessels IS
'Vessel type must match dropdown options (see src/lib/vessel-types.ts).';
