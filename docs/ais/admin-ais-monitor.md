# Admin AIS API Monitor

Admin-only dashboard for auditing every real AIS provider (Datalastic) request,
scheduler activity and failures.

- UI: `/admin/ais-monitor` → redirects to `/dashboard/ais-monitor` (dashboard shell + sidebar, **Platform → AIS monitor**)
- Vessel detail: `/admin/ais-monitor/vessels/[vesselId]` → `/dashboard/ais-monitor/vessels/[vesselId]`
- Migration: `sql/add-ais-fetch-log-monitoring.sql`
- Self-tests: `npx tsx src/lib/ais/monitor/ais-monitor.selftest.ts`

## Guarantees

1. **The monitor never calls the provider.** Every UI request goes to
   `/api/admin/ais-monitor/*`, which only reads Supabase (`ais_fetch_log`,
   `vessel_ais_status`, `ais_observations`, `vessels_public_identity`).
   The self-test statically asserts that no monitor file imports the Datalastic
   client, the AIS service, the provider, or any `/api/ais/*` route, and that
   client components only call monitor endpoints.
2. **Every real provider HTTP request is logged once** (`cached_or_api = 'api'`).
3. **No secrets are logged.** Request URLs (which carry the Datalastic
   `api-key` query parameter) are never stored; error messages go through
   `sanitiseProviderError` (redacts `api-key=`, tokens, URL query strings, the
   configured key value; truncates to 500 chars). No raw provider payloads.

## Architecture

```
Datalastic HTTP  ──►  datalasticGet()  (src/lib/datalastic/client.ts)
                        │ times request, validates body, builds AisProviderRequestMeta
                        ├─ audit.onRequestComplete? ──► caller logs (refreshVesselAIS: one enriched row)
                        └─ otherwise ──► recordAisProviderRequest()  (src/lib/ais/fetch-audit.ts)
                                            └─► ais_fetch_log (cached_or_api='api')
```

- `fetchVesselPosition`, `fetchVesselHistory` (+ `fetchVesselHistoryRange`, one row per chunk),
  `fetchVesselInfo`, `fetchVesselFind` all go through `datalasticGet`. A caller that
  passes no audit context is still logged (trigger `unknown`) — coverage does not
  depend on call sites remembering to log.
- The central path (`refreshVesselAIS` in `src/lib/ais/ais-service.ts`) receives the
  meta through `AISProviderResult.requestMeta` and writes one row enriched with trigger,
  pre-fetch tracking mode and scheduled reason. A provider implementation that does not
  return meta gets a timing fallback measured around `provider.getVesselPosition`.
- Missing MMSI/IMO on the central path is logged with `provider_called = false`
  (no HTTP request was made) and excluded from all request metrics.
- Logging never throws. If the monitoring columns are missing (code deployed before the
  migration), the writer retries with the legacy column set.

### Pre-existing bug fixed

Before this change `ais_fetch_log` inserts used `void supabaseAdmin.from(...).insert(...)`.
Supabase query builders are lazy thenables, so those inserts never executed and the table
stayed empty. Provider rows are now awaited. Cached-read rows (`logAisCacheRead`) still use
the old non-executing pattern, deliberately unchanged (see follow-ups).

## `ais_fetch_log` columns

| Spec field | Column | Notes |
|---|---|---|
| provider | `provider` | existing |
| vessel_id | `vessel_id` | existing; NULL for registration lookups |
| mmsi | `mmsi` | **added**; digits only, when requested by MMSI |
| requested_at | `requested_at` | existing; now the moment the HTTP request started |
| completed_at | `completed_at` | **added** |
| success | `success` | existing; true = usable response. Stale fix (>6h) = false even on HTTP 200 |
| http_status | `response_status` | existing, reused; NULL = network error / no request |
| response_time_ms | `response_time_ms` | **added** |
| error_message | `error_message` | existing; sanitised |
| provider_credits_used | `provider_credits_used` | **added**, always NULL today (Datalastic does not report credits) |
| trigger_source | `trigger_source` | existing; now typed `AisTriggerSource` |
| tracking_mode | `tracking_mode` | existing; mode **before** the fetch |
| scheduled_reason | `scheduled_reason` | existing; why the fetch ran (see below) |
| — | `trigger_detail` | **added**; call-site detail (e.g. `vessel-sync:cron`, `ais-preview`) and legacy trigger strings |
| — | `endpoint` | **added**; `vessel` \| `vessel_history` \| `vessel_info` \| `vessel_find` |
| — | `provider_called` | **added**; false when aborted before HTTP |

