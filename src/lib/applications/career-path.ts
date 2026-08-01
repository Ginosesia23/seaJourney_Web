/**
 * Career path helpers for Apply: map crew `users.position` → track + level,
 * and decide which published applications are the natural "next ticket".
 */

export type CareerTrack = 'deck' | 'engine' | 'interior' | 'galley' | 'any';

/** Ordered progression within a track. Higher index = more senior. */
export type CareerLevel =
  | 'entry'
  | 'deckhand'
  | 'rating'
  | 'watch_rating'
  | 'oow'
  | 'chief_mate'
  | 'master'
  | 'engine_entry'
  | 'engine_rating'
  | 'engine_officer'
  | 'chief_engineer'
  | 'interior_entry'
  | 'interior_senior'
  | 'galley_entry'
  | 'galley_senior'
  | 'other';

export type CareerStep = {
  track: CareerTrack;
  level: CareerLevel;
  label: string;
  /** Short name of the typical next ticket / role step */
  nextLevel: CareerLevel | null;
  nextLabel: string | null;
  /** Human summary for Apply UI */
  summary: string;
};

const DECK_ORDER: CareerLevel[] = [
  'entry',
  'deckhand',
  'watch_rating',
  'oow',
  'chief_mate',
  'master',
];

const ENGINE_ORDER: CareerLevel[] = [
  'engine_entry',
  'engine_rating',
  'engine_officer',
  'chief_engineer',
];

const INTERIOR_ORDER: CareerLevel[] = ['interior_entry', 'interior_senior'];
const GALLEY_ORDER: CareerLevel[] = ['galley_entry', 'galley_senior'];

export const CAREER_LEVEL_LABELS: Record<CareerLevel, string> = {
  entry: 'Entry / Cadet',
  deckhand: 'Deckhand',
  rating: 'Senior deck / Bosun',
  watch_rating: 'Watch Rating',
  oow: 'Officer of the Watch (OOW)',
  chief_mate: 'Chief Mate',
  master: 'Master / Captain',
  engine_entry: 'Engine entry',
  engine_rating: 'Engine rating',
  engine_officer: 'Engineer officer',
  chief_engineer: 'Chief Engineer',
  interior_entry: 'Interior crew',
  interior_senior: 'Senior interior / Purser',
  galley_entry: 'Galley',
  galley_senior: 'Head Chef',
  other: 'Other / general',
};

export const CAREER_TRACK_LABELS: Record<CareerTrack, string> = {
  deck: 'Deck',
  engine: 'Engine',
  interior: 'Interior',
  galley: 'Galley',
  any: 'Any track',
};

/** Levels admins can target when creating an application (tickets / milestones). */
export const TARGETABLE_LEVELS: Array<{
  track: CareerTrack;
  level: CareerLevel;
  label: string;
  hint: string;
}> = [
  {
    track: 'deck',
    level: 'watch_rating',
    label: 'Watch Rating (deck)',
    hint: 'Typical next step after deckhand / AB experience',
  },
  {
    track: 'deck',
    level: 'oow',
    label: 'Officer of the Watch (OOW)',
    hint: 'After Watch Rating / sea time as rating',
  },
  {
    track: 'deck',
    level: 'chief_mate',
    label: 'Chief Mate',
    hint: 'After OOW sea service',
  },
  {
    track: 'deck',
    level: 'master',
    label: 'Master / Captain',
    hint: 'After Chief Mate',
  },
  {
    track: 'engine',
    level: 'engine_rating',
    label: 'Engine Watch Rating',
    hint: 'Engine department rating path',
  },
  {
    track: 'engine',
    level: 'engine_officer',
    label: 'Engineer officer',
    hint: 'Engineering officer CoC path',
  },
  {
    track: 'engine',
    level: 'chief_engineer',
    label: 'Chief Engineer',
    hint: 'Senior engineering ticket',
  },
  {
    track: 'any',
    level: 'other',
    label: 'General (all roles)',
    hint: 'Shown to everyone — not tied to a next ticket',
  },
];

function norm(position: string): string {
  return position.trim().toLowerCase();
}

function orderFor(track: CareerTrack): CareerLevel[] {
  switch (track) {
    case 'deck':
      return DECK_ORDER;
    case 'engine':
      return ENGINE_ORDER;
    case 'interior':
      return INTERIOR_ORDER;
    case 'galley':
      return GALLEY_ORDER;
    default:
      return [];
  }
}

function nextInOrder(
  track: CareerTrack,
  level: CareerLevel,
): { nextLevel: CareerLevel | null; nextLabel: string | null } {
  const order = orderFor(track);
  const idx = order.indexOf(level);
  if (idx < 0 || idx >= order.length - 1) {
    return { nextLevel: null, nextLabel: null };
  }
  const nextLevel = order[idx + 1];
  return { nextLevel, nextLabel: CAREER_LEVEL_LABELS[nextLevel] };
}

/**
 * Resolve a free-text profile position into a career step.
 */
