# Training Record system — shared approval architecture

Central Training Record system for SeaJourney web (and future Flutter).
Builds on Digital TRB Companion Phase 1 and the MCA OOW (Yachts) one-section pilot.

**Not** an MCA- or PYA-approved electronic Training Record Book.
Pilot labels: `DIGITAL COMPANION PILOT` · `NOT AN OFFICIAL TRB`.

## Decision: Strategy B (service-layer share)

The existing **testimonial** sign-off model stores **plaintext UUID tokens** on testimonial rows and is tightly coupled to sea-time/testimonial columns.

Forcing a polymorphic rewrite of testimonials would be unsafe. Instead:

| Shared (single implementation) | Resource-specific |
| --- | --- |
| `src/lib/signoff-tokens.ts` — high-entropy token, SHA-256 hash, TTL, expiry checks | Testimonial tables + plaintext token columns (unchanged) |
| Resend email helpers patterns | TRB email templates (`src/lib/trb/email.ts`) |
| Notification dispatch (`notifyTrbEvent` → `sendUserNotification`) | Testimonial notification kinds |
| Audit IP hashing | TRB `trb_audit_events` vs testimonial audit |
| Durable rate limit helper (`trb_rate_limits`) | Applied on TRB token routes |

TRB continues to store **hashed** tokens only. Testimonials continue to work exactly as before.

## Expanded workflow

1. Admin manages programmes / immutable versions / sections / tasks (official vs SeaJourney fields).
2. Crew enrols (demo or gated MCA pilot).
3. Crew adds notes + evidence → status `in_progress`.
4. Crew marks **ready for assessment** (`POST /api/trb/tasks/ready`).
5. Server lists eligible signers from active vessel roster (`GET /api/trb/eligible-signers`).
6. Crew requests sign-off only when `ready_for_assessment`; eligibility enforced server-side.
7. Shared hashed-token helpers create request; email sends secure link.
8. Captain decides on web page; atomic RPC + snapshot enrichment; notifications fire.
9. Audit report / application pack export remains candidate-owned.

## Task lifecycle

```
not_started → in_progress → ready_for_assessment → awaiting_signoff
awaiting_signoff → changes_requested | approved | rejected | ready_for_assessment (cancel)
changes_requested → in_progress
rejected → in_progress
```

Clients cannot submit arbitrary status values; transitions are enforced in `src/lib/trb/service.ts`.

## Signer eligibility

`src/lib/trb/eligibility.ts` evaluates:

- Task `required_signer_role` (default `captain` for OOW trial)
- Candidate active vessel assignment
- Vessel signing authorities + assignment roles (`captain` / `officer` / `admin`)
- Optional **external invite** (`allowExternalInvite`) → `self_declared` credentials (never SeaJourney-verified)

Candidates cannot request sign-off from their own email.

## Programme versioning

- Draft versions are mutable (admin only).
- Pilot / active / retired versions cannot be edited in place (`assertVersionMutable`).
- Content changes require a new version.
- Ordinary vessel managers do **not** get programme-edit rights.

## Migrations

Run in order (if not already applied):

1. `sql/create-digital-trb-companion.sql`
2. `sql/add-trb-submit-signoff-rpc.sql`
3. `sql/seed-digital-trb-demo-program.sql`
4. `sql/extend-trb-mca-oow-pilot.sql` (optional MCA pilot)
5. `sql/seed-trb-mca-oow-pilot-section.sql` (optional)
6. **`sql/expand-trb-training-record-system.sql`** ← ready_for_assessment, official fields, snapshots, rate limits, admin RLS

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / service role keys | Existing |
| `RESEND_API_KEY` | Sign-off emails |
| `TRB_AUDIT_IP_SALT` or `CRON_SECRET` | IP hash salt |
| `TRB_MCA_OOW_PILOT_ENABLED` | Gate real-content pilot |
| `TRB_MCA_OOW_PILOT_ALLOWED_EMAILS` | Allowlist |
| App base URL helpers used by email links | Existing `trbAppBaseUrl()` |

## Feature flag

Platform flag key: **`training_records`**

- Catalog: `src/lib/feature-flags/catalog.ts` (`defaultMinCrewTier: 'set:test'`)
- Seed: `sql/add-training-records-feature-flag.sql` (`min_crew_tier = 'set:test'`)
- Gates `/dashboard/training-records` and `/dashboard/training-signoffs` (nav + dashboard route guard)
- **Test accounts tier:** crew access chip on Feature flags (same UI as Free / Premium). Maps to `users.is_testing`. Combine with other tiers to widen rollout.
- Secure email sign-off links (`/training-records/signoff/[token]`) stay reachable when the flag is off
- Admins always bypass; manage under Dashboard → Feature flags
- Optional vessel-linked grant for secondary accounts (`training_records`) — skipped while access is Test-only

Default: enabled for **Test accounts** only (admin can add Premium etc. when ready).

## Mobile / Flutter readiness

See `docs/trb/mobile-api-reference.md`.

- All mutating TRB APIs use `Authorization: Bearer <supabase_access_token>` (same as web session JWT).
- No cookie-only auth for TRB APIs.
- Evidence returns short-lived signed URLs after auth — never public storage paths.
- Idempotency keys supported on ready + sign-off request.
- `serverTime` included on new/updated responses.
- Offline sync is **not** implemented in this task; clients may cache GETs and replay idempotent POSTs.

## Notifications

Events via `notifyTrbEvent`: ready, requested, viewed, changes_requested, approved, rejected, cancelled (plus hooks for expiring/expired). Prefer inbox + FCM payload; evidence is never emailed as attachments.

## RLS changes (additive)

- Admin ALL policies on catalogue tables (`role = 'admin'`).
- Progress UPDATE WITH CHECK includes `ready_for_assessment`.
- `trb_rate_limits` — service-role only (no authenticated policies).

Testimonial / vessel RLS is unchanged.

## Compatibility

- Demo programme, MCA pilot (if seeded + flagged), testimonials, vessel approvals, public verification — preserved.
- Routes unchanged; new routes added under `/api/trb/**` and `/dashboard/training-programmes`.
