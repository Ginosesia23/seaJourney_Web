/**
 * MCA OOW (Yachts) Digital Companion Pilot — server-side gating.
 * Env-driven; never expose the allowlist to the browser.
 */

export const MCA_PILOT_PROGRAM_CODE = 'SJ-PILOT-MCA-OOW-YACHTS';
export const MCA_PILOT_VERSION = 'mca-source-2014-pilot-1';

export const MCA_PILOT_DISCLAIMER =
  'Digital companion pilot only. This programme is not currently approved by the Maritime and Coastguard Agency or the Professional Yachting Association as a replacement for the official Training Record Book. Candidates must continue completing and obtaining the required signatures in their official TRB.';

export const MCA_PILOT_ATTRIBUTION =
  'Contains public sector information licensed under the Open Government Licence v3.0. Source: Maritime and Coastguard Agency, Yacht Training Record Book.';

export const MCA_PILOT_SOURCE_URL =
  'https://www.gov.uk/government/publications/yacht-training-record-book-trb';

export const MCA_PILOT_OGL_URL =
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';

export const MCA_PILOT_CONSENT_VERSION = 'mca-oow-pilot-consent-v1';
export const MCA_PILOT_DISCLAIMER_VERSION = 'mca-oow-pilot-disclaimer-v1';

export function isMcaOowPilotEnabled(): boolean {
  const raw = (process.env.TRB_MCA_OOW_PILOT_ENABLED || '').trim().toLowerCase();
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

export function isEmailAllowlistedForMcaPilot(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = getMcaOowPilotAllowlist();
  if (list.size === 0) return false;
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
  if (!isEmailAllowlistedForMcaPilot(opts.email)) {
    return { allowed: false, reason: 'not_allowlisted' };
  }
  return { allowed: true };
}

export function isMcaPilotProgramCode(code: string | null | undefined): boolean {
  return code === MCA_PILOT_PROGRAM_CODE;
}
