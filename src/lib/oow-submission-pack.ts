import JSZip from 'jszip';
import { format } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OOWApplication, Testimonial, UserProfile } from '@/lib/types';
import { generateMCAOOWForm_MSF_4274, type OOWCertificateType } from '@/lib/pdf-generator';
import { downloadTestimonialPdfForCrewMember } from '@/lib/download-testimonial-pdf-for-crew';
import {
  getOowRouteRequirements,
  OOW_CERTIFICATE_LABELS,
  type OowTrainingRoute,
} from '@/lib/oow-application';
import { selectTestimonialsCoveringSeaDays } from '@/lib/nav-watch-submission-pack';
import {
  summariseCrewWatchHistory,
  type NavWatchLogRow,
} from '@/lib/watch-history-summary';

function safeName(value: string, fallback = 'file'): string {
  const cleaned = value
    .replace(/[^\w\s.-]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

const BRIDGE_WATCH_TYPES = new Set([
  'bridge',
  'lookout',
  'helmsman',
  'officer_of_the_watch',
  'master',
]);

/** Count bridge-watchkeeping days from completed nav_watch_logs (4h+ day rule). */
export function summariseBridgeWatchkeepingDays(rows: NavWatchLogRow[], userId: string): {
  watchkeepingDays: number;
  totalHours: number;
} {
  const bridgeRows = rows.filter(
    (r) =>
      r.user_id === userId &&
      !!r.end_time &&
      (!r.watch_type || BRIDGE_WATCH_TYPES.has(String(r.watch_type))),
  );
  const summary = summariseCrewWatchHistory(bridgeRows, userId);

  // Prefer day count with ≥4 hours per day (MCA-style watchkeeping evidence)
  const hoursByDay = new Map<string, number>();
  for (const entry of summary.entries) {
    if (entry.hours == null) continue;
    hoursByDay.set(entry.dayKey, (hoursByDay.get(entry.dayKey) || 0) + entry.hours);
  }

  let fullDays = 0;
  let partialHours = 0;
  for (const hours of hoursByDay.values()) {
    if (hours >= 4) fullDays += 1;
    else partialHours += hours;
  }
  const watchkeepingDays = fullDays + Math.floor(partialHours / 4);

  return {
    watchkeepingDays,
    totalHours: Math.round(summary.totalHours),
  };
}

export type OowSubmissionPackResult = {
  filename: string;
  coveredSeaDays: number;
  requiredSeaDays: number;
  watchkeepingDays: number;
  requiredWatchkeepingDays: number;
  meetsSeaRequirement: boolean;
  meetsWatchRequirement: boolean;
  testimonialCount: number;
  warnings: string[];
};

export async function downloadOowSubmissionPack(args: {
  supabase: SupabaseClient;
  application: OOWApplication;
  userProfile: UserProfile;
  authUserId: string;
  testimonials: Testimonial[];
  watchLogs?: NavWatchLogRow[];
}): Promise<OowSubmissionPackResult> {
  const {
    supabase,
    application,
    userProfile,
    authUserId,
    testimonials,
    watchLogs = [],
  } = args;

  const warnings: string[] = [];
  const route = (application.training_route || 'examination') as OowTrainingRoute;
  const requirements = getOowRouteRequirements(route);
  const selection = selectTestimonialsCoveringSeaDays(
    testimonials,
    requirements.seaDays,
  );
  const watchSummary = summariseBridgeWatchkeepingDays(watchLogs, authUserId);

  if (selection.selected.length === 0) {
    warnings.push('No approved testimonials were available as sea-service proof.');
  } else if (!selection.meetsRequirement) {
    warnings.push(
      `Approved testimonials cover ${selection.coveredDays} days (need ~${requirements.seaDays} for ${requirements.label}).`,
    );
  }

  if (watchSummary.watchkeepingDays < requirements.watchkeepingDays) {
    warnings.push(
      `Bridge watchkeeping evidence covers ${watchSummary.watchkeepingDays} days (need ~${requirements.watchkeepingDays}). Log more watches in Bridge Watch Log.`,
    );
  }

  const personal = application.personal_details || ({} as OOWApplication['personal_details']);
  const seaServiceRecords = Array.isArray(application.sea_service_records)
    ? application.sea_service_records
    : [];

  const applicationPdf = (await generateMCAOOWForm_MSF_4274(
    {
      certificateType: application.certificate_type as OOWCertificateType,
      personalDetails: {
        title: personal.title,
        surname: personal.surname,
        forenames: personal.forenames,
        dateOfBirth: personal.dateOfBirth || '',
        placeOfBirth: personal.placeOfBirth,
        countryOfBirth: personal.countryOfBirth,
        nationality: personal.nationality,
      },
      homeAddress: {
        line1: personal.homeAddress?.line1 || '',
        line2: personal.homeAddress?.line2,
        townCity: personal.homeAddress?.townCity || '',
        countyState: personal.homeAddress?.countyState,
        postCode: personal.homeAddress?.postCode || '',
        country: personal.homeAddress?.country || '',
        email: personal.email || userProfile.email || '',
        telephone: personal.telephone,
      },
      seaServiceRecords,
      supportingEvidence: {
        attestedPassport: application.supporting_evidence?.attestedPassport,
        payment: application.supporting_evidence?.payment,
        dischargeBookOrCd: application.supporting_evidence?.dischargeBookOrCd,
        seaServiceTestimonials: application.supporting_evidence?.seaServiceTestimonials,
        passportPhoto: application.supporting_evidence?.passportPhoto,
        stcwBasicTraining: application.supporting_evidence?.stcwBasicTraining,
        securityAwareness: application.supporting_evidence?.securityAwareness,
        medical: application.supporting_evidence?.medical,
        advancedFireFighting: application.supporting_evidence?.advancedFireFighting,
        medicalFirstAid: application.supporting_evidence?.medicalFirstAid,
        efficientDeckHand: application.supporting_evidence?.efficientDeckHand,
        gmdssGoc: application.supporting_evidence?.gmdssGoc,
      },
      declaration: {
        signatureDataUrl: personal.signatureDataUrl || null,
        date: format(new Date(), 'dd/MM/yyyy'),
        printName: `${personal.forenames || ''} ${personal.surname || ''}`.trim(),
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
  const folderName = safeName(`OOW_Submission_${crewName}_${stamp}`, 'OOW_Submission');
  const zip = new JSZip();
  const root = zip.folder(folderName)!;

  const certLabel = safeName(
    OOW_CERTIFICATE_LABELS[application.certificate_type as OOWCertificateType] ||
      application.certificate_type,
    'CoC',
  );
  root.file(`01-application/MSF4274_${certLabel}.pdf`, applicationPdf);

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
      const days = Number(testimonial.at_sea_days || testimonial.total_days || 0);
      testimonialsFolder.file(
        `${String(i + 1).padStart(2, '0')}_${vesselHint}_${testimonial.start_date}_${testimonial.end_date}_${days}d.pdf`,
        blob,
      );
      generatedCount += 1;
    } catch (err) {
      console.error('[OOW PACK] Testimonial PDF failed:', testimonial.id, err);
      warnings.push(`Could not generate PDF for testimonial ${testimonial.id}.`);
    }
  }

  if (generatedCount === 0) {
    testimonialsFolder.file(
      'NONE.txt',
      'No testimonial PDFs could be generated. Approve sea-service testimonials, then try again.',
    );
  }

  root.file(
    '03-watchkeeping/SUMMARY.txt',
    [
      'Bridge watchkeeping summary (from SeaJourney Bridge Watch Log)',
      '=============================================================',
      '',
      `Watchkeeping days (≈4h/day rule): ${watchSummary.watchkeepingDays}`,
      `Required for route: ${requirements.watchkeepingDays} (~${requirements.watchkeepingMonths} months)`,
      `Total logged watch hours: ${watchSummary.totalHours}`,
      '',
      'Include Master-signed sea service testimonials that state watchkeeping time with your MCA pack.',
    ].join('\n'),
  );

  const checklist = application.supporting_evidence || {};
  root.file(
    '00-README.txt',
    [
      'SeaJourney – OOW / CoC submission pack (MSF 4274)',
      '================================================',
      '',
      `Applicant: ${[userProfile.firstName, userProfile.lastName].filter(Boolean).join(' ') || userProfile.username}`,
      `Certificate: ${OOW_CERTIFICATE_LABELS[application.certificate_type as OOWCertificateType] || application.certificate_type}`,
      `Training route: ${requirements.label}`,
      `Application saved: ${format(new Date(application.created_at), 'yyyy-MM-dd')}`,
      `Pack generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
      '',
      'Official MCA requirements (summary)',
      '-----------------------------------',
      'Form: MSF 4274 – oral examination leading to a deck CoC (NOE).',
      `Sea service for this route: ~${requirements.seaMonths} months (~${requirements.seaDays} days).`,
      `Bridge watchkeeping: ~${requirements.watchkeepingMonths} months (~${requirements.watchkeepingDays} days).`,
      'Also typically required for NOE: fee, ENG1 medical, attested passport copy, passport photos,',
      'Discharge Book or Certificates of Discharge, and sea-service testimonials with watchkeeping evidence.',
      'Submit via the MCA process (currently deck@mcga.gov.uk for scanned applications) — SeaJourney does not submit for you.',
      'Guidance: https://www.gov.uk/government/publications/certificate-of-competency-deck-msf-4274',
      '',
      'This pack',
      '---------',
      `Sea days included from testimonials: ${selection.coveredDays} / ${requirements.seaDays}`,
      `Watchkeeping days from logs: ${watchSummary.watchkeepingDays} / ${requirements.watchkeepingDays}`,
      `Testimonial PDFs: ${generatedCount}`,
      '',
      'Contents',
      '--------',
      '01-application/     MCA MSF 4274 PDF',
      '02-testimonials/    Approved sea-service testimonials covering the sea-day target when available',
      '03-watchkeeping/    Summary of logged bridge watches',
      '',
      'Checklist you confirmed in SeaJourney',
      '------------------------------------',
      ...Object.entries(checklist).map(
        ([key, value]) => `${value ? '[x]' : '[ ]'} ${key}`,
      ),
      '',
      ...(warnings.length
        ? ['Warnings', '--------', ...warnings.map((w) => `- ${w}`), '']
        : []),
    ].join('\n'),
  );

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
    coveredSeaDays: selection.coveredDays,
    requiredSeaDays: requirements.seaDays,
    watchkeepingDays: watchSummary.watchkeepingDays,
    requiredWatchkeepingDays: requirements.watchkeepingDays,
    meetsSeaRequirement: selection.meetsRequirement,
    meetsWatchRequirement: watchSummary.watchkeepingDays >= requirements.watchkeepingDays,
    testimonialCount: generatedCount,
    warnings,
  };
}
