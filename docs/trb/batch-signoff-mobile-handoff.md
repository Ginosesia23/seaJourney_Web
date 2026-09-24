# Batch training-record sign-off — Flutter mobile handoff

**Status:** Website/backend implemented. Flutter not modified.  
**Verified against repository:** 2026-09-19  
**Verdict:** `READY FOR FLUTTER` (see §12 for non-blocking gaps)

This document is the implementation package for a separate Flutter Cursor session. Do not guess names — every table, route, status and JSON property below was read from SQL migrations and TypeScript route/service code in `seaJourney_Web`.

---

## 1. Architecture summary

Crew selects one or more **ready_for_assessment** tasks on a single enrolment and creates **one** grouped request.

| Layer | Implementation |
|-------|----------------|
| Parent | `trb_batch_signoff_requests` — one hashed public review token, one email |
| Items | `trb_batch_signoff_items` — one row per `trb_task_progress`, per-task status/feedback |
| Shadow | `trb_signoff_requests` with `is_batch_shadow = true` — never emailed; preserves `trb_signoffs` FK |
| Decisions | Immutable rows in `trb_signoffs`; applied by RPC `trb_submit_batch_signoff_decision` |
| Auth for Flutter | `Authorization: Bearer <supabase_access_token>` via Next.js APIs (`requireBearerUser`) |
| Direct DB | Flutter must **not** write batch tables. Reads of notifications inbox may use Supabase client (existing pattern). All batch CRUD goes through `/api/trb/*`. |

Officer review for this phase is **website email-token UI**. Flutter crew app submits the request, then refreshes enrolment / batch detail after the officer decides on the web.

---

## 2. Exact database relationship

```
trb_enrollments
  └── trb_task_progress (status authoritative for task UI)
        ├── trb_task_evidence
        ├── trb_batch_signoff_items (0..1 pending via unique partial index)
        │     ├── → trb_batch_signoff_requests (parent token, aggregate status)
        │     └── → trb_signoff_requests (shadow, is_batch_shadow=true)
        │               └── → trb_signoffs (immutable decision snapshot, 1:1 with request)
        └── trb_signoff_requests (non-shadow single-task requests, is_batch_shadow=false)
              └── → trb_signoffs
```

### Chain after create

1. Insert parent `trb_batch_signoff_requests` (`status=pending`, `token_hash`).
2. Insert N `trb_batch_signoff_items` (`status=pending`).
3. For each item: insert shadow `trb_signoff_requests` (`is_batch_shadow=true`, `batch_request_id`, `batch_item_id`, unique `token_hash` never emailed).
4. Link `trb_batch_signoff_items.signoff_request_id`.
5. Set each `trb_task_progress.status = awaiting_signoff`.

### After officer submit (RPC)

For each decision: insert `trb_signoffs` → set shadow request status to decision → set item status → set progress status → mark parent `completed` + `used_at`.

### After crew cancel

Parent → `cancelled`; pending items → `cancelled`; pending shadows → `cancelled`; progress `awaiting_signoff` → `ready_for_assessment`.

### Duplicate active requests

- Partial unique index `trb_batch_signoff_items_progress_pending_uidx` on `(task_progress_id) WHERE status = 'pending'`.
- Service also excludes tasks with pending **non-shadow** single requests.
- Create path re-validates via `listEligibleTasksForBatch`.

### Authoritative status by concern

| Concern | Authoritative record |
|---------|----------------------|
| Task list / selectable? | `trb_task_progress.status` + eligible-tasks API |
| Per-task decision / feedback on a batch | `trb_batch_signoff_items.status` + `decision_notes` |
| Immutable signer snapshot | `trb_signoffs` |
| Aggregate batch lifecycle | `trb_batch_signoff_requests.status` |
| Shadow row | Mirrors item decision once decided; not used for Flutter UI |

### Aggregate batch status

