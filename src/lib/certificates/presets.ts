/**
 * Premade maritime certificate templates users can pick when adding a copy.
 * Dates are still entered manually or extracted from an uploaded scan.
 */

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
  category: 'stcw' | 'medical' | 'mca' | 'radio' | 'other';
};

export const CERTIFICATE_PRESETS: CertificatePreset[] = [
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
  },
  {
    id: 'other',
    name: 'Other certificate',
    type: 'Other',
    issuingAuthority: '',
    typicalValidityYears: null,
    renewalRequired: true,
    renewalNoticeDays: 90,
    description: 'Custom name — enter details yourself',
    category: 'other',
  },
];

export const CERTIFICATE_PRESET_CATEGORIES: {
  id: CertificatePreset['category'];
  label: string;
}[] = [
  { id: 'stcw', label: 'STCW' },
  { id: 'medical', label: 'Medical' },
  { id: 'mca', label: 'MCA / CoC' },
  { id: 'radio', label: 'Radio' },
  { id: 'other', label: 'Other' },
];

export function getPresetById(id: string): CertificatePreset | undefined {
  return CERTIFICATE_PRESETS.find((p) => p.id === id);
}
