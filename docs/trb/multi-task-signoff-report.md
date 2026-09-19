# Multi-task TRB sign-off — implementation report

## 1. Architecture decision

Grouped sign-off uses a **parent + items** model additive to the existing single-task flow:

- `trb_batch_signoff_requests` — one public hashed token, optional crew message, overall feedback, vessel/signer snapshots, request-level status (`pending` → `completed` | `cancelled` | `expired`).
- `trb_batch_signoff_items` — one row per selected `trb_task_progress`, with per-task decision/status/feedback.
- For each item, a **shadow** `trb_signoff_requests` row (`is_batch_shadow = true`, never emailed) preserves the existing `trb_signoffs.signoff_request_id` FK and single-task audit path.
- Decisions are applied atomically by `trb_submit_batch_signoff_decision` (Postgres RPC), reusing the same immutable `trb_signoffs` snapshot pattern as `trb_submit_signoff_decision`.
- Public review URL resolves **batch token first**, then single-task token, so one email link covers the whole group.
- No second vessel roster, no generic approval engine, no Flutter repo changes.

No blocking architectural conflict was found; Strategy B (shadow singles + parent token) keeps backward compatibility.

## 2. Database contract for Flutter

Flutter should use **Bearer APIs only** (not direct table access), except where existing Supabase client patterns already apply under RLS. Service role writes are API-only.

### `trb_batch_signoff_requests`

| | |
|--|--|
| PK | `id uuid` |
| FKs | `enrollment_id → trb_enrollments`, `requested_by → users`, `signer_user_id → users`, `vessel_id → vessels` |
| Key columns | `signer_email text`, `signer_name text`, `required_signer_role text`, `token_hash text UNIQUE`, `status`, `expires_at`, `used_at`, `viewed_at`, `optional_message`, `overall_feedback`, `vessel_name_snapshot`, `eligibility_snapshot jsonb`, `idempotency_key`, timestamps |
| Status | `pending`, `completed`, `expired`, `cancelled` |
| Unique | `(enrollment_id, idempotency_key)` where key not null; `token_hash` |
| RLS | SELECT for requester, enrolment owner, or matching signer email; no client INSERT/UPDATE/DELETE |
| Flutter | API only |

### `trb_batch_signoff_items`

| | |
|--|--|
| PK | `id uuid` |
| FKs | `batch_request_id → trb_batch_signoff_requests`, `task_progress_id → trb_task_progress`, `signoff_request_id → trb_signoff_requests` |
| Key columns | `status`, `decision_notes`, `sort_order`, `decided_at` |
| Status | `pending`, `approved`, `changes_requested`, `rejected`, `cancelled` |
| Unique | `(batch_request_id, task_progress_id)`; partial unique on `task_progress_id` where `status = 'pending'` (one active request) |
| RLS | SELECT via parent ownership/signer; writes service-role only |
| Flutter | API only |

### Existing tables reused (unchanged contracts)

- Programmes: `trb_programs`, `trb_program_versions`, `trb_sections`, `trb_tasks`
- Progress: `trb_enrollments`, `trb_task_progress`, `trb_task_notes` (via progress notes), `trb_task_evidence`
- Single sign-off: `trb_signoff_requests` (+ `batch_request_id`, `batch_item_id`, `is_batch_shadow`), `trb_signoffs`
- Vessel/auth: `vessels`, `vessel_assignments`, `vessel_signing_authorities`, `officer_credentials`
- Testimonials: unchanged (`testimonial_*` / existing sign-off)
- Notifications / rate limit / audit: existing notification helpers, `trb_rate_limits`, `trb_audit_events` (+ optional `batch_request_id`)

Task progress statuses remain: `not_started`, `in_progress`, `ready_for_assessment`, `awaiting_signoff`, `changes_requested`, `approved`, `rejected`, … Official-book statuses stay separate (`not_recorded`, `awaiting_signature`, `signed`, `discrepancy_reported`).

## 3. API contract for Flutter

