# Digital TRB Companion — Phase 1

Pilot / demonstration training-task tracker for captain-reviewed training evidence.
**Not** an MCA- or PYA-approved electronic Training Record Book.

> Expanded Training Record system: `docs/trb/training-record-system.md` · Flutter API: `docs/trb/mobile-api-reference.md`

## Scope

Phase 1 delivers a web-first vertical slice:

1. Crew enrols in a demonstration programme
2. Completes task notes + optional private evidence
3. Marks ready for assessment, then requests captain sign-off via secure email link
4. Captain reviews without installing an app
5. Approve / request changes / reject
6. Immutable sign-off + append-only audit events
7. Progress UI + printable audit report

Flutter is out of scope for Phase 1; APIs and schema are shared-backend ready.

## Architecture

| Layer | Location |
| --- | --- |
| SQL | `sql/create-digital-trb-companion.sql`, `sql/seed-digital-trb-demo-program.sql`, `sql/add-trb-submit-signoff-rpc.sql`, `sql/expand-trb-training-record-system.sql` |
| Shared tokens | `src/lib/signoff-tokens.ts` |
| Service | `src/lib/trb/*` |
| APIs | `src/app/api/trb/**` |
| Crew UI | `/dashboard/training-records/**` |
| Captain UI | `/training-records/signoff/[token]` |
| Captain queue | `/dashboard/training-signoffs` |
| Admin | `/dashboard/training-programmes` |

Server routes use the Supabase **service role** for privileged writes (token hashing, sign-off RPC, storage signed URLs). Browser clients never receive the service key. RLS still protects direct table access.

## Database model

- `trb_programs` / `trb_program_versions` / `trb_sections` / `trb_tasks` — catalogue (official programmes can be added later via `is_official` + version status)
- `trb_enrollments` — candidate pinned to one immutable programme version
- `trb_task_progress` — per-task status
- `trb_task_evidence` — private Storage metadata
- `officer_credentials` — self-declared captain details (Phase 1)
- `trb_signoff_requests` — stores **SHA-256 token hash only**
- `trb_signoffs` — immutable decisions + `record_hash`
- `trb_audit_events` — append-only

## State transitions

Candidate-driven (server-enforced):

- `not_started` → `in_progress`
- `in_progress` → `ready_for_assessment`
- `ready_for_assessment` → `awaiting_signoff`
- `awaiting_signoff` → `ready_for_assessment` (cancel pending request)
- `changes_requested` / `rejected` → `in_progress`

Captain-driven (atomic RPC `trb_submit_signoff_decision`):

- pending request → `approved` | `changes_requested` | `rejected`
- Updates request `used_at`, creates `trb_signoffs` row, writes audit event

Candidates cannot set `approved` / `rejected` via RLS or service helpers.

## Token flow

1. Candidate requests sign-off → cancel any pending → generate 32-byte base64url token → store SHA-256 hash → email raw token in link only
2. Default TTL: **7 days** (`TRB_SIGNOFF_TOKEN_TTL_DAYS`)
3. Captain opens `/training-records/signoff/[token]` → API resolves by hash, records `request_viewed`
4. Decision POST → RPC locks row, rejects expired/used/replay, writes immutable sign-off
5. Raw token is never returned from DB reads or production logs

## Storage

- Bucket: `trb-evidence` (private)
- Path: `{userId}/{enrollmentId}/{taskProgressId}/{uuid}-{filename}`
- Allowed: PDF / JPEG / PNG, max 8MB
- Access only via `/api/trb/evidence/download` short-lived signed URLs (candidate Bearer or valid captain token)

## RLS summary

- Catalogue (active/pilot): authenticated SELECT
- Enrolments / progress / evidence / audit: own rows only
- Progress UPDATE cannot set `approved`
- No INSERT on `trb_signoffs` for authenticated clients
- Captains may SELECT `trb_signoff_requests` matching their JWT email (dashboard queue only; evidence still requires token API)
- Anonymous: no access

## Environment variables

