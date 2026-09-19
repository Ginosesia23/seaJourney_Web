-- Atomic multi-task captain decision for Digital TRB Companion batch sign-off.
-- Run AFTER sql/add-trb-batch-signoff.sql and sql/add-trb-submit-signoff-rpc.sql

CREATE OR REPLACE FUNCTION public.trb_submit_batch_signoff_decision(
  p_token_hash text,
  p_decisions jsonb, -- [{ "item_id": uuid, "decision": text, "decision_notes": text|null, "record_hash": text }]
  p_signer_name text,
  p_signer_rank text,
  p_signer_coc_number text,
  p_signer_issuing_authority text,
  p_signer_verification_status text,
  p_signer_declaration text,
  p_overall_feedback text DEFAULT NULL,
  p_signed_at timestamptz DEFAULT NULL,
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
  v_batch public.trb_batch_signoff_requests%ROWTYPE;
  v_item public.trb_batch_signoff_items%ROWTYPE;
  v_req public.trb_signoff_requests%ROWTYPE;
  v_progress public.trb_task_progress%ROWTYPE;
  v_dec jsonb;
  v_decision text;
  v_notes text;
  v_item_id uuid;
  v_signoff_id uuid;
  v_record_hash text;
  v_signed_at timestamptz;
  v_new_status text;
  v_event_type text;
  v_results jsonb := '[]'::jsonb;
  v_approved int := 0;
  v_changes int := 0;
  v_rejected int := 0;
  v_pending_left int;
BEGIN
  v_signed_at := COALESCE(p_signed_at, now());

  IF p_decisions IS NULL OR jsonb_typeof(p_decisions) <> 'array' OR jsonb_array_length(p_decisions) = 0 THEN
    RAISE EXCEPTION 'invalid_decisions';
  END IF;

  SELECT * INTO v_batch
  FROM public.trb_batch_signoff_requests
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  IF v_batch.status <> 'pending' THEN
    RAISE EXCEPTION 'token_not_pending';
  END IF;

  IF v_batch.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'token_already_used';
  END IF;

  IF v_batch.expires_at <= now() THEN
    UPDATE public.trb_batch_signoff_requests
    SET status = 'expired', updated_at = now()
    WHERE id = v_batch.id;
    RAISE EXCEPTION 'token_expired';
  END IF;

  -- Every pending item must receive a decision in this submission
  SELECT count(*) INTO v_pending_left
  FROM public.trb_batch_signoff_items
  WHERE batch_request_id = v_batch.id AND status = 'pending';

  IF v_pending_left <> jsonb_array_length(p_decisions) THEN
    RAISE EXCEPTION 'decision_count_mismatch';
  END IF;

  FOR v_dec IN SELECT * FROM jsonb_array_elements(p_decisions)
  LOOP
    v_item_id := (v_dec->>'item_id')::uuid;
    v_decision := v_dec->>'decision';
    v_notes := NULLIF(trim(COALESCE(v_dec->>'decision_notes', '')), '');
    v_record_hash := NULLIF(trim(COALESCE(v_dec->>'record_hash', '')), '');

    IF v_decision NOT IN ('approved', 'changes_requested', 'rejected') THEN
      RAISE EXCEPTION 'invalid_decision';
    END IF;

    IF v_record_hash IS NULL OR length(v_record_hash) < 32 THEN
      RAISE EXCEPTION 'record_hash_required';
    END IF;

    IF (v_decision = 'changes_requested' OR v_decision = 'rejected') AND v_notes IS NULL THEN
      RAISE EXCEPTION 'decision_notes_required';
    END IF;

    SELECT * INTO v_item
    FROM public.trb_batch_signoff_items
    WHERE id = v_item_id
      AND batch_request_id = v_batch.id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'item_not_found';
    END IF;

    IF v_item.status <> 'pending' THEN
      RAISE EXCEPTION 'item_not_pending';
    END IF;

    SELECT * INTO v_req
    FROM public.trb_signoff_requests
    WHERE id = v_item.signoff_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'shadow_request_missing';
    END IF;

    SELECT * INTO v_progress
    FROM public.trb_task_progress
    WHERE id = v_item.task_progress_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'progress_not_found';
    END IF;

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
      v_item.task_progress_id,
      v_decision,
      p_signer_name,
      lower(trim(v_batch.signer_email)),
      NULLIF(trim(p_signer_rank), ''),
      NULLIF(trim(p_signer_coc_number), ''),
      NULLIF(trim(p_signer_issuing_authority), ''),
      COALESCE(NULLIF(trim(p_signer_verification_status), ''), 'self_declared'),
      p_signer_declaration,
      v_notes,
      v_signed_at,
      v_record_hash
    )
    RETURNING id INTO v_signoff_id;

    UPDATE public.trb_signoff_requests
    SET
      status = v_decision,
      used_at = now(),
      updated_at = now(),
      signer_name = COALESCE(NULLIF(trim(p_signer_name), ''), signer_name)
    WHERE id = v_req.id;

    IF v_decision = 'approved' THEN
      v_new_status := 'approved';
      v_event_type := 'task_approved';
      v_approved := v_approved + 1;
      UPDATE public.trb_task_progress
      SET status = 'approved', approved_at = now(), updated_at = now()
      WHERE id = v_progress.id;
    ELSIF v_decision = 'changes_requested' THEN
      v_new_status := 'changes_requested';
      v_event_type := 'changes_requested';
      v_changes := v_changes + 1;
      UPDATE public.trb_task_progress
      SET status = 'changes_requested', updated_at = now()
      WHERE id = v_progress.id;
    ELSE
      v_new_status := 'rejected';
      v_event_type := 'task_rejected';
      v_rejected := v_rejected + 1;
      UPDATE public.trb_task_progress
      SET status = 'rejected', updated_at = now()
      WHERE id = v_progress.id;
    END IF;

    UPDATE public.trb_batch_signoff_items
    SET
      status = v_decision,
      decision_notes = v_notes,
      decided_at = v_signed_at,
      updated_at = now()
    WHERE id = v_item.id;

    INSERT INTO public.trb_audit_events (
      enrollment_id,
      task_progress_id,
      batch_request_id,
      actor_email,
      event_type,
      event_data,
      ip_hash,
      user_agent
    ) VALUES (
      v_batch.enrollment_id,
      v_progress.id,
      v_batch.id,
      COALESCE(p_actor_email, lower(trim(v_batch.signer_email))),
      v_event_type,
      jsonb_build_object(
        'decision', v_decision,
        'signoff_id', v_signoff_id,
        'signoff_request_id', v_req.id,
        'batch_item_id', v_item.id,
        'batch_request_id', v_batch.id,
        'record_hash', v_record_hash
      ),
      p_ip_hash,
      left(COALESCE(p_user_agent, ''), 500)
    );

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'item_id', v_item.id,
        'task_progress_id', v_item.task_progress_id,
        'signoff_id', v_signoff_id,
        'status', v_new_status,
        'decision', v_decision,
        'record_hash', v_record_hash
      )
    );
  END LOOP;

  UPDATE public.trb_batch_signoff_requests
  SET
    status = 'completed',
    used_at = now(),
    overall_feedback = NULLIF(trim(COALESCE(p_overall_feedback, '')), ''),
    updated_at = now(),
    signer_name = COALESCE(NULLIF(trim(p_signer_name), ''), signer_name)
  WHERE id = v_batch.id;

  INSERT INTO public.trb_audit_events (
    enrollment_id,
    batch_request_id,
    actor_email,
    event_type,
    event_data,
    ip_hash,
    user_agent
  ) VALUES (
    v_batch.enrollment_id,
    v_batch.id,
    COALESCE(p_actor_email, lower(trim(v_batch.signer_email))),
    'batch_signoff_completed',
    jsonb_build_object(
      'batch_request_id', v_batch.id,
      'approved', v_approved,
      'changes_requested', v_changes,
      'rejected', v_rejected
    ),
    p_ip_hash,
    left(COALESCE(p_user_agent, ''), 500)
  );

  RETURN jsonb_build_object(
    'batch_request_id', v_batch.id,
    'enrollment_id', v_batch.enrollment_id,
    'status', 'completed',
    'approved', v_approved,
    'changes_requested', v_changes,
    'rejected', v_rejected,
    'items', v_results,
    'signed_at', v_signed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trb_submit_batch_signoff_decision(
  text, jsonb, text, text, text, text, text, text, text, timestamptz, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trb_submit_batch_signoff_decision(
  text, jsonb, text, text, text, text, text, text, text, timestamptz, text, text, text
) TO service_role;
