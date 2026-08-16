export type CustomDocumentInclude = {
  crewIdentity: boolean;
  vesselParticulars: boolean;
  seaTime: boolean;
  standbyPeriods: boolean;
  assignment: boolean;
};

export type CustomDocumentPurposeId =
  | 'employment'
  | 'service_letter'
  | 'character'
  | 'visa'
  | 'insurance'
  | 'application'
  | 'other';

export type CustomDocumentFacts = {
  crew: {
    name: string;
    position: string | null;
    email: string | null;
    nationality: string | null;
    dischargeBookNumber: string | null;
    dateOfBirth: string | null;
  };
  vessel: {
    name: string;
    type: string | null;
    imo: string | null;
    officialNumber: string | null;
    flag: string | null;
    grossTonnage: string | null;
    lengthM: string | null;
    callSign: string | null;
    managementCompany: string | null;
  };
  assignment: {
    startDate: string | null;
    endDate: string | null;
  };
  period: {
    startDate: string;
    endDate: string;
  } | null;
  seaTime: {
    totalDays: number;
    atSeaDays: number;
    underwayDays: number;
    standbyDays: number;
    yardDays: number;
    leaveDays: number;
    atAnchorDays: number;
    inPortDays: number;
    seaServiceDays: number;
    dataSourceLabel: string;
    standbyPeriods?: Array<{
      passageStartDate: string;
      passageEndDate: string;
      standbyDays: number;
    }>;
  } | null;
  generatedBy: {
    name: string;
    email: string | null;
    vesselRoleLabel: string;
  };
};

export type CustomDocumentRequest = {
  title: string;
  purpose: string;
  instructions: string;
  include: CustomDocumentInclude;
};

export type CustomDocumentSection = {
  heading: string;
  body: string;
  table?: { headers: string[]; rows: string[][] };
};

export type CustomDocumentComposeResult = {
  title: string;
  subtitle: string | null;
  recipientLine: string | null;
  intro: string;
  sections: CustomDocumentSection[];
  closing: string | null;
  purpose?: string;
};

export type CustomDocumentPreset = {
  value: CustomDocumentPurposeId;
  label: string;
  description: string;
  title: string;
  recipientLine: string | null;
  include: CustomDocumentInclude;
  brief: string;
};

const INCLUDE = {
  identityVesselAssignment: {
    crewIdentity: true,
    vesselParticulars: true,
    assignment: true,
    seaTime: false,
    standbyPeriods: false,
  },
  identityVesselOnly: {
    crewIdentity: true,
    vesselParticulars: true,
    assignment: false,
    seaTime: false,
    standbyPeriods: false,
  },
  withSeaTime: {
    crewIdentity: true,
    vesselParticulars: true,
    assignment: true,
    seaTime: true,
    standbyPeriods: false,
  },
} as const satisfies Record<string, CustomDocumentInclude>;

