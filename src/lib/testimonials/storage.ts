/** Storage helpers for approved testimonial PDF snapshots. */

export const TESTIMONIALS_BUCKET = 'testimonials';

/** Path: <crewUserId>/<testimonialId>.pdf */
export function buildTestimonialPdfPath(crewUserId: string, testimonialId: string): string {
  return `${crewUserId}/${testimonialId}.pdf`;
}

/** Path: <crewUserId>/vessel-generated/<vesselGeneratedId>.pdf */
export function buildVesselGeneratedPdfPath(crewUserId: string, vesselGeneratedId: string): string {
  return `${crewUserId}/vessel-generated/${vesselGeneratedId}.pdf`;
}

export function isTestimonialStoragePath(value: string): boolean {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return false;
  return value.includes('/') && value.endsWith('.pdf');
}
