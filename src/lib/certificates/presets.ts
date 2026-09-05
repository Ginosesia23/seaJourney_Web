/**
 * Certificate catalog types + built-in seed (fallback before SQL migration).
 * Live list comes from `certificate_catalog` via API / server loader.
 */

export type CertificatePresetCategory =
  | 'stcw'
  | 'medical'
  | 'mca'
  | 'radio'
  | 'other';

export type CertificatePreset = {
  id: string;
  name: string;
  type: string;
  issuingAuthority: string;
  /** Typical validity in years; null = often no fixed expiry / check document */
  typicalValidityYears: number | null;
  renewalRequired: boolean;
  renewalNoticeDays: number;
  description: string;
  category: CertificatePresetCategory;
  /** Extra match aliases for career progress (without preset_id on the cert row). */
  aliases?: string[];
  sortOrder?: number;
  active?: boolean;
};

export const CERTIFICATE_PRESET_CATEGORIES: {
  id: CertificatePresetCategory;
  label: string;
}[] = [
  { id: 'stcw', label: 'STCW' },
  { id: 'medical', label: 'Medical' },
  { id: 'mca', label: 'MCA / CoC' },
  { id: 'radio', label: 'Radio' },
  { id: 'other', label: 'Other' },
];

/** Always offered on crew Certificates page for custom entries. */
export const OTHER_CERTIFICATE_PRESET: CertificatePreset = {
  id: 'other',
  name: 'Other certificate',
  type: 'Other',
  issuingAuthority: '',
  typicalValidityYears: null,
  renewalRequired: true,
  renewalNoticeDays: 90,
  description: 'Custom name — enter details yourself',
  category: 'other',
  aliases: [],
  sortOrder: 9999,
  active: true,
};