Parent is **not** derived live: RPC sets `completed` when all decisions in one atomic submit succeed. Cancel/expire set `cancelled` / `expired`. There is **no** `partially_reviewed` parent status — every pending item must be decided in one POST.

### Partial (mixed) decisions

Represented only on **items** (and matching progress + signoffs). Parent becomes `completed` with item mix e.g. 3×`approved` + 1×`changes_requested`.

---

## 3. Exact endpoint matrix

Base URL: app origin (same as website), paths below.

| # | Method | Path | Who | Purpose |
|---|--------|------|-----|---------|
| 1 | GET | `/api/trb/enrollments` | Crew Bearer | List enrolments |
| 2 | GET | `/api/trb/enrollments/:enrollmentId` | Crew Bearer | Enrolment + tasks + statuses |
| 3 | GET | `/api/trb/enrollments/:enrollmentId/tasks/:taskProgressId` | Crew Bearer | Task detail, notes, evidence meta, requests, signoffs |
| 4 | PATCH | `/api/trb/notes` | Crew Bearer | Update `candidate_notes` |
| 5 | POST | `/api/trb/tasks/ready` | Crew Bearer | Mark `ready_for_assessment` |
| 6 | POST | `/api/trb/evidence` | Crew Bearer | Upload evidence (multipart) |
| 7 | DELETE | `/api/trb/evidence` | Crew Bearer | Delete evidence |
| 8 | GET | `/api/trb/evidence/download?evidenceId=` | Crew Bearer | Short-lived signed URL |
| 9 | GET | `/api/trb/signoff/batch?enrollmentId=` | Crew Bearer | **Eligible tasks for selection** |
| 10 | GET | `/api/trb/signoff/batch?enrollmentId=&taskProgressId=&…` | Crew Bearer | **Eligible signers for selection** |
| 11 | POST | `/api/trb/signoff/batch` | Crew Bearer | **Create grouped request** |
| 12 | GET | `/api/trb/enrollments/:enrollmentId/batch-requests` | Crew Bearer | **List crew batch requests** |
| 13 | GET | `/api/trb/signoff/batch/:batchRequestId` | Crew/Signer/Admin Bearer | **Batch detail + items** |
| 14 | DELETE | `/api/trb/signoff/batch` | Crew Bearer | **Cancel pending batch** |
| 15 | GET | `/api/trb/signoff/queue` | Officer Bearer | Queue (optional; website-oriented) |
| 16 | GET/POST | `/api/trb/signoff/:token` | Public token | Officer review (website; Flutter crew should **not** call) |
| 17 | GET | `/api/trb/eligible-signers?taskProgressId=` | Crew Bearer | Single-task signers (not batch) |
| 18 | POST/DELETE | `/api/trb/signoff/request` | Crew Bearer | Single-task create/cancel |

**Flutter should never call:** admin programme routes, public token decide POST (crew), service-role anything.

**Source files:**

- `src/app/api/trb/signoff/batch/route.ts`
- `src/app/api/trb/signoff/batch/[batchRequestId]/route.ts`
- `src/app/api/trb/enrollments/[enrollmentId]/batch-requests/route.ts`
- `src/app/api/trb/signoff/[token]/route.ts`
- `src/app/api/trb/signoff/queue/route.ts`
- `src/lib/trb/batch.ts`, `auth.ts`, `schemas.ts`

---

## 4. JSON request/response examples (verified shapes)

### 4.1 Eligible tasks — `GET /api/trb/signoff/batch?enrollmentId={uuid}`

Headers: `Authorization: Bearer {access_token}`

Success `200`:

```json
{
  "enrollmentId": "11111111-1111-1111-1111-111111111111",
  "tasks": [
    {
      "taskProgressId": "22222222-2222-2222-2222-222222222222",
      "taskId": "33333333-3333-3333-3333-333333333333",
      "status": "ready_for_assessment",
      "taskCode": "MCA-P3-WATCH-01",
      "title": "Official or display title",
      "sectionId": "44444444-4444-4444-4444-444444444444",
      "sectionTitle": "Watchkeeping",
      "requiredSignerRole": "captain",
      "selectable": true
    }
  ],
  "serverTime": "2026-09-19T12:00:00.000Z"
}
```