export function resolveCareerStep(position: string | null | undefined): CareerStep {
  if (!position || !position.trim()) {
    return {
      track: 'any',
      level: 'other',
      label: 'Position not set',
      nextLevel: 'watch_rating',
      nextLabel: CAREER_LEVEL_LABELS.watch_rating,
      summary:
        'Add your current position in Profile so we can recommend your next ticket.',
    };
  }

  const p = norm(position);

  // ---- Deck (check senior first) ----
  if (
    p.includes('captain') ||
    p === 'master' ||
    p.startsWith('master ') ||
    p.includes('master (')
  ) {
    return step('deck', 'master', position, 'You are at Master level — keep packages for renewals or endorsements.');
  }
  if (
    p.includes('chief officer') ||
    p.includes('first officer') ||
    p.includes('first mate') ||
    p.includes('chief mate')
  ) {
    return step('deck', 'chief_mate', position);
  }
  if (
    p.includes('officer of the watch') ||
    p.includes('(oow)') ||
    p === 'oow' ||
    p.includes(' deck officer') ||
    p === 'deck officer' ||
    p.includes('second officer') ||
    p.includes('third officer')
  ) {
    return step('deck', 'oow', position);
  }
  if (p.includes('bosun') || p.includes('boatswain')) {
    // Bosun typically sits at experienced deckhand level; next ticket is Watch Rating / OOW path
    return step('deck', 'deckhand', position);
  }
  if (
    p.includes('lead deckhand') ||
    p.includes('senior deckhand') ||
    p.includes('able seaman') ||
    p === 'ab' ||
    p.includes('(ab)') ||
    p.includes('quartermaster')
  ) {
    return step('deck', 'deckhand', position);
  }
  if (p.includes('deckhand')) {
    return step('deck', 'deckhand', position);
  }
  if (p.includes('deck cadet') || p === 'cadet' || p.includes('junior deckhand')) {
    return step('deck', 'entry', position);
  }

  // ---- Engine ----
  if (p.includes('chief engineer')) {
    return step('engine', 'chief_engineer', position, 'You are at Chief Engineer level.');
  }
  if (
    p.includes('first engineer') ||
    p.includes('second engineer') ||
    p.includes('third engineer') ||
    p.includes('fourth engineer') ||
    p === 'engineer' ||
    p.includes('electrician')
  ) {
    return step('engine', 'engine_officer', position);
  }
  if (p.includes('motorman') || p.includes('oiler')) {
    return step('engine', 'engine_rating', position);
  }
  if (p.includes('wiper') || p.includes('engine cadet')) {
    return step('engine', 'engine_entry', position);
  }

  // ---- Interior ----
  if (
    p.includes('purser') ||
    p.includes('chief steward') ||
    p.includes('head housekeeper') ||
    p.includes('2nd steward')
  ) {
    return step('interior', 'interior_senior', position, 'Senior interior path — general packages may still apply.');
  }
  if (
    p.includes('steward') ||
    p.includes('interior') ||
    p.includes('laundry') ||
    p.includes('masseuse') ||
    p.includes('spa')
  ) {
    return step('interior', 'interior_entry', position);
  }

  // ---- Galley ----
  if (p.includes('head chef') || p.includes('sous chef') || p === 'chef / cook' || p.includes('chef')) {
    return step('galley', 'galley_senior', position, 'Culinary path — use general packages where relevant.');
  }
  if (p.includes('galley')) {
    return step('galley', 'galley_entry', position);
  }

  return {
    track: 'any',
    level: 'other',
    label: position,
    nextLevel: null,
    nextLabel: null,
    summary: `We do not have a ticket ladder for “${position}” yet — browse all published applications below.`,
  };
}

function step(
  track: CareerTrack,
  level: CareerLevel,
  position: string,
  customSummary?: string,
): CareerStep {
  const { nextLevel, nextLabel } = nextInOrder(track, level);
  const summary =
    customSummary ||
    (nextLabel
      ? `As a ${position}, your typical next step is ${nextLabel}.`
      : `As a ${position}, you are at the top of the ${CAREER_TRACK_LABELS[track].toLowerCase()} ladder we track.`);
  return {
    track,
    level,
    label: position,
    nextLevel,
    nextLabel,
    summary,
  };
}

export type TemplateCareerFields = {
  career_track?: string | null;
  target_level?: string | null;
};

/**
 * Whether a published template is the recommended "next ticket" for this crew step.
 */
export function isRecommendedNextTemplate(
  template: TemplateCareerFields,
  career: CareerStep,
): boolean {
  if (!career.nextLevel) return false;
  const track = (template.career_track || 'any') as CareerTrack;
  const target = (template.target_level || '') as CareerLevel;
  if (!target || target === 'other') return false;
  if (track !== 'any' && track !== career.track) return false;
  return target === career.nextLevel;
}

/**
 * Soft relevance: same track (or any) and target at or above current level.
 */
export function isRelevantTemplate(
  template: TemplateCareerFields,
  career: CareerStep,
): boolean {
  if (isRecommendedNextTemplate(template, career)) return true;
  const track = (template.career_track || 'any') as CareerTrack;
  if (track !== 'any' && career.track !== 'any' && track !== career.track) {
    return false;
  }
  // General packages are always relevant
  if (!template.target_level || template.target_level === 'other') return true;
  return track === 'any' || track === career.track;
}

export function sortTemplatesForCareer<T extends TemplateCareerFields>(
  templates: T[],
  career: CareerStep,
): T[] {
  return [...templates].sort((a, b) => {
    const aRec = isRecommendedNextTemplate(a, career) ? 0 : 1;
    const bRec = isRecommendedNextTemplate(b, career) ? 0 : 1;
    if (aRec !== bRec) return aRec - bRec;
    const aRel = isRelevantTemplate(a, career) ? 0 : 1;
    const bRel = isRelevantTemplate(b, career) ? 0 : 1;
    return aRel - bRel;
  });
}
