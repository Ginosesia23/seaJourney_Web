-- Postgres Functions for Token-Based Testimonial Access
-- These functions use SECURITY DEFINER to bypass RLS and allow public (unauthenticated) access
-- Run this in your Supabase SQL Editor

-- Function to validate and fetch testimonial by token
CREATE OR REPLACE FUNCTION get_testimonial_by_token(
  p_token UUID,
  p_email TEXT
)
RETURNS JSON AS $$
DECLARE
  v_testimonial RECORD;
  v_vessel RECORD;
BEGIN
  -- Find testimonial with matching token (bypasses RLS due to SECURITY DEFINER)
  SELECT t.* INTO v_testimonial
  FROM testimonials t
  WHERE t.signoff_token = p_token;
  
  -- Check if testimonial exists
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid or expired token');
  END IF;
  
  -- Check if email matches
  IF LOWER(v_testimonial.signoff_target_email) != LOWER(p_email) THEN
    RETURN json_build_object('error', 'Email does not match token');
  END IF;
  
  -- Check if token has expired
  IF v_testimonial.signoff_token_expires_at IS NOT NULL AND 
     v_testimonial.signoff_token_expires_at < NOW() THEN
    RETURN json_build_object('error', 'Token has expired');
  END IF;
  
  -- Check if token has already been used
  IF v_testimonial.signoff_used_at IS NOT NULL THEN
    RETURN json_build_object('error', 'This token has already been used');
  END IF;
  
  -- Check if testimonial is already approved/rejected
  IF v_testimonial.status IN ('approved', 'rejected') THEN
    RETURN json_build_object('error', format('This testimonial has already been %s', v_testimonial.status));
  END IF;
  
  -- Get vessel data
  SELECT * INTO v_vessel FROM vessels WHERE id = v_testimonial.vessel_id;
  
  -- Return testimonial data
  RETURN json_build_object(
    'testimonial', json_build_object(
      'id', v_testimonial.id,
      'start_date', v_testimonial.start_date,
      'end_date', v_testimonial.end_date,
      'total_days', v_testimonial.total_days,
      'at_sea_days', v_testimonial.at_sea_days,
      'standby_days', v_testimonial.standby_days,
      'yard_days', v_testimonial.yard_days,
      'leave_days', v_testimonial.leave_days,
      'status', v_testimonial.status,
      'vessel', CASE 
        WHEN v_vessel IS NULL THEN NULL
        ELSE json_build_object(
          'id', v_vessel.id,
          'name', v_vessel.name,
          'type', v_vessel.type
        )
      END
    ),
    'captain_email', v_testimonial.signoff_target_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process signoff (approve or reject)
CREATE OR REPLACE FUNCTION process_testimonial_signoff(
  p_token UUID,
  p_email TEXT,
  p_action TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_testimonial RECORD;
  v_update_count INTEGER;
BEGIN
  -- Find testimonial with matching token
  SELECT * INTO v_testimonial
  FROM testimonials
  WHERE signoff_token = p_token;
  
  -- Check if testimonial exists
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid or expired token');
  END IF;
  
  -- Check if email matches
  IF LOWER(v_testimonial.signoff_target_email) != LOWER(p_email) THEN
    RETURN json_build_object('error', 'Email does not match token');
  END IF;
  
  -- Check if token has expired
  IF v_testimonial.signoff_token_expires_at IS NOT NULL AND 
     v_testimonial.signoff_token_expires_at < NOW() THEN
    RETURN json_build_object('error', 'Token has expired');
  END IF;
  
  -- Check if token has already been used
  IF v_testimonial.signoff_used_at IS NOT NULL THEN
    RETURN json_build_object('error', 'This token has already been used');
  END IF;
  
  -- Check if testimonial is already approved/rejected
  IF v_testimonial.status IN ('approved', 'rejected') THEN
    RETURN json_build_object('error', format('This testimonial has already been %s', v_testimonial.status));
  END IF;
  
  -- Validate action
  IF p_action NOT IN ('approve', 'reject') THEN
    RETURN json_build_object('error', 'Action must be either "approve" or "reject"');
  END IF;
  
  -- Validate rejection reason if rejecting
  IF p_action = 'reject' AND (p_rejection_reason IS NULL OR trim(p_rejection_reason) = '') THEN
    RETURN json_build_object('error', 'Rejection reason is required when rejecting');
  END IF;
  
  -- Update testimonial
  UPDATE testimonials
  SET 
    signoff_used_at = NOW(),
    updated_at = NOW(),
    status = CASE 
      WHEN p_action = 'approve' THEN 'approved'::text
      ELSE 'rejected'::text
    END,
    notes = CASE 
      WHEN p_action = 'reject' AND p_rejection_reason IS NOT NULL THEN
        CASE 
          WHEN notes IS NULL OR trim(notes) = '' THEN format('Rejection reason: %s', p_rejection_reason)
          ELSE format('%s\n\nRejection reason: %s', notes, p_rejection_reason)
        END
      ELSE notes
    END
  WHERE id = v_testimonial.id
    AND signoff_token = p_token
    AND signoff_used_at IS NULL
    AND status NOT IN ('approved', 'rejected');
  
  GET DIAGNOSTICS v_update_count = ROW_COUNT;
  
  IF v_update_count = 0 THEN
    RETURN json_build_object('error', 'Failed to update testimonial');
  END IF;
  
  -- Return success
  RETURN json_build_object(
    'success', true,
    'testimonial', json_build_object(
      'id', v_testimonial.id,
      'status', CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_testimonial_by_token(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION process_testimonial_signoff(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
