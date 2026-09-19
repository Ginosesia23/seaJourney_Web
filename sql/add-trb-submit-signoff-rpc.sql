-- Atomic captain decision for Digital TRB Companion sign-off.
-- Run AFTER sql/create-digital-trb-companion.sql

DROP FUNCTION IF EXISTS public.trb_submit_signoff_decision(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
);
DROP FUNCTION IF EXISTS public.trb_submit_signoff_decision(
  text, text, text, text, text, text, text, text, text, text, text, timestamptz, text, text, text
);

CREATE OR REPLACE FUNCTION public.trb_submit_signoff_decision(
  p_token_hash text,
  p_decision text,
  p_signer_name text,
  p_signer_email text,
  p_signer_rank text,
  p_signer_coc_number text,
  p_signer_issuing_authority text,
  p_signer_verification_status text,
  p_signer_declaration text,
  p_decision_notes text,
  p_record_hash text,
  p_signed_at timestamptz,
  p_actor_email text DEFAULT NULL,
  p_ip_hash text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.trb_signoff_requests%ROWTYPE;
  v_progress public.trb_task_progress%ROWTYPE;
  v_enrollment_id uuid;
  v_signoff_id uuid;
  v_new_status text;
  v_event_type text;
  v_signed_at timestamptz;
BEGIN
  IF p_decision NOT IN ('approved', 'changes_requested', 'rejected') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  v_signed_at := COALESCE(p_signed_at, now());

  SELECT * INTO v_req
  FROM public.trb_signoff_requests
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'token_not_pending';
  END IF;

  IF v_req.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'token_already_used';
  END IF;

  IF v_req.expires_at <= now() THEN
    UPDATE public.trb_signoff_requests
    SET status = 'expired', updated_at = now()
    WHERE id = v_req.id;
    RAISE EXCEPTION 'token_expired';
  END IF;

  SELECT * INTO v_progress
  FROM public.trb_task_progress
  WHERE id = v_req.task_progress_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'progress_not_found';
  END IF;

  v_enrollment_id := v_progress.enrollment_id;

  INSERT INTO public.trb_signoffs (
    signoff_request_id,
    task_progress_id,
    decision,
    signer_name,
    signer_email,
    signer_rank,
    signer_coc_number,
    signer_issuing_authority,
    signer_verification_status,
    signer_declaration,
    decision_notes,
    signed_at,
    record_hash
  ) VALUES (
    v_req.id,
    v_req.task_progress_id,
    p_decision,
    p_signer_name,
    lower(trim(p_signer_email)),
    NULLIF(trim(p_signer_rank), ''),
    NULLIF(trim(p_signer_coc_number), ''),
    NULLIF(trim(p_signer_issuing_authority), ''),
    COALESCE(NULLIF(trim(p_signer_verification_status), ''), 'self_declared'),
    p_signer_declaration,
    NULLIF(trim(p_decision_notes), ''),
    v_signed_at,
    p_record_hash
  )
  RETURNING id INTO v_signoff_id;

  UPDATE public.trb_signoff_requests
  SET
    status = p_decision,
    used_at = now(),
    updated_at = now(),
    signer_name = COALESCE(NULLIF(trim(p_signer_name), ''), signer_name)
  WHERE id = v_req.id;

  IF p_decision = 'approved' THEN
    v_new_status := 'approved';
    v_event_type := 'task_approved';
    UPDATE public.trb_task_progress
    SET status = 'approved', approved_at = now(), updated_at = now()
    WHERE id = v_progress.id;
  ELSIF p_decision = 'changes_requested' THEN
    v_new_status := 'changes_requested';
    v_event_type := 'changes_requested';
    UPDATE public.trb_task_progress
    SET status = 'changes_requested', updated_at = now()
    WHERE id = v_progress.id;
  ELSE
    v_new_status := 'rejected';
    v_event_type := 'task_rejected';
    UPDATE public.trb_task_progress
    SET status = 'rejected', updated_at = now()
    WHERE id = v_progress.id;
  END IF;

  INSERT INTO public.trb_audit_events (
    enrollment_id,
    task_progress_id,
    actor_email,
    event_type,
    event_data,
    ip_hash,
    user_agent
  ) VALUES (
    v_enrollment_id,
    v_progress.id,
    COALESCE(p_actor_email, lower(trim(p_signer_email))),
    v_event_type,
    jsonb_build_object(
      'decision', p_decision,
      'signoff_id', v_signoff_id,
      'signoff_request_id', v_req.id,
      'record_hash', p_record_hash
    ),
    p_ip_hash,
    left(COALESCE(p_user_agent, ''), 500)
  );

  RETURN jsonb_build_object(
    'signoff_id', v_signoff_id,
    'task_progress_id', v_progress.id,
    'enrollment_id', v_enrollment_id,
    'status', v_new_status,
    'decision', p_decision
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trb_submit_signoff_decision(
  text, text, text, text, text, text, text, text, text, text, text, timestamptz, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trb_submit_signoff_decision(
  text, text, text, text, text, text, text, text, text, text, text, timestamptz, text, text, text
) TO service_role;
