-- Add captain comment columns to approved_testimonials table
-- These store captain comments on conduct, ability, and general comments

ALTER TABLE approved_testimonials 
ADD COLUMN IF NOT EXISTS captain_comment_conduct TEXT NULL,
ADD COLUMN IF NOT EXISTS captain_comment_ability TEXT NULL,
ADD COLUMN IF NOT EXISTS captain_comment_general TEXT NULL;

-- Add comments to the column for documentation
COMMENT ON COLUMN approved_testimonials.captain_comment_conduct IS 'Captain comment on seafarer conduct, captured during approval';
COMMENT ON COLUMN approved_testimonials.captain_comment_ability IS 'Captain comment on seafarer ability, captured during approval';
COMMENT ON COLUMN approved_testimonials.captain_comment_general IS 'Captain general comments, captured during approval';