**Server eligibility (do not reimplement):** status must be `ready_for_assessment`; non-empty trimmed `candidate_notes`; not in pending batch item; not in pending non-shadow single request. Only then appears here with `selectable: true`.

### 4.2 Eligible signers — `GET /api/trb/signoff/batch?enrollmentId={uuid}&taskProgressId={uuid}&taskProgressId={uuid}`

Success `200`:

```json
{
  "vesselId": "55555555-5555-5555-5555-555555555555",
  "vesselName": "Example Yacht",
  "requiredSignerRole": "captain",
  "taskCount": 2,
  "signers": [
    {
      "userId": "66666666-6666-6666-6666-666666666666",
      "email": "captain@example.com",
      "fullName": "Alex Captain",
      "rank": "Master",
      "assignmentRole": "captain",
      "assignmentId": null,
      "vesselId": "55555555-5555-5555-5555-555555555555",
      "vesselName": "Example Yacht",
      "source": "signing_authority",
      "credentialVerificationStatus": null,
      "selfDeclared": false
    }
  ],
  "serverTime": "2026-09-19T12:00:00.000Z"
}
```

`requiredSignerRole` is the **most restrictive** role among selected tasks (`captain` > `captain_or_chief_officer` > `deck_officer` > `training_officer` via `mostRestrictiveRole` in `batch.ts`).

Errors: `403` Forbidden; `400` with `code: "task_not_eligible"`.

### 4.3 Create batch — `POST /api/trb/signoff/batch`

```json
{
  "enrollmentId": "11111111-1111-1111-1111-111111111111",
  "taskProgressIds": [
    "22222222-2222-2222-2222-222222222222",
    "77777777-7777-7777-7777-777777777777"
  ],
  "signerName": "Alex Captain",
  "signerEmail": "captain@example.com",
  "authorisedConfirmation": true,
  "optionalMessage": "Please review these tasks together.",
  "allowExternalInvite": false,
  "idempotencyKey": "client-uuid-or-stable-key-min-8"
}
```

**Stable submit identifier:** Prefer **`signerUserId`** (SeaJourney user id). Server resolves name, email, vessel role, and authority. Legacy `signerEmail` + `signerName` still accepted during rollout; if both are sent, email must match the selected user. Do **not** invent eligibility on the client — use `GET …/signoff/batch?…&taskProgressId=…` or `GET /api/trb/eligible-signers`.

Success `200`:

```json
{
  "batchRequestId": "88888888-8888-8888-8888-888888888888",
  "expiresAt": "2026-09-26T12:00:00.000Z",
  "taskCount": 2,
  "emailSent": true,
  "emailSkipped": false,
  "idempotent": false,
  "eligibility": {
    "source": "signing_authority",
    "selfDeclared": false,
    "vesselId": "55555555-5555-5555-5555-555555555555",
    "vesselName": "Example Yacht"
  },
  "serverTime": "2026-09-19T12:00:00.000Z"
}
```

Notes:

- `reviewUrl` is **omitted in production** (only when `NODE_ENV !== 'production'` and email skipped).
- Same `(enrollmentId, idempotencyKey)` returns prior request with `idempotent: true` (no duplicate).
- Error codes: `validation_error`, `task_not_eligible`, `signer_ineligible`, `self_signoff_forbidden`, `empty_selection`.

Safe to retry with same `idempotencyKey`.

### 4.4 List batch requests — `GET /api/trb/enrollments/:enrollmentId/batch-requests`

**camelCase throughout.**

