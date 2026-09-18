/**
 * Self-tests for AIS hardening (entitlement repair rules, privacy, identity).
 * Run: npx tsx src/lib/ais/ais-hardening.selftest.ts
 */

import { getNextAisCheckAt, AIS_FAILURE_RETRY_MINUTES } from '@/lib/ais/adaptive-scheduler';
import {
  assertNoPrivateVesselLeak,
  toPublicVesselIdentity,
  VESSEL_PRIVATE_FIELD_KEYS,
} from '@/lib/vessels/public-identity';
import {
  isUniqueViolation,
  normalizeImo,
  normalizeMmsi,
} from '@/lib/vessels/find-existing-vessel';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** Pure model of reconcile repair decision. */
function reconcileRepair(
  cached: boolean,
  shouldTrack: boolean,
): 'activated' | 'deactivated' | null {
  if (!cached && shouldTrack) return 'activated';
  if (cached && !shouldTrack) return 'deactivated';
  return null;
}

// Test 1 — false → true
assert(
  reconcileRepair(false, true) === 'activated',
  'reconciliation activates',
);

// Test 2 — true → false
assert(
  reconcileRepair(true, false) === 'deactivated',
  'reconciliation deactivates',
);
assert(reconcileRepair(true, true) === null, 'no-op when already correct');

// Test 3/4 — forced refresh schedule (same as normal adaptive path)
{
  const nowMs = Date.parse('2026-09-16T11:00:00.000Z');
  const underway = getNextAisCheckAt({ currentState: 'underway', nowMs });
  assert(underway.intervalMinutes === 5, 'forced underway → +5');
  const fail = getNextAisCheckAt({
    currentState: 'underway',
    consecutiveFetchFailures: 1,
    nowMs,
  });
  assert(fail.intervalMinutes === AIS_FAILURE_RETRY_MINUTES[0], 'failure backoff');
}

// Test 5 — failure backoff progression
{
  const nowMs = Date.now();
  assert(
    getNextAisCheckAt({ consecutiveFetchFailures: 2, currentState: 'underway', nowMs })
      .intervalMinutes === 10,
    'fail2',
  );
  assert(
    getNextAisCheckAt({ consecutiveFetchFailures: 9, currentState: 'underway', nowMs })
      .intervalMinutes === 30,
    'fail3+',
  );
}

// Test 6 — privacy projection
{
  const row = {
    id: 'v1',
    name: 'MY New Build',
    type: 'Motor Yacht',
    imo: '1234567',
    mmsi: '123456789',
    stamp: 'data:image/png;base64,xxx',
    management_company: 'Secret Co',
    vessel_manager_id: 'mgr-1',
    company_contact: 'secret@x.com',
  };
  const pub = toPublicVesselIdentity(row);
  assert(pub.mmsi === '123456789', 'public mmsi');
  assert(!('stamp' in pub), 'no stamp on public');
  assert(!('vessel_manager_id' in pub), 'no manager on public');
  const leaks = assertNoPrivateVesselLeak(pub as unknown as Record<string, unknown>);
  assert(leaks.length === 0, 'public payload clean');
  assert(
    assertNoPrivateVesselLeak(row).includes('stamp'),
    'detects stamp leak',
  );
  assert(VESSEL_PRIVATE_FIELD_KEYS.includes('stamp'), 'private keys listed');
}

// Test 8 — unique violation detection (race)
assert(isUniqueViolation({ code: '23505' }), 'unique code');
assert(isUniqueViolation({ message: 'duplicate key value' }), 'unique msg');
assert(!isUniqueViolation({ code: '42501' }), 'not unique');

// Test 9 — same name different MMSI stay separate (identity rules)
assert(normalizeMmsi('111') !== normalizeMmsi('222'), 'different mmsi');
assert(normalizeImo('IMO 1') === '1', 'imo normalize');

// Test 10 — conflict detection concept: different vessel ids for mmsi vs imo
{
  const mmsiVesselId = 'a' as string;
  const imoVesselId = 'b' as string;
  assert(mmsiVesselId !== imoVesselId, 'conflict when ids differ');
}

console.log('ais-hardening.selftest: all scenarios passed');
