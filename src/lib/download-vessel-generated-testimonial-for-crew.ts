import type { SupabaseClient } from '@supabase/supabase-js';
import { format as formatDate, addDays } from 'date-fns';
import type { UserProfile, VesselGeneratedTestimonial, StateLog } from '@/lib/types';
import { getVesselStateLogs } from '@/supabase/database/queries';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import {
  generateTestimonialPDF,
  generateMCADeckhandTestimonial,
  generateMCAOfficerTestimonial,
  type TestimonialPDFFormat,
  type TestimonialPDFOutput,
} from '@/lib/pdf-generator';

function mapVesselRow(row: Record<string, unknown>) {
  return {
    name: (row.name as string) || '',
    type: (row.type as string) || null,
    officialNumber: (row.imo as string) || (row.official_number as string) || null,
    imo: (row.imo as string) || null,
    flag: (row.flag as string) || null,
    flag_state: (row.flag_state as string) || null,
    length_m: (row.length_m as number) ?? null,
    gross_tonnage: (row.gross_tonnage as number) ?? null,
    call_sign: (row.call_sign as string) || null,
    management_company: (row.management_company as string) || null,
    company_address: (row.company_address as string) || null,
    company_contact: (row.company_contact as string) || null,
    vessel_manager_id: (row.vessel_manager_id as string) || null,
  };
}

/**
 * Generate/download PDF for a vessel-generated sea service document, from the crew member's account.
 * Mirrors vessel-manager crew page logic without requiring the crew UI context.
 */