```json
{
  "requests": [
    {
      "id": "88888888-8888-8888-8888-888888888888",
      "status": "pending",
      "signerEmail": "captain@example.com",
      "signerName": "Alex Captain",
      "expiresAt": "2026-09-26T12:00:00.000Z",
      "createdAt": "2026-09-19T12:00:00.000Z",
      "usedAt": null,
      "optionalMessage": "Please review…",
      "taskCount": 2,
      "counts": {
        "approved": 0,
        "changesRequested": 0,
        "rejected": 0,
        "pending": 2,
        "cancelled": 0
      }
    }
  ],
  "serverTime": "2026-09-19T12:00:00.000Z"
}
```

Sort: `createdAt` DESC. Limit: 50. No pagination cursor.

### 4.5 Batch detail — `GET /api/trb/signoff/batch/:batchRequestId`

Allowed if viewer is enrolment owner, matching `signerEmail`, or `users.role = admin`.

```json
{
  "ok": true,
  "kind": "batch",
  "isMcaPilot": true,
  "batch": {
    "id": "88888888-8888-8888-8888-888888888888",
    "status": "completed",
    "expiresAt": "…",
    "usedAt": "…",
    "viewedAt": "…",
    "createdAt": "…",
    "optionalMessage": "…",
    "overallFeedback": "Strong overall.",
    "signerEmail": "captain@example.com",
    "signerName": "Alex Captain",
    "requiredSignerRole": "captain",
    "vesselName": "Example Yacht",
    "vesselId": "55555555-5555-5555-5555-555555555555"
  },
  "candidate": { "name": "Jordan Crew", "userId": "…" },
  "programme": {
    "name": "…",
    "code": "SJ-PILOT-MCA-OOW-YACHTS",
    "version": "1.0",
    "disclaimer": "…",
    "attribution": "…",
    "sourceUrl": "…",
    "oglUrl": "…"
  },
  "enrollmentId": "11111111-1111-1111-1111-111111111111",
  "counts": {
    "total": 2,
    "pending": 0,
    "approved": 1,
    "changesRequested": 1,
    "rejected": 0,
    "cancelled": 0
  },
  "items": [
    {
      "id": "99999999-9999-9999-9999-999999999999",
      "status": "approved",
      "decisionNotes": null,
      "decidedAt": "…",
      "sortOrder": 0,
      "taskProgressId": "22222222-2222-2222-2222-222222222222",
      "progress": {
        "id": "22222222-2222-2222-2222-222222222222",
        "status": "approved",
        "candidateNotes": "…"
      },
      "section": { "id": "…", "title": "Watchkeeping", "sortOrder": 1 },
      "task": {
        "id": "…",
        "sectionId": "…",
        "taskCode": "MCA-P3-WATCH-01",
        "title": "…",
        "description": "…",
        "officialTitle": "…",
        "officialDescription": "…",
        "seajourneySummary": "…",
        "seajourneyGuidance": "…",
        "seajourneyCompletionGuidance": "…",
        "evidenceGuidance": "…",
        "requiredSignerRole": "captain",
        "sourceTaskReference": "…",
        "sourcePageReference": "…"
      },
      "evidence": [
        {
          "id": "…",
          "taskProgressId": "…",
          "originalFilename": "bridge.jpg",
          "mimeType": "image/jpeg",
          "fileSize": 120000,
          "evidenceType": "document",
          "description": null,
          "createdAt": "…"
        }
      ]
    }
  ],
  "serverTime": "…"
}
```

All nested objects are **camelCase**.

### 4.6 Cancel — `DELETE /api/trb/signoff/batch`

Body: `{ "batchRequestId": "88888888-8888-8888-8888-888888888888" }`  
Success: `{ "ok": true, "serverTime": "…" }`  
Errors: `not_pending`, Forbidden, not found.

### 4.7 Enrolment tasks (refresh after decision) — `GET /api/trb/enrollments/:enrollmentId`

Each task includes at least:

