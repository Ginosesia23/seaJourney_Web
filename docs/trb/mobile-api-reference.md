# Training Record mobile API reference (Flutter-ready)

Base path: `/api/trb/*`  
Auth: `Authorization: Bearer <supabase_jwt>` for authenticated routes (`src/lib/trb/auth.ts` → `requireBearerUser`).  
Token review routes use the raw email link token in the path (no Bearer).

**Batch multi-task handoff (definitive Flutter package):** [`batch-signoff-mobile-handoff.md`](./batch-signoff-mobile-handoff.md)

**JSON convention:** Mobile-facing TRB Bearer APIs return **camelCase** property names (including nested task/section/evidence/request/signoff objects). Nested Supabase `enrollment.trb_program_versions` relation may still appear in raw form on some payloads — prefer top-level camelCase fields (`tasks`, `sections`, `batch`, `items`, `requests`, `signoffs`, `programmeSource`, `companionNotice`).

All successful JSON bodies may include `serverTime` (ISO-8601).  
Errors typically: `{ "error": "<message or flatten>", "code": "<stable_code>" }` with HTTP 400/401/403/404/410/429/500.

### Programme contract (OOW companion)

Primary programme for Flutter Training:

| Field | Value / notes |
|-------|----------------|
| Display name | `OOW (Yachts <3,000 GT) Training Record` (from API `name`) |
| `code` | `SJ-PILOT-MCA-OOW-YACHTS` (stable — do not hardcode display title from this) |
| Version string | `mca-source-2014-pilot-1` (stable id; `status` is `active` after promote) |
| `isOfficial` | `false` |
| `recognitionStatus` | `not_approved` |
| `isOowYachts3000` / `isMcaPilot` | `true` |
| `companionNotice` | Short digital-companion notice |
| Provenance | `sourceAuthority`, `sourceTitle`, `sourceUrl`, `sourcePublishedAt`, `sourceRevisionLabel`, `sourcePdfFilename`, `sourceDocumentSha256`, `sourceLicense`, `sourceLicenseUrl` |
| Version extras | `disclaimer`, `attributionHtml`, `sourceVersionReference`, `contentProvenance` |

Clients **must** render name, version, and source fields returned by the API — do not hardcode an assumed official document revision.  
Full verification: [`oow-yachts-3000gt-source-verification.md`](./oow-yachts-3000gt-source-verification.md).

### Stable error codes (batch / sign-off)

| Code | Meaning |
|------|---------|
| `validation_error` | Zod body validation failed |
| `empty_selection` | No tasks selected |
| `task_not_eligible` | Not ready / missing notes / already pending |
| `signer_ineligible` | Legacy alias — prefer `SIGNER_*` codes below |
| `SIGNER_NOT_FOUND` | Selected user id does not exist |
| `SIGNER_NOT_ATTACHED_TO_VESSEL` | User has no active vessel relationship |
| `SIGNER_INVITATION_PENDING` | Linked account not yet accepted |
| `SIGNER_INACTIVE` | Authority revoked / account inactive |
| `SIGNER_NOT_AUTHORIZED_FOR_TRAINING` | Missing `can_sign_training_records` grant |
| `SIGNER_AUTHORITY_EXPIRED` | Grant `valid_until` has passed |
| `SIGNER_NOT_ELIGIBLE_FOR_ALL_TASKS` | Batch: role rules fail for at least one task |
| `CANNOT_SIGN_OWN_TASK` | Candidate selected themselves |
| `SIGNER_ELIGIBILITY_CHANGED` | Roster changed since client loaded signers; refresh |
| `self_signoff_forbidden` | Legacy alias of `CANNOT_SIGN_OWN_TASK` |
| `not_pending` | Cancel only allowed while pending |
| `invalid_token` | Token hash not found |
| `token_expired` | Past `expires_at` |
| `token_not_pending` | Already used / cancelled / completed |
| `decision_count_mismatch` | Must decide every pending batch item |
| `decision_notes_required` | Notes required for changes/reject |
| `item_not_found` | Unknown batch item id |

Idempotency is a **JSON body** field `idempotencyKey` (8–120 chars), not an HTTP header.

### Stable signer identity

Prefer **`signerUserId`** (SeaJourney `users.id`) when creating single or batch requests.

Compatibility:

* Clients may still send `signerEmail` + `signerName` without `signerUserId` during rollout.
* When both are sent, the server resolves the user from `signerUserId` (or email lookup), **verifies** email if provided, and stores **server** name/email/role.
* Do not trust client-supplied names or roles for eligibility.

See [`vessel-signoff-authority.md`](./vessel-signoff-authority.md).

---

## Enrolments

### `GET /api/trb/enrollments`

List current user’s enrolments + discoverable programmes.  
Source: `src/app/api/trb/enrollments/route.ts`

### `POST /api/trb/enrollments`

```json
{
  "programCode": "SJ-PILOT-MCA-OOW-YACHTS",
  "consent": {
    "understandsTrial": true,
    "doesNotReplaceOfficialTrb": true,
    "willMaintainOfficialTrb": true,
    "feedbackMayBeAnalysed": true,
    "noMcaPyaApprovalImplied": true
  }
}
```

