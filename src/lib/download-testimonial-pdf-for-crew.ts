import type { SupabaseClient } from '@supabase/supabase-js';
import type { Testimonial, UserProfile, Vessel } from '@/lib/types';
import {
  generateTestimonialPDF,
  generateMCADeckhandTestimonial,
  generateMCAOfficerTestimonial,
  type TestimonialPDFFormat,
  type TestimonialPDFOutput,
} from '@/lib/pdf-generator';
import { buildTestimonialStandbyPeriods } from '@/lib/build-testimonial-standby-periods';

function mapVesselRowToVessel(row: Record<string, unknown>): Vessel {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    type: String(row.type ?? ''),
    officialNumber:
      row.official_number != null
        ? String(row.official_number)
        : row.imo != null
          ? String(row.imo)
          : undefined,
    imo: row.imo != null ? String(row.imo) : undefined,
    length_m: (row.length_m as number) ?? null,
    gross_tonnage: (row.gross_tonnage as number) ?? null,
    flag: (row.flag as string) ?? null,
    flag_state: (row.flag_state as string) ?? null,
    call_sign: (row.call_sign as string) ?? null,
    management_company: (row.management_company as string) ?? null,
    company_address: (row.company_address as string) ?? null,
    company_contact: (row.company_contact as string) ?? null,
  };
}

function companyDetailsFromVessel(v: Vessel) {
  return {
    name: v.management_company ?? null,
    address: v.company_address ?? null,
    contactDetails: v.company_contact ?? null,
  };
}

/**
 * Generate an MCA (or other format) testimonial PDF for the signed-in crew member.
 * Mirrors dashboard applications PDF flow: vessel fetch, approved_testimonials snapshot, captain profile.
 * Pass `output: 'blob'` to receive a Blob instead of triggering a browser download.
 */