export async function downloadVesselGeneratedTestimonialForCrew(
  supabase: SupabaseClient,
  testimonial: VesselGeneratedTestimonial,
  crewProfile: UserProfile,
  format: TestimonialPDFFormat = 'mca',
  output: TestimonialPDFOutput = 'download',
): Promise<void> {
  const { data: vesselRow, error: vErr } = await supabase
    .from('vessels')
    .select('*')
    .eq('id', testimonial.vessel_id)
    .maybeSingle();

  if (vErr || !vesselRow) {
    throw new Error('Vessel details not found.');
  }

  const vessel = mapVesselRow(vesselRow as Record<string, unknown>);

  const { data: accessRow } = await supabase
    .from('vessel_sea_time_access_requests')
    .select('status')
    .eq('crew_user_id', crewProfile.id)
    .eq('vessel_id', testimonial.vessel_id)
    .eq('status', 'approved')
    .maybeSingle();

  const hasApprovedAccess = !!accessRow;

  let standbyPeriods: Array<{
    passageStartDate: string;
    passageEndDate: string;
    standbyStartDate: string;
    standbyEndDate: string;
    standbyDays: number;
  }> = [];

  try {
    let logs: StateLog[] = [];

    if (hasApprovedAccess && testimonial.data_source === 'crew') {
      logs = await getVesselStateLogs(supabase, testimonial.vessel_id, crewProfile.id);
    } else {
      const vesselManagerId = vessel.vessel_manager_id;
      const targetUserId = vesselManagerId || testimonial.vessel_user_id;
      logs = await getVesselStateLogs(supabase, testimonial.vessel_id, targetUserId);
    }

    const filteredLogs = logs.filter((log) => {
      const logDate = log.date;
      return logDate >= testimonial.start_date && logDate <= testimonial.end_date;
    });

    const partOfActivePassageDates = new Set<string>();
    filteredLogs.forEach((log) => {
      if (log.isPartOfActivePassage) {
        partOfActivePassageDates.add(log.date);
      }
    });

    let watchDates = new Set<string>();
    const position = (crewProfile.position || '').toLowerCase();
    const role = (crewProfile.role || '').toLowerCase();
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
    const isOfficer =
      role === 'captain' ||
      role === 'admin' ||
      officerPositions.some((op) => position.includes(op));

    if (hasApprovedAccess && isOfficer && crewProfile.id) {
      const { data: watchLogs } = await supabase
        .from('watch_logs')
        .select('watch_start')
        .eq('user_id', crewProfile.id)
        .eq('vessel_id', testimonial.vessel_id)
        .gte('watch_start', `${testimonial.start_date}T00:00:00`)
        .lte('watch_start', `${testimonial.end_date}T23:59:59`);

      if (watchLogs) {
        watchLogs.forEach((log) => {
          const dateStr = formatDate(new Date(log.watch_start), 'yyyy-MM-dd');
          watchDates.add(dateStr);
        });
      }
    }

    const { standbyPeriods: calculatedPeriods, voyages } = calculateStandbyDays(
      filteredLogs,
      watchDates.size > 0 ? watchDates : undefined,
      partOfActivePassageDates.size > 0 ? partOfActivePassageDates : undefined,
      { rangeStart: testimonial.start_date, rangeEnd: testimonial.end_date },
    );

    const logMapByDate = new Map<string, string>();
    filteredLogs.forEach((log) => {
      logMapByDate.set(log.date, (log.state as string) || '');
    });

    const mapped = calculatedPeriods.map((period, index) => {
      const voyage = voyages[index];
      const standbyStartDate = formatDate(period.startDate, 'yyyy-MM-dd');
      const standbyEndDate =
        period.countedDays > 0
          ? formatDate(addDays(period.startDate, period.countedDays - 1), 'yyyy-MM-dd')
          : standbyStartDate;
      if (!voyage) {
        const voyageEndDate = new Date(period.startDate);
        voyageEndDate.setDate(voyageEndDate.getDate() - 1);
        const voyageStartDate = new Date(voyageEndDate);
        voyageStartDate.setDate(
          voyageStartDate.getDate() - (period.precedingVoyageDays || 0) + 1,
        );
        return {
          passageStartDate: formatDate(voyageStartDate, 'yyyy-MM-dd'),
          passageEndDate: formatDate(voyageEndDate, 'yyyy-MM-dd'),
          standbyStartDate,
          standbyEndDate,
          standbyDays: period.countedDays,
          period,
        };
      }
      const voyageStart =
        voyage.startDate instanceof Date ? voyage.startDate : new Date(voyage.startDate);
      const voyageEnd = voyage.endDate instanceof Date ? voyage.endDate : new Date(voyage.endDate);
      return {
        passageStartDate: formatDate(voyageStart, 'yyyy-MM-dd'),
        passageEndDate: formatDate(voyageEnd, 'yyyy-MM-dd'),
        standbyStartDate,
        standbyEndDate,
        standbyDays: period.countedDays,
        period,
      };
    });

    standbyPeriods = mapped
      .filter(({ period }) => {
        if (period.countedDays <= 0) return false;
        for (let i = 0; i < period.countedDays; i++) {
          const d = addDays(period.startDate, i);
          const dateStr = formatDate(d, 'yyyy-MM-dd');
          const state = logMapByDate.get(dateStr);
          if (state === 'in-yard' || state === 'on-leave') {
            return false;
          }
        }
        return true;
      })
      .map(
        ({
          passageStartDate,
          passageEndDate,
          standbyStartDate,
          standbyEndDate,
          standbyDays,
        }) => ({
          passageStartDate,
          passageEndDate,
          standbyStartDate,
          standbyEndDate,
          standbyDays,
        }),
      );
  } catch (error) {
    console.error('[downloadVesselGeneratedTestimonialForCrew] standby periods:', error);
  }

  const p = crewProfile as Record<string, unknown>;
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
      captain_name: testimonial.generated_by_name,
      captain_email: testimonial.generated_by_email,
      captain_position: null,
      captain_signature: null,
      captain_comment_conduct: null,
      captain_comment_ability: null,
      captain_comment_general: null,
      official_body: null,
      official_reference: null,
      notes: testimonial.notes,
      testimonial_code: null,
      status: 'approved' as const,
      signoff_used_at: null,
      approved_at: testimonial.created_at,
      created_at: testimonial.created_at,
      updated_at: testimonial.updated_at,
    },
    userProfile: {
      firstName: crewProfile.firstName,
      lastName: crewProfile.lastName,
      username: crewProfile.username,
      email: crewProfile.email || '',
      dateOfBirth: (p.date_of_birth as string) || (p.dateOfBirth as string) || null,
      position: crewProfile.position || null,
      dischargeBookNumber:
        (p.discharge_book_number as string) || (p.dischargeBookNumber as string) || null,
    },
    vessel: {
      name: vessel.name,
      type: vessel.type || null,
      officialNumber: vessel.officialNumber || vessel.imo || null,
      flag_state: vessel.flag || vessel.flag_state || null,
      length_m: vessel.length_m || null,
      gross_tonnage: vessel.gross_tonnage || null,
      call_sign: vessel.call_sign || null,
    },
    captainProfile: null,
    companyDetails: {
      name: vessel.management_company || null,
      address: vessel.company_address || null,
      contactDetails: vessel.company_contact || null,
    },
    standbyPeriods: standbyPeriods.length > 0 ? standbyPeriods : undefined,
  };

  if (format === 'mca') {
    const position = (crewProfile.position || '').toLowerCase();
    const role = (crewProfile.role || '').toLowerCase();
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
        sjCode: null,
        documentType: 'testimonial' as const,
        generatedAt: new Date().toISOString(),
        generatedBy: {
          userId: testimonial.vessel_user_id,
          email: testimonial.generated_by_email || undefined,
          name: testimonial.generated_by_name,
        },
      },
    };

    if (isOfficerUser) {
      await generateMCAOfficerTestimonial(testimonialDataWithReceipt, output);
    } else {
      await generateMCADeckhandTestimonial(testimonialDataWithReceipt, output);
    }
  } else {
    await generateTestimonialPDF(testimonialData, format, output, {
      debug: process.env.NEXT_PUBLIC_PDF_DEBUG === 'true',
    });
  }
}
