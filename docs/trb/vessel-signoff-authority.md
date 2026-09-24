# Vessel Training Record sign-off authority

SeaJourney **Training Record digital companion** only. Not MCA or PYA recognition.

## Architecture decision

| Concern | Representation |
|--------|----------------|
| Vessel manager | `vessels.vessel_manager_id` → `users.id` (account ownership / management) |
| Officer / captain attachment | `vessel_assignments`, `vessel_signing_authorities`, `users.managed_by_vessel_id` invites |
| Testimonial signing | Unchanged — `vessel_signing_authorities` |
| **Training Record assessor** | Explicit `vessel_trb_signoff_authorities.can_sign_training_records` |

Being a vessel manager, captain, or testimonial signer does **not** make someone a Training Record assessor until a manager grants authority.

## Database

Migration: `sql/add-vessel-trb-signoff-authorities.sql` (additive).

### `vessel_trb_signoff_authorities`

- `vessel_id`, `user_id`, `granted_by`
- `can_sign_training_records` (true for active grants)
- Optional scope: `program_id`, `program_version_id` (NULL = all programmes)
- `valid_from`, `valid_until`, `revoked_at`, `revoke_reason`, `notes`

Unique active grant per `(vessel, user, program scope)`.

### `vessel_trb_authority_events`

Grant/revoke audit (service-role writes; managers can SELECT).

### Snapshot columns on `trb_signoffs`

`authority_id`, `authority_source`, `signer_vessel_role`, `is_vessel_manager_snapshot` — filled at decision time from request `eligibility_snapshot`. Revoking later does not rewrite history.

## Eligibility rules (server)

For each request the server checks:

1. Requester owns the enrolment.
2. Tasks are ready / selectable; no other active pending request.
3. Signer is an authenticated user with active vessel attachment.
4. Active non-revoked in-date TRB authority grant.
5. Role satisfies the most restrictive `required_signer_role` in the selection.
6. Not the candidate themselves (`CANNOT_SIGN_OWN_TASK`).
7. Pending invites / inactive / expired grants rejected with stable `SIGNER_*` codes.
8. If the client’s selected user is no longer on the roster → `SIGNER_ELIGIBILITY_CHANGED` (refresh).

Implementation: `src/lib/trb/eligibility.ts`, used by single (`service.ts`) and batch (`batch.ts`).

## Signer API contract

**Preferred create body:**

```json
{
  "signerUserId": "<uuid>",
  "authorisedConfirmation": true
}
```

**Compatibility:** `signerEmail` + `signerName` without `signerUserId` still works. If both are sent, email must match the resolved user.

**Eligible signer object (camelCase):** `userId`, `fullName`, `email`, `vesselRole`, `authorityType`/`source`, `isVesselManager`, `eligibilityLabel`, `authorityId`, `authorityExpiresAt`, `qualificationSummary`, `canSignTrainingRecords`.

Clients must **not** invent eligibility.

## Vessel dashboard

`/dashboard/vessel-roles` — Training Record sign-off panel:

- Lists manager + linked / assigned candidates
- Grant / revoke switch (Bearer → `/api/trb/vessel-authorities`)
- Warning: only grant to suitably qualified captains/officers
- Managers must explicitly enable themselves

## Crew request flows

Single-task and batch UIs select by `signerUserId` from server roster. One email + one in-app notification to the selected signer (no duplicate manager/officer identities).

## Reviewer access

- Authenticated queue: `GET /api/trb/signoff/queue` matches `signer_user_id` **or** legacy `signer_email`
- Email token review unchanged (same request / batch parent)
- One authoritative signer identity; token + queue cannot double-approve (RPC + used_at)

## Flutter changes required

1. Run / assume `add-vessel-trb-signoff-authorities.sql` is applied.
2. Parse enriched eligible-signer fields; display `eligibilityLabel`.
3. Submit **`signerUserId`** for single and batch create (keep email/name optional for older backends).
4. On `SIGNER_ELIGIBILITY_CHANGED` / `SIGNER_*`, refresh signers and retry.
5. Queue may return `signerUserId`; continue matching by email for older rows.
6. Do not treat vessel manager / captain role alone as eligible.

## Manual E2E

`manager attaches officer → grants Training Record authority → crew selects tasks → officer appears as signer → crew submits → officer reviews on website → crew sees results`

Also: grant authority to the vessel manager explicitly, then select them as signer.
