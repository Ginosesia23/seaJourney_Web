/**
 * OOW (Yachts <3,000 GT) Training Record — digital companion helpers.
 * Programme code retained for enrolment compatibility; presentation is professional companion (not MCA/PYA approved).
 */

export const MCA_PILOT_PROGRAM_CODE = 'SJ-PILOT-MCA-OOW-YACHTS';
/** @deprecated Alias — use MCA_PILOT_PROGRAM_CODE (stable enrolment id). */
export const OOW_YACHTS_3000_PROGRAM_CODE = MCA_PILOT_PROGRAM_CODE;

export const MCA_PILOT_VERSION = 'mca-source-2014-pilot-1';
/** @deprecated Alias — stable version id for existing enrolments. */
export const OOW_YACHTS_3000_VERSION = MCA_PILOT_VERSION;

export const MCA_PILOT_DISCLAIMER =
  'SeaJourney provides a digital companion to the identified Training Record Book. Continue maintaining any record required by the MCA or your recognised verification body until digital acceptance is confirmed. This programme is not approved by the Maritime and Coastguard Agency or the Professional Yachting Association as a replacement for the official Training Record Book.';

export const OOW_COMPANION_NOTICE =
  'SeaJourney provides a digital companion to the identified Training Record Book. Continue maintaining any record required by the MCA or your recognised verification body until digital acceptance is confirmed.';

export const MCA_PILOT_ATTRIBUTION =
  'Contains public sector information licensed under the Open Government Licence v3.0. Source: Maritime and Coastguard Agency, Yacht Training Record Book.';

export const MCA_PILOT_SOURCE_URL =
  'https://www.gov.uk/government/publications/yacht-training-record-book-trb';

export const MCA_PILOT_OGL_URL =
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';

export const MCA_PILOT_PDF_FILENAME = 'training_record_book_revision_22_04-2.pdf';
export const MCA_PILOT_PDF_SHA256 =
  'f9146a9600b524e1f7947930f84c90f84a85699796ebb8b08fd0af520973e7a6';
export const MCA_PILOT_REVISION_LABEL = 'Rev 2 (30/06/04)';

export const MCA_PILOT_CONSENT_VERSION = 'mca-oow-companion-consent-v2';
export const MCA_PILOT_DISCLAIMER_VERSION = 'mca-oow-companion-disclaimer-v2';

/**
 * Kill-switch for OOW companion discovery/enrolment.
 * Defaults to enabled when unset — dashboard access is already gated by
 * the `training_records` feature flag. Set to false/0/off to hide.
 */
export function isMcaOowPilotEnabled(): boolean {
  const raw = (process.env.TRB_MCA_OOW_PILOT_ENABLED || '').trim().toLowerCase();
  if (!raw) return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/** Parse allowlist from env. Never return this list to the client. */
export function getMcaOowPilotAllowlist(): Set<string> {
  const raw = process.env.TRB_MCA_OOW_PILOT_ALLOWED_EMAILS || '';
  const emails = raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set(emails);
}

/**
 * When an allowlist is configured, only those emails may discover/enrol.
 * Empty allowlist = open to any authenticated user who can call the API.
 */
export function isEmailAllowlistedForMcaPilot(email: string | null | undefined): boolean {
  const list = getMcaOowPilotAllowlist();
  if (list.size === 0) return true;
  if (!email) return false;
  return list.has(email.trim().toLowerCase());
}

export function canDiscoverMcaPilot(opts: {
  email: string | null | undefined;
  isAdmin?: boolean;
}): { allowed: boolean; reason?: string } {
  if (!isMcaOowPilotEnabled()) {
    return { allowed: false, reason: 'pilot_disabled' };
  }
  if (opts.isAdmin) return { allowed: true };
  const list = getMcaOowPilotAllowlist();
  if (list.size === 0) return { allowed: true };
  if (!opts.email || !list.has(opts.email.trim().toLowerCase())) {
    return { allowed: false, reason: 'not_allowlisted' };
  }
  return { allowed: true };
}

export function isMcaPilotProgramCode(code: string | null | undefined): boolean {
  return code === MCA_PILOT_PROGRAM_CODE;
}

/** Source-verified OOW companion programme (same code as legacy pilot enrolment id). */
export function isOowYachts3000ProgramCode(code: string | null | undefined): boolean {
  return isMcaPilotProgramCode(code);
}
