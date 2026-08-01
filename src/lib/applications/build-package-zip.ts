import JSZip from 'jszip';
import { format } from 'date-fns';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateSeaTimeReportData } from '@/app/actions';
import {
  generateProofOfServicePDF,
  generateSeaTimeTestimonial,
} from '@/lib/pdf-generator';
import { downloadTestimonialPdfForCrewMember } from '@/lib/download-testimonial-pdf-for-crew';
import {
  evaluateRequirements,
  progressFromEvaluations,
  sumDocumentedSea,
} from '@/lib/applications/evaluate-requirements';
import { mapRequirement } from '@/lib/applications/auth';
import {
  APPLICATION_TEMPLATE_BUCKET,
  type ApplicationRequirement,
  type ApplicationTemplate,
} from '@/lib/applications/types';
import { CERTIFICATES_BUCKET } from '@/lib/certificates/storage';
import type { Testimonial, UserProfile } from '@/lib/types';

function safeName(value: string, fallback = 'file'): string {
  const cleaned = value
    .replace(/[^\w\s.-]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

function mapUserProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email || ''),
    username: String(row.username || `user_${String(row.id).slice(0, 8)}`),
    firstName: (row.first_name as string) || null,
    lastName: (row.last_name as string) || null,
    position: (row.position as string) || null,
    role: (row.role as UserProfile['role']) || 'crew',
    subscriptionTier: String(row.subscription_tier || 'free'),
    subscriptionStatus: (row.subscription_status as UserProfile['subscriptionStatus']) || 'inactive',
    registrationDate: String(row.registration_date || row.created_at || new Date().toISOString()),
    nationality: (row.nationality as string) || null,
    dischargeBookNumber: (row.discharge_book_number as string) || null,
    mobile: (row.mobile as string) || null,
    telephone: (row.telephone as string) || null,
  } as UserProfile;
}

