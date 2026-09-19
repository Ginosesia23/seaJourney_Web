# Training Record mobile API reference (Flutter-ready)

Base path: `/api/trb/*`  
Auth: `Authorization: Bearer <supabase_jwt>` for authenticated routes (`src/lib/trb/auth.ts` → `requireBearerUser`).  
Token review routes use the raw email link token in the path (no Bearer).

**Batch multi-task handoff (definitive Flutter package):** [`batch-signoff-mobile-handoff.md`](./batch-signoff-mobile-handoff.md)

**JSON convention:** Mobile-facing TRB Bearer APIs return **camelCase** property names (including nested task/section/evidence/request/signoff objects). Nested Supabase `enrollment.trb_program_versions` relation may still appear in raw form on some payloads — prefer top-level camelCase fields (`tasks`, `sections`, `batch`, `items`, `requests`, `signoffs`).

All successful JSON bodies may include `serverTime` (ISO-8601).  
Errors typically: `{ "error": "<message or flatten>", "code": "<stable_code>" }` with HTTP 400/401/403/404/410/429/500.

### Stable error codes (batch / sign-off)

| Code | Meaning |
|------|---------|
| `validation_error` | Zod body validation failed |
| `empty_selection` | No tasks selected |
| `task_not_eligible` | Not ready / missing notes / already pending |
| `signer_ineligible` | Reviewer failed vessel/role eligibility |
| `self_signoff_forbidden` | Candidate cannot select themselves |
| `not_pending` | Cancel only allowed while pending |
| `invalid_token` | Token hash not found |
| `token_expired` | Past `expires_at` |
| `token_not_pending` | Already used / cancelled / completed |
| `decision_count_mismatch` | Must decide every pending batch item |
| `decision_notes_required` | Notes required for changes/reject |
| `item_not_found` | Unknown batch item id |

Idempotency is a **JSON body** field `idempotencyKey` (8–120 chars), not an HTTP header.

---

## Enrolments

### `GET /api/trb/enrollments`

List current user’s enrolments + discoverable programmes.  
Source: `src/app/api/trb/enrollments/route.ts`

### `POST /api/trb/enrollments`

```json
{
  "programCode": "SJ-DEMO-TRB-OOW",
  "consent": {
    "understandsTrial": true,
    "doesNotReplaceOfficialTrb": true,
    "willMaintainOfficialTrb": true,
    "feedbackMayBeAnalysed": true,
    "noMcaPyaApprovalImplied": true
  }
}
```

### `GET /api/trb/enrollments/:enrollmentId`

Enrolment detail with sections, tasks (`progressId`, `status`, `batchRequestId`, `isBatchShadow`, …), aggregates, recent audit.  
`batchRequestId` is set when the task has a **pending** batch item; `isBatchShadow` is `true` in that case.  
Source: `src/app/api/trb/enrollments/[enrollmentId]/route.ts` → `getEnrollmentDetail`

Task `status` values: `not_started` | `in_progress` | `ready_for_assessment` | `awaiting_signoff` | `changes_requested` | `approved` | `rejected` | `superseded`

### `GET /api/trb/enrollments/:enrollmentId/tasks/:taskProgressId`

Task detail: progress (incl. `candidateNotes`), evidence metadata, `requests` (each with `batchRequestId`, `batchItemId`, `isBatchShadow`), `signoffs`, `pendingRequest`, top-level `batchRequestId` / `isBatchShadow`, parallel-book (pilot).  
Cancel batch shadows via `DELETE /api/trb/signoff/batch`, not single-task cancel.  
Source: `…/tasks/[taskProgressId]/route.ts` → `getTaskDetail`

### `GET /api/trb/enrollments/:enrollmentId/report`

Audit / application-pack JSON export.

### `GET /api/trb/enrollments/:enrollmentId/batch-requests`

List grouped requests for enrolment owner.  
Source: `src/app/api/trb/enrollments/[enrollmentId]/batch-requests/route.ts`

```json
{
  "requests": [
    {
      "id": "88888888-8888-8888-8888-888888888888",
      "status": "pending",
      "signerEmail": "captain@example.com",
      "signerName": "Alex Captain",
      "createdAt": "2026-09-19T12:00:00.000Z",
      "expiresAt": "2026-09-26T12:00:00.000Z",
      "usedAt": null,
      "optionalMessage": null,
      "taskCount": 4,
      "counts": {
        "approved": 0,
        "changesRequested": 0,
        "rejected": 0,
        "pending": 4,
        "cancelled": 0
      }
    }
  ],
  "serverTime": "2026-09-19T12:00:00.000Z"
}
```

Parent `status`: `pending` | `completed` | `expired` | `cancelled`.  
Sort: `createdAt` DESC. Limit: 50. **camelCase** throughout.

---

## Notes & readiness

Notes are stored on `trb_task_progress.candidate_notes` (no separate notes table).

### `PATCH /api/trb/notes`

```json
{
  "taskProgressId": "00000000-0000-0000-0000-000000000001",
  "candidateNotes": "Completed under supervision…",
  "markInProgress": true
}
```

### `POST /api/trb/tasks/ready`

```json
{
  "taskProgressId": "00000000-0000-0000-0000-000000000001",
  "idempotencyKey": "client-uuid-or-stable-key"
}
```

Response includes `status: "ready_for_assessment"` and may include `idempotent`.

---

## Evidence

### `POST /api/trb/evidence` (multipart)

Fields: `taskProgressId`, `file`, optional `description`.  
MIME allowlist: `application/pdf`, `image/jpeg`, `image/png`. Max 8 MB.