- `progressId` (uuid | null)
- `status` — exact `TrbTaskStatus` string
- `taskCode`, `title`, `sectionId`, …
- `batchRequestId` — pending batch parent id, or `null`
- `isBatchShadow` — `true` when that pending batch membership exists

### 4.8 Evidence download

`GET /api/trb/evidence/download?evidenceId={uuid}` + Bearer → `{ "signedUrl", "filename", "mimeType" }` (TTL ~120s). Do not persist URL.

---

## 5. Dart model specification

Map **only** fields the API returns. Suggested names:

### `EligibleTrainingTask` ← eligible-tasks `tasks[]`

| JSON | Dart | Type | Notes |
|------|------|------|-------|
| `taskProgressId` | `taskProgressId` | `String` | required |
| `taskId` | `taskId` | `String` | required |
| `status` | `status` | `TrbTaskStatus` | always `ready_for_assessment` in this list |
| `taskCode` | `taskCode` | `String?` | |
| `title` | `title` | `String?` | |
| `sectionId` | `sectionId` | `String?` | |
| `sectionTitle` | `sectionTitle` | `String?` | |
| `requiredSignerRole` | `requiredSignerRole` | `String` | |
| `selectable` | `selectable` | `bool` | trust this for checkboxes |

Cache: short TTL only; invalidate after notes/ready/batch create.

### `EligibleTrainingSigner` ← eligible-signers `signers[]`

| JSON | Dart | Type |
|------|------|------|
| `userId` | `userId` | `String?` |
| `email` | `email` | `String` — **submit this** |
| `fullName` | `fullName` | `String` |
| `rank` | `rank` | `String?` |
| `assignmentRole` | `assignmentRole` | `String?` |
| `assignmentId` | `assignmentId` | `String?` |
| `vesselId` | `vesselId` | `String` |
| `vesselName` | `vesselName` | `String?` |
| `source` | `source` | enum: `signing_authority` \| `assignment` \| `external_invite` |
| `credentialVerificationStatus` | `credentialVerificationStatus` | `String?` |
| `selfDeclared` | `selfDeclared` | `bool` |

Do not cache across sessions as eligibility source of truth; refresh before submit.

### `TrainingBatchSignoffRequestSummary` ← list `requests[]`

| JSON | Dart | Type |
|------|------|------|
| `id` | `id` | `String` |
| `status` | `status` | `BatchRequestStatus` |
| `signerEmail` | `signerEmail` | `String` |
| `signerName` | `signerName` | `String?` |
| `expiresAt` | `expiresAt` | `DateTime` ISO-8601 |
| `createdAt` | `createdAt` | `DateTime` |
| `usedAt` | `usedAt` | `DateTime?` |
| `optionalMessage` | `optionalMessage` | `String?` |
| `taskCount` | `taskCount` | `int` |
| `counts` | `counts` | `BatchSignoffSummary` |

### `BatchSignoffSummary` ← `counts`

`approved`, `changesRequested`, `rejected`, `pending` (`int`). Detail also has `total`, `cancelled`.

### `TrainingBatchSignoffRequest` / `TrainingBatchSignoffItem` ← detail

Use camelCase for all fields (`batch.*`, item wrappers, nested `task`/`section`/`evidence`).

### `TrainingSignoffSnapshot` ← task-detail `signoffs[]` (refresh after decision)

From `getTaskDetail`: `decision`, `signerName`, `signerEmail`, `decisionNotes`, `signedAt`, `recordHash`, etc. (camelCase).

### `BatchDecisionResult`

Not returned to Flutter crew (officer-only POST). Skip for crew app.

Enums parse unknown values as `unknown` for forward compatibility.

---

## 6. Status and transition matrix

### Task progress (`trb_task_progress.status`)