No CHECK constraint on `trigger_source`: an older deployment writing legacy strings would
otherwise lose audit rows. Values are enforced in TypeScript and normalised on read.

### Trigger sources (`AisTriggerSource`)

| Value | Emitted by |
|---|---|
| `adaptive_scheduler` | `/api/ais/cron` → `syncAllEnabledAisVessels` → due vessel (`refreshIfStale`) |
| `retry` | same cron path when `consecutive_fetch_failures > 0` before the fetch |
| `manual_admin` | admin using manager Sync (`/api/ais/sync`), `/api/ais/vessels/[id]?force=1`, or `/api/ais/preview` |
| `manual_user` | same routes by non-admins; `/api/ais/crew-preview` |
| `premium_enabled` | `/api/ais/crew-tracking` initial refresh when crew enables Premium tracking |
| `initial_tracking_start` | `/api/vessels/ais-tracking` PATCH turning tracking on |
| `history_import` | `/api/ais/history/preview`, `/api/passages-map/tracks` (`/vessel_history`) |
| `vessel_lookup` | `/api/ais/vessel-lookup` (`/vessel_info`, `/vessel_find`) |
| `entitlement_refresh`, `state_change` | reserved — no code path fetches on these today (entitlement refresh never calls the provider) |
| `unknown` | unattributable (including legacy `vessel-sync:manual`, which was shared by manual Sync and tracking start) |

`history_import`, `vessel_lookup` and `manual_user` extend the originally proposed list so
requests are never mislabelled as admin/scheduler.

### `scheduled_reason`

Kept separate from the trigger. For scheduler fetches it is re-derived from the stored
`vessel_ais_status` at the time the schedule was written (`underway_fast`, `transition_fast`,
`anchor_normal`, `moored_slow`, `yard_slow`, `unknown_fast`, `failure_retry_{n}`), because
`vessel_ais_status` does not persist the reason. Other values: `forced_refresh` (manual/forced
paths), `initial_due` (no status row), `never_scheduled` (NULL `next_ais_check_at`),
`missing_identity`. Direct routes leave it NULL.

## Indexes

Partial on provider rows so cached-read volume never bloats them:

- `ais_fetch_log_api_requested_idx (requested_at DESC) WHERE cached_or_api='api'`
- `ais_fetch_log_api_vessel_requested_idx (vessel_id, requested_at DESC) WHERE api`
- `ais_fetch_log_api_failed_requested_idx (requested_at DESC) WHERE api AND success=false`
- `ais_fetch_log_api_trigger_requested_idx (trigger_source, requested_at DESC) WHERE api`
- `ais_fetch_log_mmsi_requested_idx (mmsi, requested_at DESC) WHERE mmsi IS NOT NULL`
- `vessel_ais_status_failures_idx (consecutive_fetch_failures) WHERE > 0`

## Admin API (all `requireAdmin` — Bearer JWT or cookie → `users.role = 'admin'`)

| Endpoint | Returns |
|---|---|
| `GET /api/admin/ais-monitor/summary` | today / 1h / 24h / month stats, scheduler health, alerts, savings, trigger breakdown, health status |
| `GET /api/admin/ais-monitor/timeseries?range=24h\|7d\|30d&vesselId=` | gap-filled hourly (24h) or daily buckets |
| `GET /api/admin/ais-monitor/vessels?range=` | top consumers, attention list, possible duplicates |
| `GET /api/admin/ais-monitor/vessels/[vesselId]?range=` | vessel identity, polling flags, scheduler state, stats, history |
| `GET /api/admin/ais-monitor/fetches?page&pageSize&filter&from&to&vesselId&vessel&mmsi` | paginated log (max 100/page, max 90-day window, default 7 days) |
| `GET /api/admin/ais-monitor/fetches/[fetchId]` | one request + matching `ais_observations` row (state, speed, heading, course, position) |