See updated [`docs/trb/mobile-api-reference.md`](mobile-api-reference.md). Summary of new/extended endpoints:

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/trb/signoff/batch?enrollmentId=` | Bearer — eligible tasks |
| GET | `/api/trb/signoff/batch?enrollmentId=&taskProgressId=` | Bearer — eligible signers |
| POST | `/api/trb/signoff/batch` | Bearer — create grouped request (idempotency key) |
| DELETE | `/api/trb/signoff/batch` | Bearer — cancel `{ batchRequestId }` |
| GET | `/api/trb/signoff/batch/:batchRequestId` | Bearer — detail |
| GET | `/api/trb/enrollments/:enrollmentId/batch-requests` | Bearer — list |
| GET | `/api/trb/signoff/queue` | Bearer — merged single + batch |
| GET/POST | `/api/trb/signoff/:token` | Token — resolve/decide; batch if `decisions[]` |
| GET | `/api/trb/evidence/download?evidenceId=&token=` | Token — single or batch |

## 4. Flutter state mapping

Documented in the mobile API reference “Flutter state mapping” section. Digitally approved ≠ MCA/PYA/official book.

## 5. Files and migrations

### Migration order (additive)

1. Prior TRB migrations already deployed (`create-digital-trb-companion`, expand, extend MCA pilot, `add-trb-submit-signoff-rpc`, seeds, feature flag, …)
2. **`sql/add-trb-batch-signoff.sql`** — tables, columns, RLS
3. **`sql/add-trb-batch-signoff-rpc.sql`** — `trb_submit_batch_signoff_decision`

### Created / modified (this phase)

- `sql/add-trb-batch-signoff.sql`
- `sql/add-trb-batch-signoff-rpc.sql`
- `src/lib/trb/batch.ts`
- `src/lib/trb/schemas.ts` (batch schemas)
- `src/lib/trb/email.ts` (batch email)
- `src/lib/trb/service.ts` (batch evidence download)
- `src/lib/trb/trb.selftest.ts`
- `src/app/api/trb/signoff/batch/route.ts`
- `src/app/api/trb/signoff/batch/[batchRequestId]/route.ts`
- `src/app/api/trb/enrollments/[enrollmentId]/batch-requests/route.ts`
- `src/app/api/trb/signoff/[token]/route.ts`
- `src/app/api/trb/signoff/queue/route.ts`
- `src/app/dashboard/training-records/[enrollmentId]/page.tsx`
- `src/app/dashboard/training-records/[enrollmentId]/requests/[batchRequestId]/page.tsx`
- `src/app/dashboard/training-signoffs/page.tsx`
- `src/app/training-records/signoff/[token]/page.tsx`
- `src/components/dashboard/training-records-page-ui.tsx` (`completed` pill)
- `docs/trb/mobile-api-reference.md`
- `docs/trb/multi-task-signoff-report.md` (this file)

## 6. Reused components

- TRB eligibility (`eligibility.ts`, vessel assignments + signing authorities)
- Shared hashed tokens (`signoff-tokens` / `trb/tokens`)
- `trb_submit_*` RPC pattern and `trb_signoffs` snapshots
- Resend email helpers; `notifyTrbEvent`
- Rate limits (`trb_rate_limits`)
- Dashboard UI primitives (`training-records-page-ui`, Bearer client headers)
- Public sign-off page shell (same as single-task / similar to testimonial public review)
- Evidence signed URLs

## 7. Manual end-to-end test (staging)

1. Apply migrations `add-trb-batch-signoff.sql` then `add-trb-batch-signoff-rpc.sql`.
2. As crew (feature flag / test tier): open a programme → mark ≥2 tasks ready with notes → select them → **Request sign-off** → choose eligible officer → submit.
3. Confirm one email with task list + secure link; queue shows grouped row.
4. As officer: open token URL → set per-task decisions (mixed) → optional overall feedback → confirm submit.
5. As crew: open `/dashboard/training-records/{enrollmentId}/requests/{batchId}` → see mixed item statuses; tasks reflect approved / changes_requested / rejected.
6. Regression: single-task request still works; testimonials unchanged; cancel pending batch restores `ready_for_assessment`.

## 8. Remaining limitations

- **Flutter UI** not implemented (API + docs ready).
- **FCM**: metadata/`deepLink` fields present; push payload wiring still needed on mobile.
- **PYA/MCA recognition**: none — digital companion only; official paper TRB remains authoritative.
- **Signer-role matrix**: configurable via `required_signer_role` + eligibility; pilot labelling retained.
- **Offline mobile**: client must queue with idempotency keys; no offline approvals.
- **Authenticated dashboard decide** for officers still uses the email token for submission (queue is list/detail oriented); extend later if needed.
- Integration tests against live Supabase were not run in CI here; unit/selftest + typecheck/build cover schemas and compile.
