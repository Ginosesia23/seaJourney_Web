import JSZip from 'jszip';
import { format } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NavWatchApplication, Testimonial, UserProfile } from '@/lib/types';
import { generateMCAWatchRatingForm } from '@/lib/pdf-generator';
import { downloadTestimonialPdfForCrewMember } from '@/lib/download-testimonial-pdf-for-crew';

/** Typical MCA Watch Rating sea-service threshold (≈ 6 months). */
export const NAV_WATCH_REQUIRED_SEA_DAYS = 180;

function safeName(value: string, fallback = 'file'): string {
  const cleaned = value
    .replace(/[^\w\s.-]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

function seaDaysForTestimonial(t: Testimonial): number {
  const atSea = Number(t.at_sea_days ?? 0);
  if (atSea > 0) return atSea;
  // Fallback when at-sea wasn't broken out separately
  return Number(t.total_days ?? 0);
}

/**
 * Pick approved testimonials until their sea days reach the requirement.
 * Prefers most recent service periods first.
 */
export function selectTestimonialsCoveringSeaDays(
  testimonials: Testimonial[],
  requiredDays = NAV_WATCH_REQUIRED_SEA_DAYS,
): {
  selected: Testimonial[];
  coveredDays: number;
  availableDays: number;
  meetsRequirement: boolean;
} {
  const approved = testimonials
    .filter((t) => t.status === 'approved')
    .slice()
    .sort((a, b) => {
      const aEnd = a.end_date || a.start_date || '';
      const bEnd = b.end_date || b.start_date || '';
      return bEnd.localeCompare(aEnd);
    });

  const availableDays = approved.reduce((sum, t) => sum + seaDaysForTestimonial(t), 0);

  const selected: Testimonial[] = [];
  let coveredDays = 0;

  for (const t of approved) {
    if (coveredDays >= requiredDays) break;
    selected.push(t);
    coveredDays += seaDaysForTestimonial(t);
  }

  return {
    selected,
    coveredDays,
    availableDays,
    meetsRequirement: coveredDays >= requiredDays,
  };
}

function mergePersonalDetails(
  application: NavWatchApplication,
  userProfile: UserProfile | null | undefined,
) {
  const saved = (application.personal_details || {}) as NavWatchApplication['personal_details'] &
    Record<string, any>;
  const get = (snake: string, camel: string): string | undefined => {
    const value = (userProfile as any)?.[snake] || (userProfile as any)?.[camel];
    return value && String(value).trim() ? String(value).trim() : undefined;
  };

  return {
    ...saved,
    title: get('title', 'title') || saved.title,
    placeOfBirth: get('place_of_birth', 'placeOfBirth') || saved.placeOfBirth,
    countryOfBirth: get('country_of_birth', 'countryOfBirth') || saved.countryOfBirth,
    nationality: get('nationality', 'nationality') || saved.nationality,
    telephone: get('telephone', 'telephone') || saved.telephone,
    mobile: get('mobile', 'mobile') || saved.mobile,
    dateOfBirth: saved.dateOfBirth || '',
    address: {
      line1: get('address_line1', 'addressLine1') || saved.address?.line1 || '',
      line2: get('address_line2', 'addressLine2') || saved.address?.line2,
      district: get('address_district', 'addressDistrict') || saved.address?.district,
      townCity: get('address_town_city', 'addressTownCity') || saved.address?.townCity || '',
      countyState: get('address_county_state', 'addressCountyState') || saved.address?.countyState,
      postCode: get('address_post_code', 'addressPostCode') || saved.address?.postCode || '',
      country: get('address_country', 'addressCountry') || saved.address?.country || '',
    },
  };
}

export type NavWatchSubmissionPackResult = {
  filename: string;
  coveredDays: number;
  requiredDays: number;
  meetsRequirement: boolean;
  testimonialCount: number;
  warnings: string[];
};

/**
 * Build and download a ZIP with the MCA application PDF plus approved
 * testimonials covering (at least) the required sea-service days.
 */
export async function downloadNavWatchSubmissionPack(args: {
  supabase: SupabaseClient;
  application: NavWatchApplication;
  userProfile: UserProfile;
  authUserId: string;
  testimonials: Testimonial[];
  requiredDays?: number;
}): Promise<NavWatchSubmissionPackResult> {
  const {
    supabase,
    application,
    userProfile,
    authUserId,
    testimonials,
    requiredDays = NAV_WATCH_REQUIRED_SEA_DAYS,
  } = args;

  const warnings: string[] = [];
  const selection = selectTestimonialsCoveringSeaDays(testimonials, requiredDays);

  if (selection.selected.length === 0) {
    warnings.push('No approved testimonials were available to include as proof of sea service.');
  } else if (!selection.meetsRequirement) {
    warnings.push(
      `Approved testimonials cover ${selection.coveredDays} days (need ${requiredDays}). All available approved testimonials were included.`,
    );
  }

  const personalDetails = mergePersonalDetails(application, userProfile);
  const seaServiceRecords = Array.isArray(application.sea_service_records)
    ? application.sea_service_records
    : [];

  const applicationPdf = (await generateMCAWatchRatingForm(
    {
      personalDetails,
      certificateType: application.certificate_type,
      seaServiceRecords,
      userProfile: {
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        username: userProfile.username || '',
        email: userProfile.email || '',
        dateOfBirth: (userProfile as any).dateOfBirth || null,
        position: userProfile.position || null,
        dischargeBookNumber: userProfile.dischargeBookNumber || null,
      },
      receiptData: {
        documentId: application.id,
        documentType: 'nav_watch',
        generatedAt: new Date().toISOString(),
        generatedBy: {
          userId: authUserId,
          email: userProfile.email || undefined,
        },
      },
    },
    'blob',
  )) as Blob;

  const stamp = format(new Date(), 'yyyy-MM-dd');
  const crewName = safeName(
    `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() ||
      userProfile.username ||
      'crew',
    'crew',
  );
  const folderName = safeName(
    `NavWatch_Submission_${crewName}_${stamp}`,
    'NavWatch_Submission',
  );

  const zip = new JSZip();
  const root = zip.folder(folderName)!;

  const certLabel =
    application.certificate_type === 'engine_room'
      ? 'Engine_Room_Watch_Rating'
      : application.certificate_type === 'electro_technical'
        ? 'Electro_Technical_Rating'
        : 'Navigational_Watch_Rating';

  root.file(`01-application/MSF4371_${certLabel}.pdf`, applicationPdf);

  const testimonialsFolder = root.folder('02-testimonials')!;
  let generatedCount = 0;

  for (let i = 0; i < selection.selected.length; i++) {
    const testimonial = selection.selected[i];
    try {
      const blob = (await downloadTestimonialPdfForCrewMember(
        supabase,
        testimonial,
        userProfile,
        authUserId,
        'mca',
        'blob',
      )) as Blob;

      const vesselHint = safeName(
        (testimonial as any).vessel_name ||
          testimonial.vessel_id?.slice(0, 8) ||
          `vessel_${i + 1}`,
        `vessel_${i + 1}`,
      );
      const days = seaDaysForTestimonial(testimonial);
      const filename = `${String(i + 1).padStart(2, '0')}_${vesselHint}_${testimonial.start_date}_${testimonial.end_date}_${days}d.pdf`;
      testimonialsFolder.file(filename, blob);
      generatedCount += 1;
    } catch (err) {
      console.error('[NAV WATCH PACK] Failed to generate testimonial PDF:', {
        id: testimonial.id,
        err,
      });
      warnings.push(
        `Could not generate PDF for testimonial ${testimonial.id} (${testimonial.start_date}–${testimonial.end_date}).`,
      );
    }
  }

  if (generatedCount === 0) {
    testimonialsFolder.file(
      'NONE.txt',
      'No testimonial PDFs could be generated. Approve testimonials covering at least 180 days of sea service, then try again.',
    );
  }

  const readme = [
    'SeaJourney – Nav Watch submission pack',
    '======================================',
    '',
    `Applicant: ${[userProfile.firstName, userProfile.lastName].filter(Boolean).join(' ') || userProfile.username}`,
    `Certificate: ${application.certificate_type}`,
    `Application saved: ${format(new Date(application.created_at), 'yyyy-MM-dd')}`,
    `Pack generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
    '',
    'Sea service proof',
    '-----------------',
    `Required: ${requiredDays} days`,
    `Included from approved testimonials: ${selection.coveredDays} days (${generatedCount} PDF${generatedCount === 1 ? '' : 's'})`,
    `All approved sea days available: ${selection.availableDays}`,
    selection.meetsRequirement
      ? 'Status: Requirement met for this pack.'
      : 'Status: Short of 180 days — request/approve more testimonials before submitting.',
    '',
    'Contents',
    '--------',
    '01-application/   MCA MSF 4371 Watch Rating application PDF',
    '02-testimonials/  Approved sea-service testimonials (enough to cover ~180 days when available)',
    '',
    'IMPORTANT',
    '---------',
    'SeaJourney does not submit this pack to the MCA.',
    'Review every file, add any remaining checklist documents (passport, STCW, medical, etc.),',
    'then submit through the MCA / official channel.',
    '',
    ...(warnings.length
      ? ['Warnings', '--------', ...warnings.map((w) => `- ${w}`), '']
      : []),
  ].join('\n');

  root.file('00-README.txt', readme);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const filename = `${folderName}.zip`;
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return {
    filename,
    coveredDays: selection.coveredDays,
    requiredDays,
    meetsRequirement: selection.meetsRequirement,
    testimonialCount: generatedCount,
    warnings,
  };
}
