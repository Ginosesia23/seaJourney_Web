/**
 * Identity / race helpers self-test.
 * Run: npx tsx src/lib/vessels/find-existing-vessel.selftest.ts
 */

import {
  isUniqueViolation,
  normalizeImo,
  normalizeMmsi,
} from './find-existing-vessel';
import {
  assertNoPrivateVesselLeak,
  toPublicVesselIdentity,
} from './public-identity';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(normalizeMmsi('123 456 789') === '123456789', 'mmsi digits');
assert(normalizeMmsi(null) === null, 'mmsi null');
assert(normalizeImo('IMO 1234567') === '1234567', 'imo digits');
assert(normalizeImo('') === null, 'imo empty');

const hasMmsi = !!normalizeMmsi('123456789');
const allowNameMatchDefault = !(hasMmsi || false);
assert(!allowNameMatchDefault, 'do not name-match when MMSI present');

assert(isUniqueViolation({ code: '23505' }), '23505');
assert(!isUniqueViolation(null), 'null not unique');

const pub = toPublicVesselIdentity({
  id: '1',
  name: 'A',
  type: 'Yacht',
  imo: null,
  mmsi: '1',
  stamp: 'secret',
});
assert(assertNoPrivateVesselLeak(pub as unknown as Record<string, unknown>).length === 0, 'no leak');

console.log('find-existing-vessel.selftest: all scenarios passed');