OOW companion enrolment requires all five consent flags. Programme discovery for `SJ-PILOT-MCA-OOW-YACHTS` defaults to **on** for authenticated users (optional `TRB_MCA_OOW_PILOT_ALLOWED_EMAILS` allowlist; set `TRB_MCA_OOW_PILOT_ENABLED=false` to hide). Demonstration programme `SJ-DEMO-TRB-OOW` is not listed for new enrolments.

Programme objects include provenance fields (`companionNotice`, `sourceAuthority`, `sourceUrl`, `sourceRevisionLabel`, `sourceDocumentSha256`, `isOowYachts3000`, `recognitionStatus`, version `contentProvenance`, …). See [`oow-yachts-3000gt-source-verification.md`](./oow-yachts-3000gt-source-verification.md).

### `GET /api/trb/enrollments/:enrollmentId`

Enrolment detail with sections, tasks (`progressId`, `status`, `batchRequestId`, `isBatchShadow`, `latestSignoff`, …), aggregates, recent audit.  
`latestSignoff` is the most recent decision for that task (signer name/email/rank, `decision`, `decisionNotes`, `signedAt`) when a digital sign-off exists.  
`batchRequestId` is set when the task has a **pending** batch item; `isBatchShadow` is `true` in that case.  
Source: `src/app/api/trb/enrollments/[enrollmentId]/route.ts` → `getEnrollmentDetail`

Task `status` values: `not_started` | `in_progress` | `ready_for_assessment` | `awaiting_signoff` | `changes_requested` | `approved` | `rejected` | `superseded`

### `DELETE /api/trb/enrollments/:enrollmentId`

Permanently deletes the caller’s enrolment and **all** related data: task progress, evidence files (storage), sign-off requests, digital sign-offs, batch requests/items, parallel-book rows, and enrolment audit events.

- Auth: Bearer (owner only)
- Web UI requires password re-auth (`signInWithPassword`) before calling this endpoint
- Irreversible; does not affect the official paper Training Record Book
- Response: `{ ok, enrollmentId, progressDeleted, signoffsDeleted, evidenceFilesRemoved, serverTime }`
- Errors: `not_found` (404), `forbidden` (403), `delete_failed` (500)

Source: `…/enrollments/[enrollmentId]/route.ts` → `deleteEnrollment`

### `GET /api/trb/enrollments/:enrollmentId/tasks/:taskProgressId`

Task detail: progress (incl. `candidateNotes`), evidence metadata, `requests` (each with `batchRequestId`, `batchItemId`, `isBatchShadow`), `signoffs`, `pendingRequest`, top-level `batchRequestId` / `isBatchShadow`, parallel-book companion fields.  
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

Returns server-authoritative roster. Only users with an active
`vessel_trb_signoff_authorities` grant (`can_sign_training_records`) who are
attached to the candidate’s vessel and satisfy the task role rule.

```json
{
  "vesselId": "…",
  "vesselName": "Example Yacht",
  "requiredSignerRole": "captain",
  "signers": [
    {
      "userId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "email": "captain@example.com",
      "fullName": "Alex Captain",
      "rank": "Master",
      "assignmentRole": "captain",
      "vesselRole": "captain",
      "assignmentId": null,
      "vesselId": "…",
      "vesselName": "Example Yacht",
      "source": "captain",
      "authorityType": "captain",
      "isVesselManager": false,
      "authorityId": "…",
      "authorityExpiresAt": null,
      "eligibilityLabel": "Captain · Training Record authority",
      "canSignTrainingRecords": true,
      "qualificationSummary": "Master",
      "credentialVerificationStatus": null,
      "selfDeclared": false
    }
  ],
  "allowExternalInviteHint": "…",
  "serverTime": "…"
}
```

External email-only invites are **not** eligible for Training Record sign-off.

### `POST /api/trb/signoff/request` / `DELETE /api/trb/signoff/request`

```json
{
  "taskProgressId": "…",
  "signerUserId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "authorisedConfirmation": true,
  "optionalMessage": "Optional note",
  "idempotencyKey": "client-stable-key"
}
```

Legacy body still accepted: `signerEmail` + `signerName` (without `signerUserId`).  
Do not use DELETE to cancel batch shadow rows — use `DELETE /api/trb/signoff/batch`.

### Vessel Training Record authority

### `GET /api/trb/vessel-authorities?vesselId=…`  
### `GET /api/trb/vessel-authorities?vesselId=…&candidates=1`  
### `POST /api/trb/vessel-authorities` — grant  
### `DELETE /api/trb/vessel-authorities` — revoke  

Manager-only (vessel manager / vessel role / admin). See [`vessel-signoff-authority.md`](./vessel-signoff-authority.md).

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
      "vesselRole": "captain",
      "assignmentId": null,
      "vesselId": "…",
      "vesselName": "Example Yacht",
      "source": "captain",
      "authorityType": "captain",
      "isVesselManager": false,
      "authorityId": "…",
      "authorityExpiresAt": null,
      "eligibilityLabel": "Captain · Training Record authority",
      "canSignTrainingRecords": true,
      "qualificationSummary": "Master",
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
  "signerUserId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "authorisedConfirmation": true,
  "optionalMessage": "Please review these watchkeeping tasks.",
  "idempotencyKey": "client-stable-key"
}
```

Legacy: `signerEmail` + `signerName` still accepted without `signerUserId`.

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