| Backend | Flutter label | Selectable | Edit notes | Edit evidence | New request | Notes |
|---------|---------------|------------|------------|---------------|-------------|-------|
| `not_started` | Not started | No | Yes (→ in_progress) | Yes* | No | |
| `in_progress` | In progress | No | Yes | Yes | No | Mark ready when done |
| `ready_for_assessment` | Ready for assessment | **Only if in eligible-tasks API** | Prefer limited | Prefer limited | Yes if eligible | Needs notes |
| `awaiting_signoff` | Sign-off requested | No | No | No | No | Cancel via batch/single API |
| `changes_requested` | Changes requested | No | Yes (→ in_progress) | Yes | After re-ready | |
| `approved` | Digitally approved | No | No | No | No | Not MCA/PYA |
| `rejected` | Rejected | No | Yes (→ in_progress) | Yes | After re-ready | |
| `superseded` | Superseded | No | No | No | No | |

\*Evidence upload blocked server-side for approved / awaiting / ready / superseded in service logic.

**Candidate transitions** (`TRB_CANDIDATE_TRANSITIONS` in `constants.ts`):

```
not_started → in_progress
in_progress → ready_for_assessment
ready_for_assessment → awaiting_signoff | in_progress
awaiting_signoff → ready_for_assessment  (cancel)
changes_requested → in_progress
rejected → in_progress
approved → ∅
superseded → ∅
```

Approvals/rejections/changes from officers are **not** candidate transitions; enforced in RPC/service.

### Batch request (`trb_batch_signoff_requests.status`)

| Value | Label | Cancel? |
|-------|-------|---------|
| `pending` | Pending | Yes (owner) |
| `completed` | Completed | No |
| `cancelled` | Cancelled | No |
| `expired` | Expired | No |

### Batch item (`trb_batch_signoff_items.status`)

| Value | Label |
|-------|-------|
| `pending` | Pending review |
| `approved` | Digitally approved |
| `changes_requested` | Changes requested |
| `rejected` | Rejected |
| `cancelled` | Cancelled |

### Shadow `trb_signoff_requests`

Same decision statuses as single-task: `pending` → `approved` \| `changes_requested` \| `rejected` \| `cancelled` \| (`expired` possible for singles). After batch decide, shadow `status` equals item decision; `used_at` set.

SQL CHECK enforces allowed strings; TypeScript/Zod enforce API inputs; RPC enforces decision set + notes + single-use token.

---

## 7. Selection rules (Flutter)

**Authoritative rule:** show checkbox only when `taskProgressId` appears in `GET /api/trb/signoff/batch?enrollmentId=` with `selectable: true`.

Do **not** independently allow selection because enrolment status is `ready_for_assessment` alone (missing notes or active request would still fail server-side).

| Scenario | Behaviour |
|----------|-----------|
| Different enrolments | Impossible in one POST (`enrollmentId` single); UI must scope to one enrolment |
| Different programme versions | Same — one enrolment ⇒ one version |
| Different required signer roles | Allowed; server picks most restrictive role for signer list |
| Already approved / rejected / awaiting | Not in eligible list |
| Active batch or single pending | Not in eligible list |
| Changes requested | Not eligible until candidate returns to ready |
| Expired/cancelled prior batch | Task may be `ready_for_assessment` again and reappear |

**Detecting active batch membership:**

1. Enrolment task `batchRequestId != null` (and `isBatchShadow: true`), **or**
2. Task detail `pendingRequest.isBatchShadow` / `batchRequestId`, **or**
3. `GET .../batch-requests` → pending → detail

---

## 8. Signer rules

- Refresh signers after selection changes.
- Submit **`signerUserId`** (preferred) or legacy **`signerEmail` + `signerName`** (+ `authorisedConfirmation: true`).
- Only users with explicit Training Record authority appear on the roster — see [`vessel-signoff-authority.md`](./vessel-signoff-authority.md).
- Self-sign-off rejected (`self_signoff_forbidden`).
- External invite only if `allowExternalInvite: true` (self-declared); roster preferred.
- Vessel overlap: candidate’s active assignment / `active_vessel_id`; signer must be on that vessel’s signing authorities or eligible assignment roles unless external invite.
- If eligibility changes before submit, POST fails with `signer_ineligible` — re-fetch signers.
- CoC fields are **not** returned on eligible-signer list; collected only on officer token decide form.