export const CUSTOM_DOCUMENT_PURPOSES: CustomDocumentPreset[] = [
  {
    value: 'employment',
    label: 'Confirmation of employment',
    description: 'Confirms rank, vessel, and employment dates. No sea-time totals.',
    title: 'Confirmation of Employment',
    recipientLine: 'To whom it may concern',
    include: INCLUDE.identityVesselAssignment,
    brief:
      'Write a confirmation of employment. State that the named person is (or was) employed aboard this vessel in the stated position for the assignment dates. Do not include sea-service day counts.',
  },
  {
    value: 'service_letter',
    label: 'Letter of service',
    description: 'Onboard service period and vessel particulars.',
    title: 'Letter of Service',
    recipientLine: 'To whom it may concern',
    include: INCLUDE.identityVesselAssignment,
    brief:
      'Write a letter of service confirming the crew member served aboard this vessel, their position, and the dates they were assigned. Do not include sea-service day counts unless they appear in the facts.',
  },
  {
    value: 'character',
    label: 'Character reference',
    description: 'Professional reference from the vessel. No sea-time totals.',
    title: 'Character Reference',
    recipientLine: 'To whom it may concern',
    include: INCLUDE.identityVesselAssignment,
    brief:
      'Write a professional character / employment reference. Confirm who they are, their position, the vessel, and the period served. Keep it factual. Do not invent personal anecdotes or sea-time figures.',
  },
  {
    value: 'visa',
    label: 'Visa / immigration',
    description: 'Identity, vessel, and employment dates for immigration.',
    title: 'Letter in Support of Visa Application',
    recipientLine: 'To whom it may concern',
    include: INCLUDE.identityVesselAssignment,
    brief:
      'Write a letter in support of a visa or immigration application. Include identity, nationality, vessel, position, and employment dates. Do not include sea-service day counts.',
  },
  {
    value: 'insurance',
    label: 'Insurance / P&I',
    description: 'Confirms the person is crew of this vessel.',
    title: 'Crew Membership Confirmation',
    recipientLine: 'To whom it may concern',
    include: INCLUDE.identityVesselOnly,
    brief:
      'Write a short confirmation that the named person is a crew member of this vessel, with position and vessel particulars. Assignment dates only if present. Do not include sea-service day counts.',
  },
  {
    value: 'application',
    label: 'Training / application covering letter',
    description: 'Covering letter with sea-time totals for a training body.',
    title: 'Covering Letter of Sea Service',
    recipientLine: 'To whom it may concern',
    include: INCLUDE.withSeaTime,
    brief:
      'Write a covering letter for a training or certification application. Include identity, vessel, assignment dates, and the sea-time totals from the facts. Do not invent figures.',
  },
  {
    value: 'other',
    label: 'Other letter',
    description: 'Identity and vessel only. Add a note if you need something extra.',
    title: 'Vessel Letter',
    recipientLine: 'To whom it may concern',
    include: INCLUDE.identityVesselAssignment,
    brief:
      'Write a short official letter using only the facts provided. Follow any extra note from the manager if present. Do not invent sea-time figures.',
  },
];

export function getCustomDocumentPreset(
  purpose: string,
): CustomDocumentPreset {
  return (
    CUSTOM_DOCUMENT_PURPOSES.find((p) => p.value === purpose) ??
    CUSTOM_DOCUMENT_PURPOSES[CUSTOM_DOCUMENT_PURPOSES.length - 1]!
  );
}

export function customDocumentNeedsSeaTime(include: CustomDocumentInclude): boolean {
  return include.seaTime || include.standbyPeriods;
}

function line(label: string, value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return `${label}: ${v}`;
}

function joinLines(lines: Array<string | null | undefined>): string {
  return lines.filter((l): l is string => Boolean(l && l.trim())).join('\n');
}

function servedPhrase(facts: CustomDocumentFacts): string {
  const rank = facts.crew.position ? ` as ${facts.crew.position}` : '';
  if (facts.assignment.startDate && facts.assignment.endDate) {
    return `served aboard ${facts.vessel.name}${rank} from ${facts.assignment.startDate} to ${facts.assignment.endDate}`;
  }
  if (facts.assignment.startDate) {
    return `has been serving aboard ${facts.vessel.name}${rank} since ${facts.assignment.startDate}`;
  }
  return `serves aboard ${facts.vessel.name}${rank}`;
}

function introForPurpose(
  purpose: string,
  facts: CustomDocumentFacts,
  extraNote: string,
): string {
  const name = facts.crew.name;
  const vessel = facts.vessel.name;
  const rank = facts.crew.position;
  const served = servedPhrase(facts);
  const extra = extraNote.trim() ? `\n\n${extraNote.trim()}` : '';

  switch (purpose) {
    case 'employment':
      return `This letter confirms that ${name} is employed aboard ${vessel}${rank ? ` in the position of ${rank}` : ''}. ${name} ${served}.${extra}`;
    case 'service_letter':
      return `This letter of service confirms that ${name} ${served}.${extra}`;
    case 'character':
      return `This letter is provided as a professional reference for ${name}, who ${served}.${extra}`;
    case 'visa':
      return `This letter is issued in support of ${name}'s visa / immigration application.\n\n${name} ${served}.${extra}`;
    case 'insurance':
      return `This letter confirms that ${name}${rank ? `, ${rank},` : ''} is a crew member of ${vessel}.${extra}`;
    case 'application':
      return `This covering letter is issued in respect of ${name}, who ${served}. Particulars of service held in this vessel's records are set out below.${extra}`;
    default:
      return extraNote.trim()
        ? extraNote.trim()
        : `This letter is issued by ${vessel} in respect of ${name}${rank ? `, ${rank}` : ''}.`;
  }
}

