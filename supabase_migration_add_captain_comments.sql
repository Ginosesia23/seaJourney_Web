-- Add captain comment columns to testimonials table
-- These store captain comments on conduct, ability, and general comments during sign-off

ALTER TABLE testimonials 
ADD COLUMN IF NOT EXISTS captain_comment_conduct TEXT NULL,
ADD COLUMN IF NOT EXISTS captain_comment_ability TEXT NULL,
ADD COLUMN IF NOT EXISTS captain_comment_general TEXT NULL;

-- Add comments to the column for documentation
COMMENT ON COLUMN testimonials.captain_comment_conduct IS 'Captain comment on seafarer conduct, captured during sign-off process';
COMMENT ON COLUMN testimonials.captain_comment_ability IS 'Captain comment on seafarer ability, captured during sign-off process';
COMMENT ON COLUMN testimonials.captain_comment_general IS 'Captain general comments, captured during sign-off process';