---

## 9. Authentication and idempotency

| Topic | Contract |
|-------|----------|
| Auth | `Authorization: Bearer <supabase_access_token>` |
| Validate | `supabaseAdmin.auth.getUser(accessToken)` in `requireBearerUser` |
| 401 | Refresh session once; retry once; then re-login |
| Content-Type | `application/json` (except evidence multipart) |
| CSRF | Not required for Bearer API clients |
| Idempotency | **Body** field `idempotencyKey` (string 8–120), **not** a header — on create batch / mark ready / single request |
| Decision idempotency | Schema accepts `idempotencyKey` on batch decide but **service does not persist it**; protection is single-use token + RPC `FOR UPDATE` |
| Timeout | Recommend 30–60s for create (email send) |
| Rate limit | Token routes return `429` `{ "error": "Too many requests" }` via `trb_rate_limits` |
| Secrets | Never store service-role key, raw review tokens, or long-lived signed evidence URLs |

---

## 10. Notification / deep-link contract

Inserts via `notifyTrbEvent` → `sendUserNotification` → table `app_user_notifications`.

| When | `kind` | `metadata.domain` | `metadata.event` | Title (from TITLES) | Body / metadata |
|------|--------|-------------------|------------------|---------------------|-----------------|
| Batch created (crew) | `testimonial` | `trb` | `signoff_requested` | Training sign-off requested | `batchRequestId`, `enrollmentId`, `taskCount`, `deepLink` web path |
| Batch created (signer if userId) | `testimonial` | `trb` | `signoff_requested` | same | `batchRequestId`, `enrollmentId`, `taskCount` — **no deepLink** |
| Token viewed | `testimonial` | `trb` | `request_viewed` | … viewed | `batchRequestId` |
| All tasks approved | `testimonial` | `trb` | `task_approved` | Training task approved | counts + `deepLink` |
| All changes requested | `testimonial` | `trb` | `changes_requested` | … changes requested | counts + `deepLink` |
| All rejected | `testimonial` | `trb` | `task_rejected` | Training task rejected | counts + `deepLink` |
| **Mixed decisions** | `testimonial` | `trb` | **`batch_signoff_mixed`** | **Training sign-off — mixed results** | counts + `deepLink` + `outcome` |
| Cancelled | `testimonial` | `trb` | `request_cancelled` | … cancelled | `batchRequestId`, `enrollmentId` |

Example metadata after review:

```json
{
  "domain": "trb",
  "event": "task_approved",
  "batchRequestId": "88888888-8888-8888-8888-888888888888",
  "enrollmentId": "11111111-1111-1111-1111-111111111111",
  "approved": 3,
  "changesRequested": 1,
  "rejected": 0,
  "deepLink": "/dashboard/training-records/{enrollmentId}/requests/{batchRequestId}"
}
```

**Gaps (not blocking crew API):**

1. `kind: 'testimonial'` reuses testimonial preference column — no dedicated `trb` preference (`src/lib/trb/notifications.ts`).
2. `deepLink` is a **web dashboard path**, not a Flutter named route.
3. Mixed outcomes still use event `task_approved` / title “approved”.
4. Signer notification lacks `deepLink`.
5. No dedicated `batch_signoff_completed` event string in `TrbNotificationEvent` union.

**Recommended Flutter route:** `/training-records/:enrollmentId/requests/:batchRequestId` (app-defined), mapping from `metadata.batchRequestId` + `enrollmentId`.

**File to change later for FCM:** `src/lib/trb/notifications.ts` + call sites in `src/lib/trb/batch.ts`; optionally Edge Function `user-notifications-push` if payload shaping needed.

---

## 11. Cache / offline guidance

