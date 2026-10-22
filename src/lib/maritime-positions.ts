/** Shared maritime job-title options for invite, signup, and career history. */
export const MARITIME_POSITION_OPTIONS = [
  // Deck Department - Senior
  'Captain / Master',
  'Chief Officer',
  'First Officer',
  'First Mate',
  'Second Officer',
  'Third Officer',
  'Officer of the Watch (OOW)',
  'Deck Officer',
  'Bosun',
  // Deck Department - Deckhands
  'Lead Deckhand',
  'Senior Deckhand',
  'Deckhand',
  'Junior Deckhand',
  'Able Seaman (AB)',
  'Quartermaster',
  // Deck Department - Cadets
  'Deck Cadet',
  'Cadet',
  // Engine Department - Senior
  'Chief Engineer',
  'First Engineer',
  'Second Engineer',
  'Third Engineer',
  'Fourth Engineer',
  'Engineer',
  'Electrician',
  // Engine Department - Junior
  'Motorman / Oiler',
  'Wiper',
  'Engine Cadet',
  // Interior/Service - Management
  'Purser',
  'Chief Purser',
  // Interior/Service - Galley
  'Head Chef',
  'Chef / Cook',
  'Sous Chef',
  'Galley Assistant',
  // Interior/Service - Housekeeping
  'Head Housekeeper',
  'Chief Steward / Stewardess',
  '2nd Steward / Stewardess',
  'Steward / Stewardess',
  'Laundry Attendant',
  'Interior Crew',
  // Other Specialized Roles
  'Medical Officer',
  'Security Officer',
  'Radio Officer',
  'Safety Officer',
  'Environmental Officer',
  'Masseuse / Masseur',
  'Spa Therapist',
  'Other',
] as const;

export type MaritimePosition = (typeof MARITIME_POSITION_OPTIONS)[number];

export function isMaritimePosition(value: unknown): value is MaritimePosition {
  return typeof value === 'string' && (MARITIME_POSITION_OPTIONS as readonly string[]).includes(value);
}

/**
 * Yacht MCA/PYA: officers count at-anchor as sea service.
 * Deckhands / ratings count at-anchor as standby only when the standby rule applies.
 * Cadets, bosun, and quartermaster are ratings, not officers.
 */
export function countsAtAnchorAsSeaService(args: {
  position?: string | null;
  role?: string | null;
  isVesselAccount?: boolean;
}): boolean {
  if (args.isVesselAccount) return true;
  const role = (args.role || '').toLowerCase();
  if (role === 'vessel' || role === 'captain' || role === 'admin') return true;
  return isOfficerPosition(args.position);
}

export function isOfficerPosition(position: string | null | undefined): boolean {
  const p = (position || '').trim().toLowerCase();
  if (!p) return false;
  if (p.includes('cadet') || p.includes('bosun') || p.includes('quartermaster')) {
    return false;
  }
  const officerKeywords = [
    'captain',
    'chief officer',
    'first officer',
    'first mate',
    'second officer',
    'third officer',
    'officer of the watch',
    'oow',
    'deck officer',
    'chief engineer',
    'first engineer',
    'second engineer',
    'third engineer',
    'fourth engineer',
  ];
  if (officerKeywords.some((kw) => p.includes(kw))) return true;
  if (p.includes('officer')) return true;
  if (p.includes('captain')) return true;
  if (p === 'engineer' || /(^|\s)engineer$/.test(p)) return true;
  if (/\bmate\b/.test(p)) return true;
  // "Captain / Master" — not Quartermaster (excluded above).
  if (/(^|[\s/])master(\b|$)/.test(p)) return true;
  return false;
}

export function maritimePositionsByRank(): {
  officers: MaritimePosition[];
  ratings: MaritimePosition[];
} {
  const officers: MaritimePosition[] = [];
  const ratings: MaritimePosition[] = [];
  for (const option of MARITIME_POSITION_OPTIONS) {
    if (isOfficerPosition(option)) officers.push(option);
    else ratings.push(option);
  }
  return { officers, ratings };
}
