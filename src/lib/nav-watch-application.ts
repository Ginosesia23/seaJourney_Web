import { format, parse } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getVesselStateLogs, getVesselAssignments } from '@/supabase/database/queries';
import { generateMCAWatchRatingForm } from '@/lib/pdf-generator';
import type { UserProfile, Vessel } from '@/lib/types';
import type { StateLog } from '@/lib/types';

/** Leave period as date range (inclusive) */
type LeaveInterval = { start: Date; end: Date };

/**
 * Split a service period into contiguous segments by excluding leave periods.
 * Each segment is a continuous block of service (no leave in the middle).
 * If there are no leave periods, returns a single segment [periodStart, periodEnd].
 */
function splitPeriodByLeave(
  periodStart: Date,
  periodEnd: Date,
  leavePeriods: LeaveInterval[]
): Array<{ start: Date; end: Date }> {
  if (leavePeriods.length === 0) {
    return [{ start: new Date(periodStart), end: new Date(periodEnd) }];
  }
  const sorted = [...leavePeriods].sort((a, b) => a.start.getTime() - b.start.getTime());
  const segments: Array<{ start: Date; end: Date }> = [];
  let currentStart = periodStart.getTime();
  const periodEndTime = periodEnd.getTime();

  for (const leave of sorted) {
    const leaveStart = Math.max(leave.start.getTime(), currentStart);
    const leaveEnd = Math.min(leave.end.getTime(), periodEndTime);
    if (leaveEnd < currentStart) continue;
    if (leaveStart > periodEndTime) break;
    // Service segment ends the day before leave starts
    const segmentEnd = leaveStart - 24 * 60 * 60 * 1000;
    if (segmentEnd >= currentStart) {
      segments.push({ start: new Date(currentStart), end: new Date(segmentEnd) });
    }
    // Next service segment starts the day after leave ends
    currentStart = leaveEnd + 24 * 60 * 60 * 1000;
    if (currentStart > periodEndTime) break;
  }

  if (currentStart <= periodEndTime) {
    segments.push({ start: new Date(currentStart), end: new Date(periodEnd) });
  }
  return segments;
}