Existing:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY` (optional in dev — email skipped; review URL returned for testing)
- `BILLING_FROM_EMAIL` / `SITE_URL` / `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`
- `SUPPORT_EMAIL` (optional)

Optional:

- `TRB_AUDIT_IP_SALT` — salt for IP hashing in audit events (falls back to `CRON_SECRET`)

## Local setup

1. Apply SQL in order in Supabase SQL editor:
   - `sql/create-digital-trb-companion.sql`
   - `sql/add-trb-submit-signoff-rpc.sql`
   - `sql/seed-digital-trb-demo-program.sql` (dev/pilot)
2. Confirm Storage bucket `trb-evidence` exists (created by migration)
3. `npm run dev`
4. Sign in as crew → **Career → Training records** → Enrol in pilot

## Seed

`sql/seed-digital-trb-demo-program.sql` creates programme `SJ-DEMO-TRB-OOW`, version `pilot-2026.1`, 3 sections, 10 placeholder tasks. Safe to re-run. Do not auto-seed production unless that matches your ops practice.

## Testing

```bash
npx tsx src/lib/trb/trb.selftest.ts
npm run typecheck
npm run lint
npm run build
```

Self-tests cover token hashing, integrity hash, progress math, candidate transition rules, and Zod schemas. Full DB RLS integration tests require a Supabase test project (not automated in Phase 1 beyond unit self-tests).

## Known limitations

- Officer credentials are self-declared only
- No PYA / external reviewer role yet
- Captain dashboard lists requests by email but decisions remain on the email token page
- Soft in-memory rate limits on token routes (per server instance)
- Printable HTML audit report (browser Print → PDF); dedicated PDF binary optional later
- Evidence MIME sniffing is extension + client Content-Type (not deep magic-byte validation)

## Future Flutter integration

Reuse the same `/api/trb/*` Bearer-token APIs. Do not query private TRB tables from the mobile client with the anon key for privileged flows. Enrolment remains pinned to `program_version_id`.

## Future PYA / reviewer access

Add a reviewer entitlement table + SELECT policies; do not broaden captain/manager vessel roles into full TRB read. Prefer time-boxed, programme-scoped grants.

## Before any official recognition claims

1. Replace demonstration task wording with authorised programme content under licence
2. Independent CoC verification workflow
3. Formal retention / export / amendment policy
4. Legal review of disclaimers and sign-off declarations
5. Explicit product naming change away from “Companion / pilot”
6. Written confirmation from the relevant authority — never imply MCA/PYA acceptance until then

---

## OOW (Yachts &lt;3,000 GT) Training Record (digital companion)

Source-verified digital companion importing **one** section of the official MCA Yacht TRB under OGL v3.0. Not MCA/PYA approved as a replacement.

- Source verification: [`docs/trb/oow-yachts-3000gt-source-verification.md`](./trb/oow-yachts-3000gt-source-verification.md)
- Task page map: [`docs/trb/mca-oow-yachts-pilot-source-manifest.md`](./trb/mca-oow-yachts-pilot-source-manifest.md)
- Promote SQL: `sql/promote-trb-oow-yachts-3000gt-companion.sql`

### Selected section

Originally: PART 3 — **Maintain a Safe Navigational Watch** only (PDF pages **55–57**), 12 signable tasks.

**Full-book expansion:** run `sql/seed-trb-oow-yachts-3000gt-full-book.sql` to import Parts **1–5** signable sections (~254 tasks). See [`docs/trb/oow-yachts-3000gt-full-book-manifest.md`](./trb/oow-yachts-3000gt-full-book-manifest.md).

### Programme

- Display name: **OOW (Yachts &lt;3,000 GT) Training Record**
- Code: `SJ-PILOT-MCA-OOW-YACHTS` (stable enrolment id)
- Version: `mca-source-2014-pilot-1` (stable; status promoted to `active`)
- `is_official`: false · `recognition_status`: `not_approved`
- Demo programme `SJ-DEMO-TRB-OOW` is deactivated / hidden from discovery after promote

### Feature flag & allowlist (server-side)

```bash
TRB_MCA_OOW_PILOT_ENABLED=true
TRB_MCA_OOW_PILOT_ALLOWED_EMAILS=crew1@example.com,crew2@example.com
```

- Enforced in `listActivePrograms` / `enrolUser` (not UI-only).
- Allowlist is **never** returned to the browser.
- Signers with a valid sign-off token can still review that request.
- Disabling the flag does not delete enrolments or history.
- Admins may discover the programme when the flag is enabled.

### Consent

Before OOW companion enrolment, candidates must confirm five statements. Stored on `trb_enrollments`:

- `consent_version` (`mca-oow-companion-consent-v2`)
- `consent_disclaimer_version` (`mca-oow-companion-disclaimer-v2`)
- `consent_accepted_at`
- `consent_payload` (jsonb)

### Parallel official-book tracking

Table `trb_parallel_book_confirmations` — separate rows for `candidate` and `captain`. Digital approval **never** auto-sets official book to `signed`. Conflicting answers remain visible as discrepancies.

### Pilot feedback

Table `trb_pilot_feedback`. Candidate via Bearer API; captain via sign-off token on `/api/trb/feedback`. Does not alter sign-off decisions.

### SQL order

1. `sql/create-digital-trb-companion.sql` (if not already applied)
2. `sql/add-trb-submit-signoff-rpc.sql`
3. `sql/seed-digital-trb-demo-program.sql`
4. `sql/extend-trb-mca-oow-pilot.sql`
5. `sql/seed-trb-mca-oow-pilot-section.sql`

### Retiring the pilot

1. Set `TRB_MCA_OOW_PILOT_ENABLED=false` (hides discovery / new enrolments).
2. Optionally set programme `is_active=false` or version `status=retired`.
3. Do **not** delete historical enrolments, sign-offs, or audit events.

### Before claiming replacement / recognition

Official MCA/PYA approval has **not** been obtained. Before any replacement claim: authorised programme licence, independent CoC verification, retention policy, legal review, and written authority confirmation.

