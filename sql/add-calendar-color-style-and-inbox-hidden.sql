-- Calendar palette preference and inbox items cleared by the account holder.
-- Default is the original saturated (dark) squares.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS calendar_color_style text DEFAULT 'dark';

ALTER TABLE public.users
  ALTER COLUMN calendar_color_style SET DEFAULT 'dark';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS inbox_hidden_items jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_calendar_color_style_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_calendar_color_style_check
  CHECK (calendar_color_style IS NULL OR calendar_color_style IN ('light', 'dark'));