export async function downloadTestimonialPdfForCrewMember(
  supabase: SupabaseClient,
  testimonial: Testimonial,
  userProfile: UserProfile,
  authUserId: string | undefined,
  format: TestimonialPDFFormat = 'mca',
  output: TestimonialPDFOutput = 'download',
): Promise<Blob | void> {
  const { data: vesselRow, error: vErr } = await supabase
    .from('vessels')
    .select('*')
    .eq('id', testimonial.vessel_id)
    .maybeSingle();

  if (vErr || !vesselRow) {
    throw new Error('Vessel details not found.');
  }

  const vessel = mapVesselRowToVessel(vesselRow as Record<string, unknown>);

  let captainSignature = testimonial.captain_signature || null;
  let captainCommentConduct = testimonial.captain_comment_conduct || null;
  let captainCommentAbility = testimonial.captain_comment_ability || null;
  let captainCommentGeneral = testimonial.captain_comment_general || null;
  let approvedAt: string | null = null;

  if (testimonial.status === 'approved') {
    const { data: approvedSnapshot } = await supabase
      .from('approved_testimonials')
      .select(
        'captain_signature, captain_comment_conduct, captain_comment_ability, captain_comment_general, approved_at',
      )
      .eq('testimonial_id', testimonial.id)
      .maybeSingle();

    if (approvedSnapshot) {
      if (approvedSnapshot.captain_signature) {
        captainSignature = approvedSnapshot.captain_signature;
      }
      if (approvedSnapshot.captain_comment_conduct) {
        captainCommentConduct = approvedSnapshot.captain_comment_conduct;
      }
      if (approvedSnapshot.captain_comment_ability) {
        captainCommentAbility = approvedSnapshot.captain_comment_ability;
      }
      if (approvedSnapshot.captain_comment_general) {
        captainCommentGeneral = approvedSnapshot.captain_comment_general;
      }
      if (approvedSnapshot.approved_at) {
        approvedAt = approvedSnapshot.approved_at;
      }
    }
  }

  let captainProfile: {
    firstName?: string;
    lastName?: string;
    position: string | null;
    email?: string;
    signature: string | null;
  } | null = null;

  if (testimonial.captain_user_id) {
    const { data: captainData } = await supabase
      .from('users')
      .select('first_name, last_name, position, email, signature')
      .eq('id', testimonial.captain_user_id)
      .maybeSingle();

    if (captainData) {
      captainProfile = {
        firstName: captainData.first_name || undefined,
        lastName: captainData.last_name || undefined,
        position: captainData.position || null,
        email: captainData.email || undefined,
        signature: captainData.signature || null,
      };
    }
  }

  let standbyPeriods: Awaited<ReturnType<typeof buildTestimonialStandbyPeriods>> = [];
  if (format === 'seajourney' || format === 'mlc') {
    standbyPeriods = await buildTestimonialStandbyPeriods({
      supabase,
      vesselId: testimonial.vessel_id,
      startDate: testimonial.start_date,
      endDate: testimonial.end_date,
      crewUserId: userProfile.id,
      crewPosition: userProfile.position,
      crewRole: userProfile.role,
      source: 'crew',
      hasApprovedAccess: true,
    });
  }

  const testimonialData = {
    testimonial: {
      id: testimonial.id,
      start_date: testimonial.start_date,
      end_date: testimonial.end_date,
      total_days: testimonial.total_days,
      at_sea_days: testimonial.at_sea_days,
      standby_days: testimonial.standby_days,
      yard_days: testimonial.yard_days,
      leave_days: testimonial.leave_days,
      captain_name: testimonial.captain_name,
      captain_email: testimonial.captain_email,
      captain_position: testimonial.captain_position || null,
      captain_signature: captainSignature,
      captain_comment_conduct: captainCommentConduct,
      captain_comment_ability: captainCommentAbility,
      captain_comment_general: captainCommentGeneral,
      official_body: testimonial.official_body,
      official_reference: testimonial.official_reference,
      notes: testimonial.notes,
      testimonial_code: testimonial.testimonial_code,
      status: testimonial.status,
      signoff_used_at: testimonial.signoff_used_at,
      approved_at: approvedAt || null,
      created_at: testimonial.created_at,
      updated_at: testimonial.updated_at,
    },
    userProfile: {
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      username: userProfile.username,
      email: userProfile.email || '',
      dateOfBirth:
        (userProfile as { date_of_birth?: string | null; dateOfBirth?: string | null }).date_of_birth ||
        (userProfile as { dateOfBirth?: string | null }).dateOfBirth ||
        null,
      position: userProfile.position || null,
      dischargeBookNumber:
        (userProfile as { discharge_book_number?: string | null; dischargeBookNumber?: string | null })
          .discharge_book_number ||
        (userProfile as { dischargeBookNumber?: string | null }).dischargeBookNumber ||
        null,
      mobile: (userProfile as { mobile?: string | null }).mobile ?? null,
      telephone: (userProfile as { telephone?: string | null }).telephone ?? null,
    },
    vessel: {
      name: vessel.name,
      type: vessel.type || null,
      officialNumber: vessel.officialNumber || vessel.imo || null,
      flag_state: vessel.flag || vessel.flag_state || null,
      length_m: vessel.length_m || null,
      gross_tonnage: vessel.gross_tonnage || null,
      call_sign: vessel.call_sign || null,
      company_contact: vessel.company_contact ?? null,
      stamp: (vessel as { stamp?: string | null }).stamp ?? null,
    },
    captainProfile,
    companyDetails: companyDetailsFromVessel(vessel),
    standbyPeriods: standbyPeriods.length > 0 ? standbyPeriods : undefined,
  };

  if (format === 'mca') {
    const position = (userProfile.position || '').toLowerCase();
    const role = (userProfile.role || '').toLowerCase();
    const officerPositions = [
      'captain',
      'master',
      'chief officer',
      'first officer',
      'first mate',
      'second officer',
      'third officer',
      'officer of the watch',
      'oow',
      'deck officer',
      'chief engineer',
      'first engineer',
      'second engineer',
      'third engineer',
      'fourth engineer',
    ];
    const isOfficerUser =
      role === 'captain' ||
      role === 'admin' ||
      officerPositions.some((op) => position.includes(op));

    const testimonialDataWithReceipt = {
      ...testimonialData,
      receiptData: {
        documentId: testimonial.id,
        sjCode: testimonial.testimonial_code || null,
        documentType: 'testimonial' as const,
        generatedAt: new Date().toISOString(),
        generatedBy: {
          userId: authUserId,
          email: userProfile?.email || undefined,
        },
      },
    };

    if (isOfficerUser) {
      return await generateMCAOfficerTestimonial(testimonialDataWithReceipt, output);
    }
    return await generateMCADeckhandTestimonial(testimonialDataWithReceipt, output);
  }

  const payload =
    format === 'amsa'
      ? {
          ...testimonialData,
          receiptData: {
            documentId: testimonial.id,
            sjCode: testimonial.testimonial_code || null,
            documentType: 'testimonial' as const,
            generatedAt: new Date().toISOString(),
            generatedBy: {
              userId: authUserId,
              email: userProfile?.email || undefined,
            },
          },
        }
      : testimonialData;

  return await generateTestimonialPDF(payload, format, output);
}