/** Built-in seed — used until / instead of DB rows. */
export const SEED_CERTIFICATE_PRESETS: CertificatePreset[] = [
  {
    id: 'stcw-bst',
    name: 'STCW Basic Safety Training',
    type: 'STCW',
    issuingAuthority: 'MCA',
    typicalValidityYears: 5,
    renewalRequired: true,
    renewalNoticeDays: 90,
    description: 'Personal survival, fire fighting, elementary first aid, PSSR',
    category: 'stcw',
    aliases: ['stcw basic safety', 'basic safety training', 'bst', 'stcw bst'],
    sortOrder: 10,
  },
  {
    id: 'stcw-security',
    name: 'STCW Security Awareness',
    type: 'STCW',
    issuingAuthority: 'MCA',
    typicalValidityYears: null,
    renewalRequired: false,
    renewalNoticeDays: 90,
    description: 'Ship security awareness (A-VI/6)',
    category: 'stcw',
    aliases: ['security awareness', 'ship security awareness'],
    sortOrder: 20,
  },
  {
    id: 'stcw-psc',
    name: 'STCW Proficiency in Survival Craft',
    type: 'STCW',
    issuingAuthority: 'MCA',
    typicalValidityYears: 5,
    renewalRequired: true,
    renewalNoticeDays: 90,
    description: 'PSC & rescue boats (other than fast rescue boats)',
    category: 'stcw',
    aliases: ['survival craft', 'psc'],
    sortOrder: 30,
  },
  {
    id: 'stcw-aff',
    name: 'STCW Advanced Fire Fighting',
    type: 'STCW',
    issuingAuthority: 'MCA',
    typicalValidityYears: 5,
    renewalRequired: true,
    renewalNoticeDays: 90,
    description: 'Advanced fire fighting (A-VI/3)',
    category: 'stcw',
    aliases: ['advanced fire fighting', 'aff'],
    sortOrder: 40,
  },
  {
    id: 'stcw-mfa',
    name: 'STCW Medical First Aid',
    type: 'STCW',
    issuingAuthority: 'MCA',
    typicalValidityYears: 5,
    renewalRequired: true,
    renewalNoticeDays: 90,
    description: 'Medical first aid (A-VI/4-1)',
    category: 'stcw',
    aliases: ['medical first aid'],
    sortOrder: 50,
  },
  {
    id: 'edh',
    name: 'Efficient Deck Hand (EDH)',
    type: 'MCA',
    issuingAuthority: 'MCA',
    typicalValidityYears: null,
    renewalRequired: false,
    renewalNoticeDays: 90,
    description: 'MCA Efficient Deck Hand certificate',
    category: 'mca',
    aliases: ['efficient deck hand', 'edh'],
    sortOrder: 60,
  },
  {
    id: 'eng1',
    name: 'ENG1 Medical Certificate',
    type: 'Medical',
    issuingAuthority: 'MCA',
    typicalValidityYears: 2,
    renewalRequired: true,
    renewalNoticeDays: 60,
    description: 'Seafarer medical fitness certificate (ENG1)',
    category: 'medical',
    aliases: ['eng1', 'eng 1'],
    sortOrder: 70,
  },
  {
    id: 'ml5',
    name: 'ML5 Medical Certificate',
    type: 'Medical',
    issuingAuthority: 'MCA',
    typicalValidityYears: 5,
    renewalRequired: true,
    renewalNoticeDays: 90,
    description: 'Medical for small commercial vessels / yachts',
    category: 'medical',
    aliases: ['ml5', 'ml 5'],
    sortOrder: 80,
  },
  {
    id: 'gmdss',
    name: 'GMDSS (GOC / ROC)',
    type: 'Radio',
    issuingAuthority: 'MCA',
    typicalValidityYears: 5,
    renewalRequired: true,
    renewalNoticeDays: 90,
    description: 'Global Maritime Distress and Safety System radio cert',
    category: 'radio',
    aliases: ['gmdss', 'goc', 'roc', 'gmdss goc', 'gmdss roc'],
    sortOrder: 90,
  },
  {
    id: 'ecdis',
    name: 'ECDIS Generic',
    type: 'STCW',
    issuingAuthority: 'MCA',
    typicalValidityYears: null,
    renewalRequired: false,
    renewalNoticeDays: 90,
    description: 'Electronic Chart Display and Information System',
    category: 'stcw',
    aliases: ['ecdis'],
    sortOrder: 100,
  },
  {
    id: 'yachtmaster-offshore',
    name: 'Yachtmaster Offshore',
    type: 'MCA',
    issuingAuthority: 'RYA / MCA',
    typicalValidityYears: null,
    renewalRequired: false,
    renewalNoticeDays: 90,
    description: 'RYA Yachtmaster Offshore (Coastal / Offshore)',
    category: 'mca',
    aliases: ['yachtmaster offshore'],
    sortOrder: 110,
  },
  {
    id: 'yachtmaster-ocean',
    name: 'Yachtmaster Ocean',
    type: 'MCA',
    issuingAuthority: 'RYA / MCA',
    typicalValidityYears: null,
    renewalRequired: false,
    renewalNoticeDays: 90,
    description: 'RYA Yachtmaster Ocean',
    category: 'mca',
    aliases: ['yachtmaster ocean'],
    sortOrder: 120,
  },
  {
    id: 'oow-yacht',
    name: 'Officer of the Watch (Yacht)',
    type: 'MCA',
    issuingAuthority: 'MCA',
    typicalValidityYears: 5,
    renewalRequired: true,
    renewalNoticeDays: 90,
    description: 'OOW Yacht CoC',
    category: 'mca',
    aliases: ['officer of the watch', 'oow yacht', 'oow (yacht)'],
    sortOrder: 130,
  },
  {
    id: 'chief-mate-yacht',
    name: 'Chief Mate (Yacht)',
    type: 'MCA',
    issuingAuthority: 'MCA',
    typicalValidityYears: 5,
    renewalRequired: true,
    renewalNoticeDays: 90,
    description: 'Chief Mate Yacht CoC',
    category: 'mca',
    aliases: ['chief mate'],
    sortOrder: 140,
  },
  {
    id: 'master-yacht',
    name: 'Master (Yacht)',
    type: 'MCA',
    issuingAuthority: 'MCA',
    typicalValidityYears: 5,
    renewalRequired: true,
    renewalNoticeDays: 90,
    description: 'Master Yacht CoC (e.g. <200gt / <500gt / <3000gt)',
    category: 'mca',
    aliases: ['master (yacht)', 'master yacht'],
    sortOrder: 150,
  },
  {
    id: 'aec',
    name: 'Approved Engine Course (AEC)',
    type: 'MCA',
    issuingAuthority: 'MCA',
    typicalValidityYears: null,
    renewalRequired: false,
    renewalNoticeDays: 90,
    description: 'AEC 1 / AEC 2 for yacht engineers',
    category: 'mca',
    aliases: ['approved engine course', 'aec'],
    sortOrder: 160,
  },
  {
    id: 'pssr',
    name: 'Personal Safety & Social Responsibilities',
    type: 'STCW',
    issuingAuthority: 'MCA',
    typicalValidityYears: null,
    renewalRequired: false,
    renewalNoticeDays: 90,
    description: 'PSSR module (often part of BST)',
    category: 'stcw',
    aliases: ['personal safety', 'pssr'],
    sortOrder: 170,
  },
];