/** Fetch watch log dates (YYYY-MM-DD) for an officer on a vessel within a date range. Returns empty set if not officer or no logs. */
async function getWatchDatesForVessel(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<Set<string>> {
  const startStr = format(periodStart, 'yyyy-MM-dd');
  const endStr = format(periodEnd, 'yyyy-MM-dd');
  const { data: watchLogs, error } = await supabase
    .from('watch_logs')
    .select('watch_start')
    .eq('user_id', userId)
    .eq('vessel_id', vesselId)
    .gte('watch_start', `${startStr}T00:00:00`)
    .lte('watch_start', `${endStr}T23:59:59`);
  if (error || !watchLogs || watchLogs.length === 0) return new Set();
  const dates = new Set<string>();
  watchLogs.forEach((log: { watch_start: string }) => {
    dates.add(format(new Date(log.watch_start), 'yyyy-MM-dd'));
  });
  return dates;
}

/** Derive leave periods from state logs (consecutive 'on-leave' days) */
function getLeavePeriodsFromLogs(logs: StateLog[]): LeaveInterval[] {
  const onLeave = logs
    .filter(log => log.state === 'on-leave')
    .sort((a, b) => a.date.localeCompare(b.date));
  if (onLeave.length === 0) return [];
  const periods: LeaveInterval[] = [];
  let start = onLeave[0].date;
  let end = onLeave[0].date;

  for (let i = 1; i < onLeave.length; i++) {
    const prev = new Date(onLeave[i - 1].date);
    const curr = new Date(onLeave[i].date);
    const daysDiff = Math.floor((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
    if (daysDiff <= 1) {
      end = onLeave[i].date;
    } else {
      periods.push({ start: new Date(start), end: new Date(end) });
      start = onLeave[i].date;
      end = onLeave[i].date;
    }
  }
  periods.push({ start: new Date(start), end: new Date(end) });
  return periods;
}

export const navWatchApplicationSchema = z.object({
  certificate_type: z.enum(['navigational_ii4', 'navigational_iii4', 'electro_technical'], {
    required_error: 'Please select a certificate type.',
  }),
  checklist: z.object({
    attestedPassport: z.boolean().optional(),
    payment: z.boolean().optional(),
    dischargeBookOrCd: z.boolean().optional(),
    seaServiceTestimonials: z.boolean().optional(),
    passportPhoto: z.boolean().optional(),
    stcwBasicTraining: z.boolean().optional(),
    securityAwareness: z.boolean().optional(),
    profInSurvivalCraft: z.boolean().optional(),
    medical: z.boolean().optional(),
    watchRatingTrainingRecordBook: z.boolean().optional(),
    mntb: z.boolean().optional(),
  }).optional(),
  checklistETR: z.object({
    attestedPassport: z.boolean().optional(),
    payment: z.boolean().optional(),
    dischargeBookOrCd: z.boolean().optional(),
    seaServiceTestimonials: z.boolean().optional(),
    passportPhoto: z.boolean().optional(),
    stcwBasicTraining: z.boolean().optional(),
    securityAwareness: z.boolean().optional(),
    electroTechnicalTraining: z.boolean().optional(),
    medical: z.boolean().optional(),
    electroTechnicalRecordBook: z.boolean().optional(),
  }).optional(),
  includeCountersign: z.boolean().optional(),
  counterSign: z.object({
    name: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    townCity: z.string().optional(),
    countyState: z.string().optional(),
    postCode: z.string().optional(),
    country: z.string().optional(),
    telephone: z.string().optional(),
    occupation: z.string().optional(),
    capacityKnownApplicant: z.string().optional(),
    date: z.string().optional(),
  }).optional(),
  signatureDataUrl: z.string().optional(),
  watchkeeping_hours: z.number().min(0, 'Watchkeeping hours must be positive').optional(),
  paymentRegion: z.enum(['uk', 'eu', 'row']).optional(),
});

export type NavWatchApplicationFormValues = z.infer<typeof navWatchApplicationSchema>;

export const navWatchApplicationDefaultValues: NavWatchApplicationFormValues = {
  certificate_type: 'navigational_ii4',
  checklist: {
    attestedPassport: false,
    payment: false,
    dischargeBookOrCd: false,
    seaServiceTestimonials: false,
    passportPhoto: false,
    stcwBasicTraining: false,
    securityAwareness: false,
    profInSurvivalCraft: false,
    medical: false,
    watchRatingTrainingRecordBook: false,
    mntb: false,
  },
  checklistETR: {
    attestedPassport: false,
    payment: false,
    dischargeBookOrCd: false,
    seaServiceTestimonials: false,
    passportPhoto: false,
    stcwBasicTraining: false,
    securityAwareness: false,
    electroTechnicalTraining: false,
    medical: false,
    electroTechnicalRecordBook: false,
  },
  includeCountersign: false,
  counterSign: undefined,
  signatureDataUrl: undefined,
  watchkeeping_hours: undefined,
  paymentRegion: undefined,
};

export interface BuildAndGenerateNavWatchOptions {
  userId: string;
  userProfile: UserProfile;
  formData: NavWatchApplicationFormValues;
  allVessels: Vessel[] | undefined;
  /** When generating as vessel for a crew member, set so the document is saved and listed under that vessel */
  vesselId?: string | null;
  vesselUserId?: string | null;
}

/** Build sea service, save application, and generate MCA Watch Rating PDF. Used by both crew (Documents) and vessel (Crew page). */
export async function buildAndGenerateNavWatchApplication(
  supabase: SupabaseClient,
  options: BuildAndGenerateNavWatchOptions
): Promise<void> {
  const { userId, userProfile, formData: data, allVessels, vesselId, vesselUserId } = options;

  const seaServiceRecords: Array<{
    vesselName: string;
    flag: string;
    imoNumber?: string;
    grossTonnage?: number;
    kilowatts?: number;
    length?: number;
    capacity?: string;
    fromDate: string;
    toDate: string;
    totalDays: number;
    daysAtSea: number;
  }> = [];

  const position = ((userProfile as any).position || userProfile.position || '').toString().toLowerCase();
  const isOfficer = position.includes('officer') || position.includes('captain') || position.includes('engineer') || position.includes('mate');

  const { data: approvedTestimonials, error: testimonialsError } = await supabase
    .from('testimonials')
    .select('*, vessels(*)')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .order('start_date', { ascending: true });

  if (!testimonialsError && approvedTestimonials && approvedTestimonials.length > 0) {
    const vesselTestimonialsMap = new Map<string, typeof approvedTestimonials>();
    for (const t of approvedTestimonials) {
      const vid = t.vessel_id;
      if (!vesselTestimonialsMap.has(vid)) vesselTestimonialsMap.set(vid, []);
      vesselTestimonialsMap.get(vid)!.push(t);
    }
    for (const [vid, testimonials] of vesselTestimonialsMap.entries()) {
      const vessel = testimonials[0].vessels as any;
      if (!vessel) continue;
      let earliestStart = new Date(testimonials[0].start_date);
      let latestEnd: Date | null = testimonials[0].end_date ? new Date(testimonials[0].end_date) : null;
      for (const t of testimonials) {
        const startDate = new Date(t.start_date);
        if (startDate < earliestStart) earliestStart = startDate;
        if (t.end_date) {
          const endDate = new Date(t.end_date);
          if (!latestEnd || endDate > latestEnd) latestEnd = endDate;
        } else latestEnd = new Date();
      }
      const periodEnd = latestEnd || new Date();
      const logs = await getVesselStateLogs(supabase, vid, userId);
      const periodLogs = logs.filter(log => {
        const logDate = new Date(log.date);
        return logDate >= earliestStart && logDate <= periodEnd;
      });
      const leaveFromLogs = getLeavePeriodsFromLogs(periodLogs);
      const { data: crewLeaveRows } = await supabase
        .from('crew_leave_periods')
        .select('start_date, end_date')
        .eq('crew_user_id', userId)
        .eq('vessel_id', vid)
        .order('start_date', { ascending: true });
      const leaveFromDb: LeaveInterval[] = (crewLeaveRows || []).map((r: { start_date: string; end_date: string }) => ({
        start: new Date(r.start_date),
        end: new Date(r.end_date),
      }));
      const allLeave = [...leaveFromLogs, ...leaveFromDb].sort((a, b) => a.start.getTime() - b.start.getTime());
      const segments = splitPeriodByLeave(earliestStart, periodEnd, allLeave);
      const capacity = (userProfile as any).position || userProfile.position || undefined;
      const watchDates = isOfficer ? await getWatchDatesForVessel(supabase, userId, vid, earliestStart, periodEnd) : new Set<string>();
      for (const seg of segments) {
        const segLogs = periodLogs.filter(log => {
          const d = new Date(log.date);
          return d >= seg.start && d <= seg.end;
        });
        const underwayCount = segLogs.filter(log => log.state === 'underway').length;
        const watchDaysInSegment = watchDates.size === 0 ? 0 : Array.from(watchDates).filter(dStr => {
          const d = new Date(dStr);
          if (d < seg.start || d > seg.end) return false;
          const log = segLogs.find(l => l.date === dStr);
          return log && log.state !== 'underway';
        }).length;
        const daysAtSea = underwayCount + watchDaysInSegment;
        const totalDays = Math.floor((seg.end.getTime() - seg.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        seaServiceRecords.push({
          vesselName: vessel.name || 'Unknown Vessel',
          flag: (vessel.flag || vessel.flag_state) || '—',
          imoNumber: vessel.official_number || vessel.imo,
          grossTonnage: vessel.gross_tonnage,
          kilowatts: undefined,
          length: vessel.length_m,
          capacity,
          fromDate: format(seg.start, 'dd/MM/yyyy'),
          toDate: format(seg.end, 'dd/MM/yyyy'),
          totalDays,
          daysAtSea,
        });
      }
    }
  }

  const assignments = await getVesselAssignments(supabase, userId);
  const processedVesselIds = new Set<string>();
  approvedTestimonials?.forEach(t => { if (t.vessel_id) processedVesselIds.add(t.vessel_id); });
  const vesselServiceMap = new Map<string, Array<{ start: Date; end: Date | null; position?: string }>>();
  assignments.forEach((a) => {
    if (!vesselServiceMap.has(a.vesselId)) vesselServiceMap.set(a.vesselId, []);
    vesselServiceMap.get(a.vesselId)!.push({
      start: new Date(a.startDate),
      end: a.endDate ? new Date(a.endDate) : null,
      position: a.position || undefined,
    });
  });

  const vesselsToProcess = allVessels || [];
  for (const vessel of vesselsToProcess) {
    if (processedVesselIds.has(vessel.id)) continue;
    const periods = vesselServiceMap.get(vessel.id);
    if (!periods || periods.length === 0) continue;
    let earliestStart = periods[0].start;
    let latestEnd: Date | null = periods[0].end;
    for (const p of periods) {
      if (p.start < earliestStart) earliestStart = p.start;
      if (p.end) { if (!latestEnd || p.end > latestEnd) latestEnd = p.end; } else latestEnd = new Date();
    }
    const periodEnd = latestEnd || new Date();
    const mostRecentPeriod = periods.reduce((latest, cur) => (!latest.end || (cur.end && cur.end > latest.end)) ? cur : latest);
    const capacity = mostRecentPeriod.position || (userProfile as any).position || userProfile.position;
    const logs = await getVesselStateLogs(supabase, vessel.id, userId);
    const periodLogs = logs.filter(log => {
      const logDate = new Date(log.date);
      return logDate >= earliestStart && logDate <= periodEnd;
    });
    const leaveFromLogs = getLeavePeriodsFromLogs(periodLogs);
    const { data: crewLeaveRows } = await supabase
      .from('crew_leave_periods')
      .select('start_date, end_date')
      .eq('crew_user_id', userId)
      .eq('vessel_id', vessel.id)
      .order('start_date', { ascending: true });
    const leaveFromDb: LeaveInterval[] = (crewLeaveRows || []).map((r: { start_date: string; end_date: string }) => ({
      start: new Date(r.start_date),
      end: new Date(r.end_date),
    }));
    const allLeave = [...leaveFromLogs, ...leaveFromDb].sort((a, b) => a.start.getTime() - b.start.getTime());
    const segments = splitPeriodByLeave(earliestStart, periodEnd, allLeave);
    const watchDates = isOfficer ? await getWatchDatesForVessel(supabase, userId, vessel.id, earliestStart, periodEnd) : new Set<string>();
    for (const seg of segments) {
      const segLogs = periodLogs.filter(log => {
        const d = new Date(log.date);
        return d >= seg.start && d <= seg.end;
      });
      const underwayCount = segLogs.filter(log => log.state === 'underway').length;
      const watchDaysInSegment = watchDates.size === 0 ? 0 : Array.from(watchDates).filter(dStr => {
        const d = new Date(dStr);
        if (d < seg.start || d > seg.end) return false;
        const log = segLogs.find(l => l.date === dStr);
        return log && log.state !== 'underway';
      }).length;
      const daysAtSea = underwayCount + watchDaysInSegment;
      const totalDays = Math.floor((seg.end.getTime() - seg.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      seaServiceRecords.push({
        vesselName: vessel.name || 'Unknown Vessel',
        flag: (vessel as any).flag || (vessel as any).flag_state || '—',
        imoNumber: (vessel as any).official_number || (vessel as any).officialNumber || (vessel as any).imo,
        grossTonnage: vessel.gross_tonnage,
        kilowatts: undefined,
        length: vessel.length_m,
        capacity,
        fromDate: format(seg.start, 'dd/MM/yyyy'),
        toDate: format(seg.end, 'dd/MM/yyyy'),
        totalDays,
        daysAtSea,
      });
    }
  }

  const dateOfBirth = (userProfile as any).dateOfBirth
    ? format(parse((userProfile as any).dateOfBirth, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')
    : '';
  const surname = userProfile.lastName || (userProfile.username?.includes(' ') ? userProfile.username.split(' ').slice(-1)[0] : userProfile.username?.split(' ')[0] || '');
  const forenames = userProfile.firstName || (userProfile.username?.includes(' ') ? userProfile.username.split(' ').slice(0, -1).join(' ') || userProfile.username : '');

  const getProfileField = (snake: string, camel: string): string | undefined => {
    const v = (userProfile as any)[snake] ?? (userProfile as any)[camel];
    return v && String(v).trim() ? String(v).trim() : undefined;
  };
  const mcaDetails = {
    title: getProfileField('title', 'title'),
    placeOfBirth: getProfileField('place_of_birth', 'placeOfBirth'),
    countryOfBirth: getProfileField('country_of_birth', 'countryOfBirth'),
    nationality: getProfileField('nationality', 'nationality'),
    telephone: getProfileField('telephone', 'telephone'),
    mobile: getProfileField('mobile', 'mobile'),
    addressLine1: getProfileField('address_line1', 'addressLine1') || '',
    addressLine2: getProfileField('address_line2', 'addressLine2'),
    addressDistrict: getProfileField('address_district', 'addressDistrict'),
    addressTownCity: getProfileField('address_town_city', 'addressTownCity') || '',
    addressCountyState: getProfileField('address_county_state', 'addressCountyState'),
    addressPostCode: getProfileField('address_post_code', 'addressPostCode') || '',
    addressCountry: getProfileField('address_country', 'addressCountry') || '',
  };

  const certificateTypeLabels: Record<string, string> = {
    navigational_ii4: 'Navigational Watch Rating Certificate II/4',
    navigational_iii4: 'Engine Room Watch Rating Certificate III/4',
    electro_technical: 'Electro-technical Rating III/7',
  };
  const personalDetailsData = {
    title: mcaDetails.title,
    surname,
    forenames: forenames || surname,
    dateOfBirth,
    placeOfBirth: mcaDetails.placeOfBirth,
    countryOfBirth: mcaDetails.countryOfBirth,
    nationality: mcaDetails.nationality,
    address: {
      line1: mcaDetails.addressLine1,
      line2: mcaDetails.addressLine2,
      district: mcaDetails.addressDistrict,
      townCity: mcaDetails.addressTownCity,
      countyState: mcaDetails.addressCountyState,
      postCode: mcaDetails.addressPostCode,
      country: mcaDetails.addressCountry,
    },
    telephone: mcaDetails.telephone,
    mobile: mcaDetails.mobile,
    email: userProfile.email || '',
    certificateTypeSelected: certificateTypeLabels[data.certificate_type] || data.certificate_type,
    checklistNavEngine: (data.certificate_type !== 'electro_technical' && data.checklist) ? data.checklist : null,
    checklistETR: (data.certificate_type === 'electro_technical' && data.checklistETR) ? data.checklistETR : null,
    counterSign: (data.includeCountersign && data.counterSign) ? { ...data.counterSign, signatureDataUrl: undefined } : null,
    signatureDataUrl: data.signatureDataUrl || null,
  };

  const certificateTypeValue = data.certificate_type === 'electro_technical'
    ? 'electro_technical'
    : data.certificate_type === 'navigational_iii4'
      ? 'engine_room'
      : 'navigational';

  let applicationId: string | undefined;
  const insertPayload: Record<string, unknown> = {
    user_id: userId,
    certificate_type: certificateTypeValue,
    personal_details: personalDetailsData,
    sea_service_records: seaServiceRecords,
  };
  if (vesselId) insertPayload.vessel_id = vesselId;
  if (vesselUserId) insertPayload.vessel_user_id = vesselUserId;

  const { data: savedApplication, error: saveError } = await supabase
    .from('nav_watch_applications')
    .insert(insertPayload)
    .select()
    .single();

  if (!saveError && savedApplication) applicationId = savedApplication.id;

  await generateMCAWatchRatingForm({
    personalDetails: personalDetailsData,
    certificateType: certificateTypeValue,
    seaServiceRecords,
    paymentRegion: data.paymentRegion,
    userProfile: {
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      username: userProfile.username ?? '',
      email: userProfile.email || '',
      dateOfBirth: (userProfile as any).dateOfBirth || null,
      position: userProfile.position || null,
      dischargeBookNumber: userProfile.dischargeBookNumber || null,
    },
    receiptData: {
      documentId: applicationId,
      documentType: 'nav_watch',
      generatedAt: new Date().toISOString(),
      generatedBy: { userId, email: userProfile.email || undefined },
    },
  }, 'download');
}