### `DELETE /api/trb/evidence`

```json
{ "evidenceId": "00000000-0000-0000-0000-000000000002" }
```

### `GET /api/trb/evidence/download?evidenceId=…`

Bearer: `{ "signedUrl", "filename", "mimeType" }` (~120s TTL).  
Captain: `&token=<rawSignoffToken>` (single **or** batch parent token).

---

## Single-task sign-off

### `GET /api/trb/eligible-signers?taskProgressId=…`

### `POST /api/trb/signoff/request` / `DELETE /api/trb/signoff/request`

Unchanged; do not use to cancel batch shadow rows.

---

## Multi-task (grouped) sign-off

Service: `src/lib/trb/batch.ts`. Routes: `src/app/api/trb/signoff/batch/**`.

### `GET /api/trb/signoff/batch?enrollmentId=…`

Eligible selectable tasks only.

```json
{
  "enrollmentId": "…",
  "tasks": [
    {
      "taskProgressId": "…",
      "taskId": "…",
      "status": "ready_for_assessment",
      "taskCode": "MCA-P3-WATCH-01",
      "title": "…",
      "sectionId": "…",
      "sectionTitle": "Watchkeeping",
      "requiredSignerRole": "captain",
      "selectable": true
    }
  ],
  "serverTime": "…"
}
```

### `GET /api/trb/signoff/batch?enrollmentId=…&taskProgressId=…` (repeatable)

Eligible signers for selection (most restrictive role wins).

```json
{
  "vesselId": "…",
  "vesselName": "Example Yacht",
  "requiredSignerRole": "captain",
  "taskCount": 4,
  "signers": [
    {
      "userId": "…",
      "email": "captain@example.com",
      "fullName": "Alex Captain",
      "rank": "Master",
      "assignmentRole": "captain",
      "assignmentId": null,
      "vesselId": "…",
      "vesselName": "Example Yacht",
      "source": "signing_authority",
      "credentialVerificationStatus": null,
      "selfDeclared": false
    }
  ],
  "serverTime": "…"
}
```

### `POST /api/trb/signoff/batch`

```json
{
  "enrollmentId": "00000000-0000-0000-0000-000000000010",
  "taskProgressIds": [
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000002"
  ],
  "signerName": "Alex Captain",
  "signerEmail": "captain@example.com",
  "authorisedConfirmation": true,
  "optionalMessage": "Please review these watchkeeping tasks.",
  "allowExternalInvite": false,
  "idempotencyKey": "client-stable-key"
}
```

Response:

```json
{
  "batchRequestId": "…",
  "expiresAt": "…",
  "taskCount": 2,
  "emailSent": true,
  "emailSkipped": false,
  "idempotent": false,
  "eligibility": {
    "source": "signing_authority",
    "selfDeclared": false,
    "vesselId": "…",
    "vesselName": "…"
  },
  "serverTime": "…"
}
```

Production never returns `reviewUrl`.

### `GET /api/trb/signoff/batch/:batchRequestId`

Detail payload: `kind: "batch"`, camelCase `batch` + `items[]` (including nested `task` / `section` / `evidence`). Item statuses: `pending` | `approved` | `changes_requested` | `rejected` | `cancelled`.

### `DELETE /api/trb/signoff/batch`

```json
{ "batchRequestId": "…" }
```

→ `{ "ok": true, "serverTime": "…" }`

---

## Reviewer queue & token (website / officer)

### `GET /api/trb/signoff/queue`

Merged single + batch for signer email. Optional `?status=`.  
`resourceType`: `training_task` | `training_task_batch`.

### `GET|POST /api/trb/signoff/:token`

Batch resolved first; POST with `decisions[]` uses `batchCaptainDecisionSchema`.  
**Flutter crew app should not call these.** Rate-limited via `trb_rate_limits`.

Note: `idempotencyKey` is accepted on batch decide schema but **not applied** in `submitBatchCaptainDecision`; single-use token + RPC locking provide safety.

---

## Flutter state mapping

| Question | Source of truth |
|----------|-----------------|
| Can select task? | Present in eligible-tasks with `selectable: true` |
| Request pending? | Batch parent `status === "pending"` or progress `awaiting_signoff` |
| Changes requested? | Item or progress `changes_requested` |
| Digitally approved? | Item/progress `approved` (never claim MCA/PYA) |
| In active batch? | Pending batch detail items (not enrolment field today) |
| Eligible signers? | Eligible-signers GET for selected IDs |
| Mixed results? | Batch detail `items[].status` + `counts` |

---

## Notifications (inbox)

Table: `app_user_notifications` (Flutter may read via Supabase RLS).  
TRB inserts use `kind: "testimonial"` with `metadata.domain: "trb"`.

Batch decision completion chooses `metadata.event` via `batchDecisionNotificationEvent`:

| Outcome | `event` |
|---------|---------|
| All approved | `task_approved` |
| All changes requested | `changes_requested` |
| All rejected | `task_rejected` |
| Mixed | `batch_signoff_mixed` |

Metadata always includes `batchRequestId`, `enrollmentId`, counts, and web `deepLink`.

---

## Pilot extras / admin

- `POST /api/trb/parallel-book`, `POST /api/trb/feedback`
- Admin: `/api/trb/admin/programs` (role `admin` only) — not for crew Flutter

## Offline guidance

1. Cache enrolment/task/batch GETs with `serverTime`.  
2. Queue mutations with body `idempotencyKey`.  
3. Never cache raw tokens or long-lived evidence URLs.  
4. Never invent local approvals.