/** @deprecated Prefer useCertificateCatalog() / loadCertificateCatalog(). Seed fallback. */
export const CERTIFICATE_PRESETS: CertificatePreset[] = [
  ...SEED_CERTIFICATE_PRESETS,
  OTHER_CERTIFICATE_PRESET,
];

export function mapCatalogRow(row: Record<string, unknown>): CertificatePreset {
  const category = String(row.category || 'other') as CertificatePresetCategory;
  return {
    id: String(row.id),
    name: String(row.name || ''),
    type: String(row.certificate_type || row.type || 'Other'),
    issuingAuthority: String(row.issuing_authority ?? row.issuingAuthority ?? ''),
    typicalValidityYears:
      typeof row.typical_validity_years === 'number'
        ? row.typical_validity_years
        : typeof row.typicalValidityYears === 'number'
          ? row.typicalValidityYears
          : null,
    renewalRequired:
      row.renewal_required !== false && row.renewalRequired !== false,
    renewalNoticeDays:
      typeof row.renewal_notice_days === 'number'
        ? row.renewal_notice_days
        : typeof row.renewalNoticeDays === 'number'
          ? row.renewalNoticeDays
          : 90,
    description: String(row.description || ''),
    category: ['stcw', 'medical', 'mca', 'radio', 'other'].includes(category)
      ? category
      : 'other',
    aliases: Array.isArray(row.aliases)
      ? row.aliases.map((a) => String(a)).filter(Boolean)
      : [],
    sortOrder:
      typeof row.sort_order === 'number'
        ? row.sort_order
        : typeof row.sortOrder === 'number'
          ? row.sortOrder
          : 0,
    active: row.active !== false,
  };
}

export function mergeCatalogWithSeed(
  rows: CertificatePreset[],
  opts?: { includeOther?: boolean; includeInactive?: boolean },
): CertificatePreset[] {
  const byId = new Map<string, CertificatePreset>();
  for (const seed of SEED_CERTIFICATE_PRESETS) {
    byId.set(seed.id, seed);
  }
  for (const row of rows) {
    if (row.id === 'other') continue;
    byId.set(row.id, row);
  }
  let list = Array.from(byId.values());
  if (!opts?.includeInactive) {
    list = list.filter((p) => p.active !== false);
  }
  list.sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
  );
  if (opts?.includeOther !== false) {
    list.push(OTHER_CERTIFICATE_PRESET);
  }
  return list;
}

export function getPresetById(
  id: string,
  catalog: CertificatePreset[] = CERTIFICATE_PRESETS,
): CertificatePreset | undefined {
  return catalog.find((p) => p.id === id);
}

export function slugifyCertificateCatalogId(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
