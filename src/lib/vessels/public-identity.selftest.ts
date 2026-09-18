/**
 * Public vessel identity projection self-test.
 * Run: npx tsx src/lib/vessels/public-identity.selftest.ts
 */

import {
  assertNoPrivateVesselLeak,
  toPublicVesselIdentity,
  vesselsCatalogTableForRole,
  VESSEL_PRIVATE_FIELD_KEYS,
  VESSEL_PUBLIC_IDENTITY_SELECT,
} from './public-identity';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const pub = toPublicVesselIdentity({
  id: 'v1',
  name: 'Example',
  type: 'Motor Yacht',
  mmsi: '123456789',
  imo: '9876543',
  flag: 'GB',
  call_sign: 'ABCD',
  length_m: 50,
  beam: 9,
  gross_tonnage: 400,
  build_year: 2018,
  is_official: true,
  stamp: 'SECRET_STAMP',
  vessel_manager_id: 'mgr-1',
  management_company: 'Secret Co',
  ais_provider_poll_enabled: true,
});

assert(pub.id === 'v1', 'id');
assert(pub.name === 'Example', 'name');
assert(!('stamp' in pub), 'stamp stripped');
assert(!('vessel_manager_id' in pub), 'manager stripped');
assert(assertNoPrivateVesselLeak(pub as unknown as Record<string, unknown>).length === 0, 'no leak');

const leaky = {
  ...pub,
  stamp: 'x',
  vessel_manager_id: 'y',
} as unknown as Record<string, unknown>;
assert(assertNoPrivateVesselLeak(leaky).includes('stamp'), 'detect stamp');
assert(assertNoPrivateVesselLeak(leaky).includes('vessel_manager_id'), 'detect manager');

assert(vesselsCatalogTableForRole('crew') === 'vessels_public_identity', 'crew catalog');
assert(vesselsCatalogTableForRole('captain') === 'vessels_public_identity', 'captain catalog');
assert(vesselsCatalogTableForRole('vessel') === 'vessels', 'manager catalog');
assert(vesselsCatalogTableForRole('admin') === 'vessels', 'admin catalog');

for (const key of VESSEL_PRIVATE_FIELD_KEYS) {
  assert(!VESSEL_PUBLIC_IDENTITY_SELECT.includes(key), `select excludes ${key}`);
}

assert(VESSEL_PUBLIC_IDENTITY_SELECT.includes('id'), 'select has id');
assert(VESSEL_PUBLIC_IDENTITY_SELECT.includes('mmsi'), 'select has mmsi');
assert(VESSEL_PUBLIC_IDENTITY_SELECT.includes('imo'), 'select has imo');

console.log('public-identity.selftest: all scenarios passed');
