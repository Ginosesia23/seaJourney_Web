# Training Record system — shared approval architecture

Central Training Record system for SeaJourney web and Flutter.
Builds on Digital TRB Companion Phase 1 and the source-verified OOW (Yachts &lt;3,000 GT) companion programme.

**Not** an MCA- or PYA-approved electronic Training Record Book.
Companion labels: digital companion · not MCA/PYA approved.

Source verification: [`oow-yachts-3000gt-source-verification.md`](./oow-yachts-3000gt-source-verification.md).

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
2. Crew enrols in a discoverable programme (OOW companion is env-gated).
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

`src/lib/trb/eligibility.ts` requires **all** of:

1. Authenticated SeaJourney user (`users.id`)
2. Active attachment to the candidate’s vessel (manager, assignment, signing authority, or linked vessel account)
3. Explicit row in `vessel_trb_signoff_authorities` with `can_sign_training_records = true`, not revoked, in date range
4. Assignment / manager role satisfying task `required_signer_role`
5. Invitation accepted (pending linked accounts excluded)

Vessel managers and captains are **not** assessors by default. Testimonials /
`vessel_signing_authorities` do not grant Training Record authority.

Stable identity: clients submit `signerUserId`; server resolves name/email/role.

See [`vessel-signoff-authority.md`](./vessel-signoff-authority.md).

## Programme versioning

- Draft versions are mutable (admin only).
- Pilot / active / retired versions cannot be edited in place (`assertVersionMutable`).
- Content changes require a new version.
- Ordinary vessel managers do **not** get programme-edit rights.

## Migrations

Run in order (if not already applied):

1. `sql/create-digital-trb-companion.sql`
2. `sql/add-trb-submit-signoff-rpc.sql`
3. `sql/seed-digital-trb-demo-program.sql` (historical; deactivated by promote)
4. `sql/extend-trb-mca-oow-pilot.sql` + `sql/seed-trb-mca-oow-pilot-section.sql` (OOW companion seed)
5. **`sql/expand-trb-training-record-system.sql`** ← ready_for_assessment, official fields, snapshots, rate limits, admin RLS
6. `sql/add-trb-batch-signoff.sql` + `sql/add-trb-batch-signoff-rpc.sql` (multi-task)
7. **`sql/add-vessel-trb-signoff-authorities.sql`** ← explicit Training Record assessor grants
8. **`sql/promote-trb-oow-yachts-3000gt-companion.sql`** ← professional OOW companion metadata + hide demo
9. **`sql/seed-trb-oow-yachts-3000gt-full-book.sql`** ← Parts 1–5 signable sections/tasks + progress backfill

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / service role keys | Existing |
| `RESEND_API_KEY` | Sign-off emails |
| `TRB_AUDIT_IP_SALT` or `CRON_SECRET` | IP hash salt |
| `TRB_MCA_OOW_PILOT_ENABLED` | Kill-switch for OOW companion discovery (default **on** when unset; set `false` to hide) |
| `TRB_MCA_OOW_PILOT_ALLOWED_EMAILS` | Optional allowlist. Empty = any authenticated user with Training Records access |
| App base URL helpers used by email links | Existing `trbAppBaseUrl()` |

## Feature flag

Platform flag key: **`training_records`**

- Catalog: `src/lib/feature-flags/catalog.ts` (`defaultMinCrewTier: 'set:test'`)
- Seed: `sql/add-training-records-feature-flag.sql` (`min_crew_tier = 'set:test'`)
- Gates `/dashboard/training-records` (candidate programmes). Signer review under `/dashboard/training-signoffs` stays reachable from Inbox without the candidate tier.
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

- OOW companion (if seeded + env-gated), testimonials, vessel approvals, public verification — preserved. Demo programme is hidden from new discovery after promote.
- Routes unchanged; new routes added under `/api/trb/**` and `/dashboard/training-programmes`.