**May cache:** enrolment/task GET; batch list/detail; note drafts locally.

**Must be online:** mark ready; create/cancel batch; trust signer list; treat approvals.

**After submit/cancel/decision:** invalidate enrolment, eligible-tasks, batch-requests, batch detail; pull-to-refresh.

---

## 12. Known blockers / gaps

| Issue | Class | Notes |
|-------|-------|-------|
| Crew batch APIs complete | — | Implementable now |
| Enrolment/task expose `batchRequestId` + `isBatchShadow` | Done | Pending batch only on enrolment tasks |
| List/detail JSON camelCase | Done | Mobile TRB APIs normalized |
| Mixed notification event | Done | `batch_signoff_mixed` |
| Decision `idempotencyKey` unused | Can follow later | Token single-use OK |
| Notification kind/deepLink for mobile routes | Can follow later | Use metadata IDs |
| Officer Flutter decide | Out of scope | Website token UI |
| No `partially_reviewed` parent status | By design | All-or-nothing submit |

**Answers to readiness questions:**

1. Yes — entire crew flow via existing APIs.  
2. No missing endpoints for crew create/list/detail/cancel/eligible.  
3. camelCase normalized for batch + enrolment task surfaces.  
4. Enrolment exposes task `status` + `batchRequestId` / `isBatchShadow`.  
5. Yes — via `batchRequestId` on task or batch-requests.  
6. Yes — batch detail items + counts.  
7. Yes — emails returned for roster pickers (treat as sensitive).  
8. Deep links still web paths for Flutter/FCM naming.  
9. Create idempotency ready; decide key not wired.  
10. No further schema change required before Flutter.

---

## 13. Flutter implementation checklist

1. Bearer API client + 401 refresh-once.  
2. Enrolment screen with sectioned tasks.  
3. Load eligible-tasks; checkboxes only for returned IDs.  
4. Sticky selection summary → fetch signers with selected IDs.  
5. Confirm sheet → POST batch with `idempotencyKey`.  
6. Navigate to batch list/detail; cancel if pending.  
7. On notification / resume: refresh enrolment + batch detail; show mixed item statuses.  
8. Evidence via download API only.  
9. Labels: “Digitally approved” never “MCA approved”.  
10. Do not call token routes from crew app.

---

## 14. Manual mobile ↔ website E2E

1. Flutter: enrol / open programme → notes → ready on ≥2 tasks.  
2. Select both → choose roster signer → submit.  
3. Confirm one email on officer account; Flutter shows pending batch.  
4. Officer opens web link → mixed decisions → confirm.  
5. Flutter pull-to-refresh: items show approved / changes_requested; task statuses match.  
6. Cancel path: create pending → cancel in app → tasks return to ready / reappear in eligible list.  
7. Regression: single-task request + testimonials unchanged.

---

## Database tables Flutter depends on

| Table | Access |
|-------|--------|
| `trb_batch_signoff_requests` | **API only** |
| `trb_batch_signoff_items` | **API only** |
| `trb_signoff_requests` / `trb_signoffs` | **API only** (via task/batch detail) |
| `trb_enrollments`, `trb_task_progress`, `trb_tasks`, `trb_sections`, `trb_program_versions`, `trb_programs` | **API only** for this feature |
| `trb_task_evidence` | **API only** (metadata + signed URL) |
| `vessel_assignments`, `vessel_signing_authorities` | **API only** (via eligible signers) |
| `app_user_notifications` | Direct Supabase read OK (existing inbox RLS); inserts server-side |
| `trb_rate_limits`, `trb_audit_events` | Not for Flutter clients |

Notes live on **`trb_task_progress.candidate_notes`** — there is no separate TRB notes table.

### Migrations for this feature

1. `sql/add-trb-batch-signoff.sql`  
2. `sql/add-trb-batch-signoff-rpc.sql` (after `sql/add-trb-submit-signoff-rpc.sql`)