Aggregation runs in Postgres RPCs (`admin_ais_monitor_*`), executable only by
`service_role` (revoked from `PUBLIC`, `anon`, `authenticated`). No RLS policy was changed.
Vessel names come from `vessels_public_identity`; the only private vessel fields read are
`ais_provider_poll_enabled` / `ais_tracking_enabled`. Responses are `Cache-Control: no-store`.

The dashboard page performs a client-side role check for UX only; the APIs are protected
independently (the page cannot be server-gated because the Supabase session lives in
localStorage).

## Metric definitions

- **Provider request**: `cached_or_api='api' AND provider_called IS DISTINCT FROM false`.
- **Today / month**: UTC calendar boundaries.
- **Eligible**: vessels with MMSI or IMO and (`ais_tracking_enabled` or `ais_provider_poll_enabled`).
  **Enabled**: `ais_provider_poll_enabled` (what the cron polls).
- **Due**: enabled vessel with `next_ais_check_at` NULL or ≤ now. **Overdue**: > 15 min past.
  **Far overdue**: > 60 min past.
- **Rapid refetch**: > 15 live-position requests in 60 min (fastest adaptive interval is 5 min = 12/h).
- **Last scheduler run**: approximated as the latest logged `adaptive_scheduler`/`retry` request
  (there is no cron-run table).
- **Duplicates**: same vessel `/vessel` request within 60 s (history chunks excluded).
  Marked *likely legitimate* when either request was manual / tracking start / Premium enable,
  or the previous request failed. Observational only — nothing is changed.
- **Cost**: not shown. Datalastic does not return per-request credits and there is no
  configured pricing source; no prices are hardcoded.

### Alerts (`computeAisMonitorAlerts`)

| Alert | Condition | Severity |
|---|---|---|
| `consecutive_failures` | ≥1 enabled vessel with ≥5 consecutive failures | warning |
| `rate_limited` | any HTTP 429 in 1h (critical) / 24h (warning) | critical/warning |
| `auth_failed` | any 401/403 in 24h | critical |
| `high_failure_rate` | > 10% failed (1h with ≥10 req, else 24h with ≥20 req); > 50% critical | warning/critical |
| `no_recent_success` | vessels enabled and no success for > 90 min (1.5 × slowest interval) | critical |
| `scheduler_stalled` | vessels due and no scheduler request for > 30 min | critical |
| `far_overdue` | ≥1 vessel > 60 min past next check | warning |

Each alert has a stable `dedupeKey` so a notifier (email/push/Slack) can be added later by
consuming the same list — no notifications are sent today.

### Adaptive scheduling savings (estimate)

`fixed = tracked_vessel_days × 288`, `avoided = max(0, fixed − actual)`, over the last 30 days.
`tracked_vessel_days` is approximated from (vessel, UTC day) pairs with at least one
live-position request, pro-rated for partial days — there is no entitlement history table,
so the figure is always labelled an estimate.

## Refresh

Summary, chart, vessels and page 1 of the log poll every 30 s while the tab is visible.
Later log pages do not auto-refresh (stable paging). Refreshing only queries the database.

## Retention (not implemented — no data is deleted)

Recommended future strategy:

1. Keep detailed `ais_fetch_log` rows for **90 days** (the monitor’s maximum log window).
2. Before deleting, roll up into a `ais_fetch_log_daily` aggregate
   (day, vessel_id, trigger_source, endpoint, total, succeeded, failed, 429s, 401/403s,
   avg/p95 response ms) kept indefinitely; point month/savings queries at it for older ranges.
3. Run as a scheduled SQL job (pg_cron) in small batches by `requested_at`.
4. If cached-read rows are ever enabled, keep them for a much shorter period (e.g. 7 days) or
   aggregate only.

## Files

- `sql/add-ais-fetch-log-monitoring.sql`
- `src/lib/ais/fetch-audit-shared.ts` — types (`AisTriggerSource`, `AisFetchResult`, `AisProviderRequestMeta`, `AisRequestAuditContext`), normalisation, sanitisation
- `src/lib/ais/fetch-audit.ts` — server writer `recordAisProviderRequest`
- `src/lib/ais/monitor/{types,metrics,queries,http}.ts`, `ais-monitor.selftest.ts`
- `src/app/api/admin/ais-monitor/**`
- `src/components/admin/ais-monitor/*`
- `src/app/dashboard/ais-monitor/**`, `src/app/admin/ais-monitor/**`
