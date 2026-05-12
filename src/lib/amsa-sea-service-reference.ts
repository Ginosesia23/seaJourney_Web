/**
 * AMSA “Sea service reference data” codes (Form 771 reference section).
 * (1) Mode — exactly one; (2)(3)(4) — multiple codes allowed.
 */

export const AMSA_MODE_OF_OPERATION = ['VU', 'NUD', 'NUE'] as const;
export type AmsaModeOfOperation = (typeof AMSA_MODE_OF_OPERATION)[number];

export const AMSA_TYPE_OF_OPERATION = ['C', 'R', 'M'] as const;
export type AmsaTypeOfOperation = (typeof AMSA_TYPE_OF_OPERATION)[number];

export const AMSA_DUTIES_PERFORMED = [
  'AE',
  'E',
  'EW',
  'EIC',
  'AEIC',
  'D',
  'DE',
  'GPH',
  'INW',
  'C',
] as const;
export type AmsaDutyCode = (typeof AMSA_DUTIES_PERFORMED)[number];

export const AMSA_PROPULSION_TYPE = ['I', 'O', 'S'] as const;
export type AmsaPropulsionCode = (typeof AMSA_PROPULSION_TYPE)[number];

export interface AmsaSeaServiceReference {
  mode_of_operation: AmsaModeOfOperation;
  type_of_operation: AmsaTypeOfOperation[];
  duties_performed: AmsaDutyCode[];
  propulsion_type: AmsaPropulsionCode[];
}

export const AMSA_MODE_LABELS: Record<AmsaModeOfOperation, string> = {
  VU: 'Vessel Underway',
  NUD: 'Not underway deck or refit work',
  NUE: 'Not underway engine or refit work',
};

export const AMSA_TYPE_LABELS: Record<AmsaTypeOfOperation, string> = {
  C: 'Commercial',
  R: 'Recreational',
  M: 'Military',
};

export const AMSA_DUTY_LABELS: Record<AmsaDutyCode, string> = {
  AE: 'Assistant to Engineer or Engine Driver',
  E: 'Engineer or Engine Driver',
  EW: 'Engineer watchkeeper',
  EIC: 'Engineer in charge',
  AEIC: 'Assistant to engineer in charge',
  D: 'Deck work',
  DE: 'Deck and engineering',
  GPH: 'General purpose hand',
  INW: 'In charge of navigation watch/officer of watch',
  C: 'Coxswain Grade 1 or 2',
};

export const AMSA_PROPULSION_LABELS: Record<AmsaPropulsionCode, string> = {
  I: 'Inboard',
  O: 'Outboard',
  S: 'Steam',
};

export function defaultAmsaSeaServiceReference(): AmsaSeaServiceReference {
  return {
    mode_of_operation: 'VU',
    type_of_operation: [],
    duties_performed: [],
    propulsion_type: [],
  };
}

/** Parse JSON from DB (snake_case or camelCase). Handles JSON string from some clients. */
export function parseAmsaReferenceFromDb(raw: unknown): AmsaSeaServiceReference | null {
  if (raw == null) return null;
  let o: Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return null;
      o = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof raw === 'object') {
    o = raw as Record<string, unknown>;
  } else {
    return null;
  }

  const modeRaw = o.mode_of_operation ?? o.modeOfOperation;
  const mode = typeof modeRaw === 'string' ? modeRaw.trim() : modeRaw;
  if (mode !== 'VU' && mode !== 'NUD' && mode !== 'NUE') return null;
  const types = (o.type_of_operation ?? o.typeOfOperation) as unknown;
  const duties = (o.duties_performed ?? o.dutiesPerformed) as unknown;
  const prop = (o.propulsion_type ?? o.propulsionType) as unknown;
  return {
    mode_of_operation: mode as AmsaSeaServiceReference['mode_of_operation'],
    type_of_operation: Array.isArray(types)
      ? types.filter((t): t is AmsaTypeOfOperation =>
          AMSA_TYPE_OF_OPERATION.includes(t as AmsaTypeOfOperation),
        )
      : [],
    duties_performed: Array.isArray(duties)
      ? duties.filter((d): d is AmsaDutyCode =>
          AMSA_DUTIES_PERFORMED.includes(d as AmsaDutyCode),
        )
      : [],
    propulsion_type: Array.isArray(prop)
      ? prop.filter((p): p is AmsaPropulsionCode =>
          AMSA_PROPULSION_TYPE.includes(p as AmsaPropulsionCode),
        )
      : [],
  };
}

/** Values for each AMSA 771 sea-service reference box (compact codes; use separate PDF coords per box). */
export function formatAmsaReferencePartsForPdf(ref: AmsaSeaServiceReference | null | undefined): {
  modeOfOperation: string;
  typeOfOperation: string;
  dutiesPerformed: string;
  propulsion: string;
} | null {
  if (!ref?.mode_of_operation) return null;
  return {
    modeOfOperation: ref.mode_of_operation,
    typeOfOperation: ref.type_of_operation?.length ? ref.type_of_operation.join(', ') : '—',
    dutiesPerformed: ref.duties_performed?.length ? ref.duties_performed.join(', ') : '—',
    propulsion: ref.propulsion_type?.length ? ref.propulsion_type.join(', ') : '—',
  };
}

/** Single line (legacy / previews) — (1) mode (2) type (3) duties (4) propulsion. */
export function formatAmsaReferenceForPdf(ref: AmsaSeaServiceReference | null | undefined): string {
  const parts = formatAmsaReferencePartsForPdf(ref);
  if (!parts) return '';
  return `(1) ${parts.modeOfOperation}  (2) ${parts.typeOfOperation}  (3) ${parts.dutiesPerformed}  (4) ${parts.propulsion}`;
}