/** Deterministic layout if AI is unavailable. Uses only supplied facts. */
export function composeCustomDocumentFallback(
  request: CustomDocumentRequest,
  facts: CustomDocumentFacts,
): CustomDocumentComposeResult {
  const preset = getCustomDocumentPreset(request.purpose);
  const title = request.title.trim() || preset.title;
  const include = request.include;
  const sections: CustomDocumentSection[] = [];

  if (include.crewIdentity) {
    sections.push({
      heading: 'Crew member',
      body: joinLines([
        line('Name', facts.crew.name),
        line('Position', facts.crew.position),
        line('Nationality', facts.crew.nationality),
        line('Date of birth', facts.crew.dateOfBirth),
        line('Discharge book', facts.crew.dischargeBookNumber),
        line('Email', facts.crew.email),
      ]),
    });
  }

  if (include.vesselParticulars) {
    sections.push({
      heading: 'Vessel',
      body: joinLines([
        line('Name', facts.vessel.name),
        line('Type', facts.vessel.type),
        line('IMO', facts.vessel.imo),
        line('Official number', facts.vessel.officialNumber),
        line('Flag', facts.vessel.flag),
        line('Gross tonnage', facts.vessel.grossTonnage),
        line('Length', facts.vessel.lengthM ? `${facts.vessel.lengthM} m` : null),
        line('Call sign', facts.vessel.callSign),
        line('Management', facts.vessel.managementCompany),
      ]),
    });
  }

  if (include.assignment) {
    sections.push({
      heading: 'Assignment',
      body: joinLines([
        line('Start', facts.assignment.startDate),
        line('End', facts.assignment.endDate || 'Current'),
      ]),
    });
  }

  if (include.seaTime && facts.seaTime && facts.period) {
    sections.push({
      heading: 'Sea time',
      body: `Period ${facts.period.startDate} to ${facts.period.endDate}. Source: ${facts.seaTime.dataSourceLabel}.`,
      table: {
        headers: ['Metric', 'Days'],
        rows: [
          ['Calendar days', String(facts.seaTime.totalDays)],
          ['Sea service', String(facts.seaTime.seaServiceDays)],
          ['Underway', String(facts.seaTime.underwayDays)],
          ['Standby (qualifying)', String(facts.seaTime.standbyDays)],
          ['At anchor', String(facts.seaTime.atAnchorDays)],
          ['In port', String(facts.seaTime.inPortDays)],
          ['Yard', String(facts.seaTime.yardDays)],
          ['Leave', String(facts.seaTime.leaveDays)],
        ],
      },
    });
  }

  if (
    include.standbyPeriods &&
    facts.seaTime?.standbyPeriods &&
    facts.seaTime.standbyPeriods.length > 0
  ) {
    sections.push({
      heading: 'Standby periods',
      body: '',
      table: {
        headers: ['Passage start', 'Passage end', 'Standby days'],
        rows: facts.seaTime.standbyPeriods.map((p) => [
          p.passageStartDate,
          p.passageEndDate,
          String(p.standbyDays),
        ]),
      },
    });
  }

  return {
    title,
    subtitle: preset.label,
    recipientLine: preset.recipientLine,
    intro: introForPurpose(preset.value, facts, request.instructions),
    sections: sections.filter((s) => s.body.trim() || s.table),
    closing: `Issued by ${facts.generatedBy.name}, ${facts.generatedBy.vesselRoleLabel}${facts.generatedBy.email ? ` (${facts.generatedBy.email})` : ''}.`,
    purpose: preset.value,
  };
}