function profileSummary(row: Record<string, unknown>): string {
  const lines = [
    'SeaJourney – Applicant profile summary',
    '======================================',
    '',
    `Name: ${[row.first_name, row.last_name].filter(Boolean).join(' ') || '—'}`,
    `Email: ${row.email || '—'}`,
    `Username: ${row.username || '—'}`,
    `Position: ${row.position || '—'}`,
    `Nationality: ${row.nationality || '—'}`,
    `Date of birth: ${row.date_of_birth || '—'}`,
    `Discharge book: ${row.discharge_book_number || '—'}`,
    `Telephone: ${row.telephone || '—'}`,
    `Mobile: ${row.mobile || '—'}`,
    `Address: ${
      [
        row.address_line1,
        row.address_line2,
        row.address_town_city,
        row.address_post_code,
        row.address_country,
      ]
        .filter(Boolean)
        .join(', ') || '—'
    }`,
    '',
    `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')} UTC`,
  ];
  return lines.join('\n');
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

export type PackageBuildResult = {
  zipBytes: Uint8Array;
  filename: string;
  warnings: string[];
};

/**
 * Build a ZIP of materials for a published application template for one crew user.
 */
export async function buildApplicationPackageZip(
  userId: string,
  templateId: string,
): Promise<PackageBuildResult> {
  const warnings: string[] = [];

  const { data: template } = await supabaseAdmin
    .from('application_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (!template || template.status !== 'published') {
    throw new Error('Application not found or not published');
  }

  const [
    { data: requirements },
    { data: files },
    { data: application },
    { data: profileRow },
    { data: certificates },
    { data: testimonials },
    { data: proofRows },
  ] = await Promise.all([
    supabaseAdmin
      .from('application_requirements')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true }),
    supabaseAdmin
      .from('application_template_files')
      .select('*')
      .eq('template_id', templateId),
    supabaseAdmin
      .from('crew_applications')
      .select('*')
      .eq('user_id', userId)
      .eq('template_id', templateId)
      .maybeSingle(),
    supabaseAdmin.from('users').select('*').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('certificates').select('*').eq('user_id', userId),
    supabaseAdmin.from('testimonials').select('*').eq('user_id', userId),
    supabaseAdmin.from('proof_of_service').select('*').eq('crew_user_id', userId),
  ]);

  if (!profileRow) throw new Error('User profile not found');

  const mappedReqs = (requirements || []).map(
    mapRequirement,
  ) as ApplicationRequirement[];
  const completedManualIds = new Set<string>(
    (application?.completed_manual_ids as string[] | null) || [],
  );
  const evaluations = evaluateRequirements(mappedReqs, {
    profile: profileRow as Record<string, unknown>,
    certificates: certificates || [],
    testimonials: testimonials || [],
    proofOfService: (proofRows || []).map((p) => ({ id: p.id })),
    documentedSea: sumDocumentedSea(testimonials || []),
    trackedSea: null,
    completedManualIds,
  });
  const progress = progressFromEvaluations(evaluations);

  const userProfile = mapUserProfile(profileRow as Record<string, unknown>);
  const crewName =
    `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() ||
    userProfile.username;
  const stamp = format(new Date(), 'yyyy-MM-dd');
  const folder = safeName(
    `${(template as ApplicationTemplate).organization}_${template.title}_${crewName}_${stamp}`,
    'application_package',
  );

  const zip = new JSZip();
  const root = zip.folder(folder)!;

  // --- README ---
  const unmet = evaluations.filter((e) => e.isRequired && !e.met);
  const readme = [
    'SeaJourney application package',
    '==============================',
    '',
    `Application: ${template.title}`,
    `Organization: ${template.organization}`,
    `Applicant: ${crewName}`,
    `Email: ${userProfile.email}`,
    `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
    `Readiness: ${progress.percent}% (${progress.metRequired}/${progress.totalRequired} required)`,
    '',
    'IMPORTANT',
    '---------',
    'SeaJourney does not submit this package to the organization.',
    'Use these files to apply through the organization\'s official channel.',
    template.external_url ? `Official URL: ${template.external_url}` : '',
    '',
    template.instructions
      ? `Instructions\n------------\n${template.instructions}\n`
      : '',
    'Checklist',
    '---------',
    ...evaluations.map(
      (e) =>
        `${e.met ? '[x]' : '[ ]'} ${e.title}${e.isRequired ? '' : ' (optional)'} — ${e.detail}`,
    ),
    '',
    unmet.length
      ? `Incomplete required items:\n${unmet.map((e) => `- ${e.title}`).join('\n')}`
      : 'All required checklist items are met.',
    '',
    'Contents',
    '--------',
    '01-profile/          Applicant profile summary',
    '02-testimonials/     Approved sea-service testimonials (PDF)',
    '03-proof-of-service/ Proof of service records (PDF)',
    '04-certificates/     Certificate files (when uploaded) + index',
    '05-sea-time/         Consolidated sea-time summary report',
    '06-reference/        Documents supplied with this application',
    '07-checklist/        Machine-readable checklist status',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  root.file('00-README.txt', readme);
  root.folder('01-profile')!.file('profile-summary.txt', profileSummary(profileRow as Record<string, unknown>));

  // --- Testimonials (approved) ---
  const testimonialsFolder = root.folder('02-testimonials')!;
  const approved = (testimonials || []).filter((t) => t.status === 'approved');
  if (approved.length === 0) {
    testimonialsFolder.file(
      'NONE.txt',
      'No approved testimonials were available for this package.',
    );
    warnings.push('No approved testimonials included');
  } else {
    for (const row of approved) {
      try {
        const testimonial = {
          ...row,
          user_id: row.user_id,
          vessel_id: row.vessel_id,
        } as Testimonial;
        const blob = await downloadTestimonialPdfForCrewMember(
          supabaseAdmin as never,
          testimonial,
          userProfile,
          userId,
          'mca',
          'blob',
        );
        if (blob) {
          const name = safeName(
            `${row.start_date}_${row.end_date}_${row.testimonial_code || row.id}`,
          );
          testimonialsFolder.file(`${name}.pdf`, await blobToUint8Array(blob));
        }
      } catch (e) {
        console.warn('[package] testimonial PDF failed', row.id, e);
        warnings.push(`Testimonial ${row.id} PDF failed`);
      }
    }
  }

  // --- Proof of service ---
  const proofFolder = root.folder('03-proof-of-service')!;
  if (!proofRows?.length) {
    proofFolder.file(
      'NONE.txt',
      'No proof of service records were available for this package.',
    );
    warnings.push('No proof of service included');
  } else {
    try {
      const entries = proofRows.map((p) => ({
        vesselName: p.vessel_name || 'Vessel',
        vesselType: p.vessel_type || null,
        vesselImo: p.vessel_imo || null,
        crewName: p.crew_name || crewName,
        crewPosition: p.crew_position || null,
        startDate: p.start_date,
        endDate: p.end_date,
        totalDays: p.total_days ?? 0,
        atSeaDays: p.at_sea_days ?? 0,
        standbyDays: p.standby_days ?? 0,
        yardDays: p.yard_days ?? 0,
        leaveDays: p.leave_days ?? 0,
        generatedByName: p.generated_by_name || 'Vessel manager',
        generatedByEmail: p.generated_by_email || null,
        notes: p.notes || null,
        verificationCode: p.verification_code || 'N/A',
      }));
      const blob = await generateProofOfServicePDF(entries, 'blob');
      if (blob) {
        proofFolder.file(
          `proof-of-service_${safeName(crewName)}.pdf`,
          await blobToUint8Array(blob as Blob),
        );
      }
    } catch (e) {
      console.warn('[package] proof of service PDF failed', e);
      warnings.push('Proof of service PDF failed');
    }
  }

  // --- Certificates ---
  const certFolder = root.folder('04-certificates')!;
  const certIndex = [
    'Certificate name,Type,Number,Issuing authority,Issue date,Expiry date,Has file',
  ];
  for (const c of certificates || []) {
    const name = c.certificate_name || 'Certificate';
    const hasFile = Boolean(c.document_url);
    certIndex.push(
      [
        JSON.stringify(name),
        JSON.stringify(c.certificate_type || ''),
        JSON.stringify(c.certificate_number || ''),
        JSON.stringify(c.issuing_authority || ''),
        c.issue_date || '',
        c.expiry_date || '',
        hasFile ? 'yes' : 'no',
      ].join(','),
    );
    if (c.document_url) {
      try {
        let bytes: Uint8Array | null = null;
        const url = c.document_url as string;
        if (/^https?:\/\//i.test(url)) {
          const res = await fetch(url);
          if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
        } else {
          const { data, error } = await supabaseAdmin.storage
            .from(CERTIFICATES_BUCKET)
            .download(url);
          if (!error && data) {
            bytes = new Uint8Array(await data.arrayBuffer());
          }
        }
        if (bytes) {
          const ext =
            url.includes('.png')
              ? 'png'
              : url.includes('.jpg') || url.includes('.jpeg')
                ? 'jpg'
                : url.includes('.webp')
                  ? 'webp'
                  : 'pdf';
          certFolder.file(
            `${safeName(`${name}_${c.certificate_type || 'cert'}`)}.${ext}`,
            bytes,
          );
        } else {
          warnings.push(`Certificate file fetch failed: ${name}`);
        }
      } catch {
        warnings.push(`Certificate file fetch failed: ${name}`);
      }
    }
  }
  certFolder.file('certificates-index.csv', certIndex.join('\n'));
  if (!(certificates || []).length) {
    certFolder.file('NONE.txt', 'No certificates recorded in SeaJourney.');
  }

  // --- Sea time summary ---
  const seaFolder = root.folder('05-sea-time')!;
  try {
    const report = await generateSeaTimeReportData(userId, 'date_range', undefined, {
      from: new Date('1990-01-01T00:00:00Z'),
      to: new Date(),
    });
    const blob = await generateSeaTimeTestimonial(report, 'blob');
    if (blob) {
      seaFolder.file(
        `Sea-Time-Summary_${safeName(crewName)}.pdf`,
        await blobToUint8Array(blob as Blob),
      );
    }
  } catch (e) {
    console.warn('[package] sea time report failed', e);
    seaFolder.file(
      'NONE.txt',
      'Could not generate sea-time summary from logged data.',
    );
    warnings.push('Sea-time summary PDF failed');
  }

  // --- Template reference files ---
  const refFolder = root.folder('06-reference')!;
  if (!files?.length) {
    refFolder.file('NONE.txt', 'No reference documents were attached to this application.');
  } else {
    for (const f of files) {
      try {
        const { data: blob, error } = await supabaseAdmin.storage
          .from(APPLICATION_TEMPLATE_BUCKET)
          .download(f.file_path);
        if (error || !blob) {
          warnings.push(`Reference file missing: ${f.file_name}`);
          continue;
        }
        refFolder.file(
          safeName(f.file_name, 'reference'),
          await blobToUint8Array(blob),
        );
      } catch {
        warnings.push(`Reference file failed: ${f.file_name}`);
      }
    }
  }

  // --- Checklist JSON ---
  root.folder('07-checklist')!.file(
    'requirements.json',
    JSON.stringify(
      {
        template: {
          id: template.id,
          title: template.title,
          organization: template.organization,
        },
        progress,
        evaluations,
        documentedSea: sumDocumentedSea(testimonials || []),
        generatedAt: new Date().toISOString(),
        warnings,
      },
      null,
      2,
    ),
  );

  if (warnings.length) {
    root.file('00-WARNINGS.txt', warnings.map((w) => `- ${w}`).join('\n'));
  }

  const zipBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    zipBytes,
    filename: `${folder}.zip`,
    warnings,
  };
}
