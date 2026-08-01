/** Shared types and helpers for publishable application templates. */

export const APPLICATION_TEMPLATE_BUCKET = 'application-template-files';

export type ApplicationTemplateStatus = 'draft' | 'published' | 'archived';
export type CrewApplicationStatus = 'in_progress' | 'ready' | 'withdrawn';

export type ApplicationRequirementType =
  | 'profile_fields'
  | 'certificate'
  | 'testimonial'
  | 'proof_of_service'
  | 'sea_time_min'
  | 'manual_checklist'
  | 'external_link';

export type SeaTimeMetric = 'atSeaDays' | 'totalDays' | 'standbyDays';
export type SeaTimeSource = 'testimonials' | 'tracked';

export type RequirementConfig = {
  /** profile_fields */
  fields?: string[];
  /** certificate */
  minCount?: number;
  certificateType?: string;
  nameContains?: string;
  mustNotExpired?: boolean;
  /** Optional link to a certificates page preset id (stcw-bst, edh, …) */
  presetId?: string;
  /** testimonial */
  status?: string;
  minAtSeaDays?: number;
  /** sea_time_min */
  metric?: SeaTimeMetric;
  min?: number;
  source?: SeaTimeSource;
  /** manual_checklist / external_link */
  hint?: string;
  url?: string;
  label?: string;
};

export type ApplicationRequirement = {
  id: string;
  template_id: string;
  sort_order: number;
  title: string;
  description: string | null;
  requirement_type: ApplicationRequirementType;
  config: RequirementConfig;
  is_required: boolean;
  created_at?: string;
};

export type ApplicationTemplateFile = {
  id: string;
  template_id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export type ApplicationTemplate = {
  id: string;
  title: string;
  organization: string;
  description: string | null;
  instructions: string | null;
  external_url: string | null;
  status: ApplicationTemplateStatus;
  /** deck | engine | interior | galley | any */
  career_track: string;
  /** Milestone this package prepares for (watch_rating, oow, …) */
  target_level: string;
  created_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  requirements?: ApplicationRequirement[];
  files?: ApplicationTemplateFile[];
};

export type CrewApplication = {
  id: string;
  template_id: string;
  user_id: string;
  status: CrewApplicationStatus;
  completed_manual_ids: string[];
  progress_pct: number;
  started_at: string;
  updated_at: string;
};

export type CertificateValidityStatus =
  | 'missing'
  | 'valid'
  | 'expiring_soon'
  | 'expired'
  | 'no_expiry';

export type MatchedCertificateSummary = {
  id: string;
  name: string;
  expiryDate: string | null;
  status: CertificateValidityStatus;
  daysUntilExpiry: number | null;
};

export type RequirementEvaluation = {
  requirementId: string;
  title: string;
  description: string | null;
  requirementType: ApplicationRequirementType;
  isRequired: boolean;
  met: boolean;
  detail: string;
  href?: string;
  current?: number;
  target?: number;
  config: RequirementConfig;
  /** Present for certificate requirements */
  certificateStatus?: CertificateValidityStatus;
  matchedCertificates?: MatchedCertificateSummary[];
};

export const REQUIREMENT_TYPE_LABELS: Record<ApplicationRequirementType, string> = {
  profile_fields: 'Profile fields',
  certificate: 'Certificates',
  testimonial: 'Testimonials',
  proof_of_service: 'Proof of service',
  sea_time_min: 'Minimum sea time',
  manual_checklist: 'Manual checklist item',
  external_link: 'External link',
};

export const PROFILE_FIELD_OPTIONS = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'date_of_birth', label: 'Date of birth' },
  { key: 'discharge_book_number', label: 'Discharge book number' },
  { key: 'telephone', label: 'Telephone' },
  { key: 'address_line1', label: 'Address' },
] as const;

export function buildTemplateFilePath(templateId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180);
  return `${templateId}/${Date.now()}-${safe}`;
}

export function slugifyKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
}
