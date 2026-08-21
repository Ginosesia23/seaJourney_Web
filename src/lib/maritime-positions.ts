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
