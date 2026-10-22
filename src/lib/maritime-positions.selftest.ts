/**
 * Self-test: officer vs rating classification for yacht sea-time rules.
 * Run: npx tsx src/lib/maritime-positions.selftest.ts
 */

import {
  countsAtAnchorAsSeaService,
  isOfficerPosition,
  maritimePositionsByRank,
} from './maritime-positions';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(isOfficerPosition('Chief Officer') === true, 'Chief Officer is officer');
assert(isOfficerPosition('Officer of the Watch (OOW)') === true, 'OOW is officer');
assert(isOfficerPosition('Captain / Master') === true, 'Captain / Master is officer');
assert(isOfficerPosition('First Mate') === true, 'First Mate is officer');
assert(isOfficerPosition('Chief Engineer') === true, 'Chief Engineer is officer');
assert(isOfficerPosition('Medical Officer') === true, 'Medical Officer is officer');
assert(isOfficerPosition('Deckhand') === false, 'Deckhand is rating');
assert(isOfficerPosition('Lead Deckhand') === false, 'Lead Deckhand is rating');
assert(isOfficerPosition('Bosun') === false, 'Bosun is rating');
assert(isOfficerPosition('Quartermaster') === false, 'Quartermaster is rating');
assert(isOfficerPosition('Deck Cadet') === false, 'Deck Cadet is rating');
assert(isOfficerPosition('Steward / Stewardess') === false, 'Steward is rating');
assert(isOfficerPosition('') === false, 'empty is not officer');

const { officers, ratings } = maritimePositionsByRank();
assert(officers.includes('Chief Officer'), 'grouped officers include Chief Officer');
assert(ratings.includes('Deckhand'), 'grouped ratings include Deckhand');
assert(!officers.includes('Deckhand'), 'Deckhand is not in officers group');
assert(!ratings.includes('Captain / Master'), 'Captain is not in ratings group');

assert(countsAtAnchorAsSeaService({ isVesselAccount: true }) === true, 'vessel account at-anchor is sea');
assert(countsAtAnchorAsSeaService({ position: 'Chief Officer' }) === true, 'officer at-anchor is sea');
assert(countsAtAnchorAsSeaService({ position: 'Deckhand' }) === false, 'deckhand at-anchor is not sea');
assert(countsAtAnchorAsSeaService({ role: 'captain' }) === true, 'captain role at-anchor is sea');

console.log('maritime-positions.selftest: ok');
