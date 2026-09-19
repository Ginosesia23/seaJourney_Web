# Training Record mobile API reference (Flutter-ready)

Base path: `/api/trb/*`  
Auth: `Authorization: Bearer <supabase_jwt>` for all authenticated routes.  
Token review routes use the raw email link token in the path (no Bearer).

All successful JSON bodies may include `serverTime` (ISO-8601).  
Errors: `{ "error": "<message or code>" }` with HTTP 400/401/403/404/410/429/500.

## Enrolments

### `GET /api/trb/enrollments`

List current user’s enrolments + discoverable programmes.

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

Enrolment detail with sections, tasks, progress aggregates, recent audit.

### `GET /api/trb/enrollments/:enrollmentId/tasks/:taskProgressId`

Task detail: official wording, SeaJourney guidance, notes, evidence metadata, requests, sign-offs, parallel-book (pilot).

### `GET /api/trb/enrollments/:enrollmentId/report`

Audit / application-pack style JSON export (pilot disclaimers included).

## Notes & readiness

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

Response: `{ "status": "ready_for_assessment", "idempotent": false, "serverTime": "…" }`

## Evidence

### `POST /api/trb/evidence` (multipart)

Fields: `taskProgressId`, `file`, optional `description`.

### `DELETE /api/trb/evidence`

```json
{ "evidenceId": "00000000-0000-0000-0000-000000000002" }
```

### `GET /api/trb/evidence/download?evidenceId=…`

Returns `{ "signedUrl": "https://…", "filename": "…", "mimeType": "…" }` (short TTL).  
Captain token variant: `&token=<rawSignoffToken>`.

## Sign-off

### `GET /api/trb/eligible-signers?taskProgressId=…`

```json
{
  "vesselId": "…",
  "vesselName": "Example Yacht",
  "requiredSignerRole": "captain",
  "signers": [
    {
      "userId": "…",
      "email": "captain@example.com",
      "fullName": "Alex Captain",
      "rank": "Master",
      "source": "signing_authority",
      "selfDeclared": false
    }
  ],
  "allowExternalInviteHint": "…",
  "serverTime": "…"
}
```

### `POST /api/trb/signoff/request`

```json
{
  "taskProgressId": "00000000-0000-0000-0000-000000000001",
  "signerName": "Alex Captain",
  "signerEmail": "captain@example.com",
  "authorisedConfirmation": true,
  "allowExternalInvite": false,
  "idempotencyKey": "optional-stable-key",
  "optionalMessage": "Please review watchkeeping task."
}
```

Notes:

- Requires status `ready_for_assessment`.
- Rejects self-sign-off.
- Roster eligibility required unless `allowExternalInvite: true`.
- Production never returns `reviewUrl`. Dev may return it only when email is skipped.

### `DELETE /api/trb/signoff/request`

Cancel pending → task returns to `ready_for_assessment`.

### `GET /api/trb/signoff/queue`

Captain queue (by signer email). Optional `?status=pending`.

### `GET|POST /api/trb/signoff/:token`

Resolve / decide (unauthenticated except possession of token). Rate-limited durably via `trb_rate_limits`.

## Pilot extras

- `POST /api/trb/parallel-book` — official-book status (candidate or captain-via-token path as implemented).
- `POST /api/trb/feedback` — pilot feedback.

## Admin (role=`admin` only)

- `GET|POST /api/trb/admin/programs`
- `GET|POST /api/trb/admin/programs/:programId` — list versions, publish/retire, upsert draft tasks.

Published versions cannot be modified in place.

## Offline guidance (future Flutter)

1. Cache enrolment + task GET payloads with `serverTime`.
2. Queue note/evidence/ready/sign-off mutations with stable `idempotencyKey`.
3. On reconnect, replay; treat identical keys as success (idempotent responses).
4. Never cache raw approval tokens or long-lived evidence URLs; refresh download URLs after auth.
5. Do not invent local approvals — only server decisions are authoritative.
