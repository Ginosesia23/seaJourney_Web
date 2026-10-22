import { classifyCertificateValidity } from '@/lib/applications/evaluate-requirements';
import {
  ACTIVITY_RAIL_INBOX_HREF,
  ACTIVITY_RAIL_LOG_LOOKBACK_DAYS,
  activityRailDaysUntil,
  addActivityRailUtcDays,
  countActivityRailItems,
  laterActivityRailYmd,
  resolveActivityRailLogWindowStart,
  sortActivityRailItems,
  summarizeActivityRailLogGaps,
  type ActivityRailItem,
  type ActivityRailPayload,
} from '@/lib/activity-rail';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { listPendingCoverageForManager } from '@/lib/vessel-plan-coverage';

const CERT_SELECT =
  'id, user_id, certificate_name, expiry_date, renewal_notice_days';
const MAX_ITEMS = 48;
const MAX_CREW_IDS = 80;

type ActorRow = {
  id: string;
  role?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
  discharge_book_number?: string | null;
  position?: string | null;
  signature?: string | null;
  active_vessel_id?: string | null;
  start_date?: string | null;
};

type CertificateRow = {
  id: string;
  user_id: string;
  certificate_name?: string | null;
  expiry_date?: string | null;
  renewal_notice_days?: number | null;
};

type VisaRow = {
  id: string;
  area_name?: string | null;
  expire_date?: string | null;
};

type VesselRow = {
  id: string;
  name?: string | null;
  type?: string | null;
  flag?: string | null;
  imo?: string | null;
  official_number?: string | null;
  stamp?: string | null;
  ais_tracking_enabled?: boolean | null;
  ais_last_sync_error?: string | null;
};

function isBlank(value: unknown): boolean {
  return value == null || String(value).trim() === '';
}

function displayName(
  first?: string | null,
  last?: string | null,
  fallback = 'Crew member',
): string {
  const full = [first, last].filter((part) => !isBlank(part)).join(' ').trim();
  return full || fallback;
}

function certTitle(row: CertificateRow): string {
  return (row.certificate_name || 'Certificate').trim() || 'Certificate';
}

async function settled<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error('[activity-rail]', error);
    return fallback;
  }
}

function profileMissingItems(actor: ActorRow): ActivityRailItem[] {
  const role = String(actor.role || '').toLowerCase();
  if (role === 'vessel' || role === 'admin') return [];

  const missing: string[] = [];
  if (isBlank(actor.first_name)) missing.push('first name');
  if (isBlank(actor.last_name)) missing.push('last name');
  if (isBlank(actor.nationality)) missing.push('nationality');
  if (isBlank(actor.date_of_birth)) missing.push('date of birth');
  if (isBlank(actor.discharge_book_number)) missing.push('discharge book number');
  if (isBlank(actor.position)) missing.push('position');

  if (missing.length === 0) return [];

  const listed =
    missing.length <= 3
      ? missing.join(', ')
      : `${missing.slice(0, 3).join(', ')} +${missing.length - 3} more`;

  return [
    {
      id: 'profile-incomplete',
      kind: 'profile_incomplete',
      category: 'missing',
      severity: missing.length >= 3 ? 'warning' : 'info',
      title: 'Profile details missing',
      description: `Add ${listed} so documents and applications stay complete.`,
      href: '/dashboard/profile',
    },
  ];
}

function signatureMissingItem(actor: ActorRow): ActivityRailItem[] {
  const role = String(actor.role || '').toLowerCase();
  if (role !== 'captain' || !isBlank(actor.signature)) return [];
  return [
    {
      id: 'signature-missing',
      kind: 'signature_missing',
      category: 'missing',
      severity: 'warning',
      title: 'Signature not saved',
      description: 'Add your signature so crew sign-offs can be completed.',
      href: '/dashboard/settings/signature',
    },
  ];
}

function certificateItems(
  rows: CertificateRow[],
  opts: { crewName?: string; href: string },
): ActivityRailItem[] {
  const items: ActivityRailItem[] = [];
  for (const row of rows) {
    const expiry = row.expiry_date || null;
    const notice =
      typeof row.renewal_notice_days === 'number' && row.renewal_notice_days > 0
        ? row.renewal_notice_days
        : 90;
    const status = classifyCertificateValidity(expiry, notice);
    if (status !== 'expired' && status !== 'expiring_soon') continue;

    const daysUntil = activityRailDaysUntil(expiry);
    const name = certTitle(row);
    const forCrew = opts.crewName ? ` for ${opts.crewName}` : '';
    const expired = status === 'expired';
    const kind = opts.crewName
      ? expired
        ? 'crew_certificate_expired'
        : 'crew_certificate_expiring'
      : expired
        ? 'certificate_expired'
        : 'certificate_expiring';

    items.push({
      id: `${kind}-${row.id}`,
      kind,
      category: expired ? 'overdue' : 'upcoming',
      severity: expired ? 'critical' : 'warning',
      title: expired ? `${name} expired` : `${name} expiring`,
      description: opts.crewName
        ? `${name}${forCrew} needs renewal.`
        : expired
          ? `${name} has expired and should be renewed.`
          : `${name} is due for renewal.`,
      href: opts.href,
      dueAt: expiry,
      daysUntil,
      meta: opts.crewName || null,
    });
  }
  return items;
}

function visaItems(rows: VisaRow[]): ActivityRailItem[] {
  return rows.flatMap((row) => {
    const expiry = row.expire_date || null;
    const status = classifyCertificateValidity(expiry, 90);
    if (status !== 'expired' && status !== 'expiring_soon') return [];
    const daysUntil = activityRailDaysUntil(expiry);
    const area = (row.area_name || 'Visa').trim() || 'Visa';
    const expired = status === 'expired';
    return [
      {
        id: `${expired ? 'visa_expired' : 'visa_expiring'}-${row.id}`,
        kind: expired ? 'visa_expired' : 'visa_expiring',
        category: expired ? 'overdue' : 'upcoming',
        severity: expired ? 'critical' : 'warning',
        title: expired ? `${area} visa expired` : `${area} visa expiring`,
        description: expired
          ? `${area} visa has expired.`
          : `${area} visa is coming up for renewal.`,
        href: '/dashboard/visa-tracker',
        dueAt: expiry,
        daysUntil,
      } satisfies ActivityRailItem,
    ];
  });
}

function vesselIncompleteItems(vessels: VesselRow[]): ActivityRailItem[] {
  return vessels.flatMap((vessel) => {
    const missing: string[] = [];
    if (isBlank(vessel.flag)) missing.push('flag');
    if (isBlank(vessel.imo) && isBlank(vessel.official_number)) {
      missing.push('IMO / official number');
    }
    if (isBlank(vessel.type)) missing.push('vessel type');
    if (isBlank(vessel.stamp)) missing.push('ship stamp');
    if (missing.length === 0) return [];
    const name = (vessel.name || 'Vessel').trim() || 'Vessel';
    return [
      {
        id: `vessel-incomplete-${vessel.id}`,
        kind: 'vessel_incomplete',
        category: 'missing',
        severity: missing.includes('ship stamp') ? 'warning' : 'info',
        title: `${name} details missing`,
        description: `Add ${missing.join(', ')} on the vessel profile.`,
        href: '/dashboard/profile',
        meta: name,
      } satisfies ActivityRailItem,
    ];
  });
}

function aisIssueItems(vessels: VesselRow[]): ActivityRailItem[] {
  return vessels.flatMap((vessel) => {
    if (!vessel.ais_tracking_enabled || isBlank(vessel.ais_last_sync_error)) {
      return [];
    }
    const name = (vessel.name || 'Vessel').trim() || 'Vessel';
    return [
      {
        id: `ais-sync-${vessel.id}`,
        kind: 'ais_sync_error',
        category: 'issue',
        severity: 'critical',
        title: `${name} AIS issue`,
        description: String(vessel.ais_last_sync_error).slice(0, 140),
        href: '/dashboard/ais-tracking',
        meta: name,
      } satisfies ActivityRailItem,
    ];
  });
}

async function loadOwnCertificates(userId: string): Promise<CertificateRow[]> {
  const { data } = await supabaseAdmin
    .from('certificates')
    .select(CERT_SELECT)
    .eq('user_id', userId)
    .not('expiry_date', 'is', null)
    .limit(80);
  return (data || []) as CertificateRow[];
}

async function loadOwnVisas(userId: string): Promise<VisaRow[]> {
  const { data } = await supabaseAdmin
    .from('visa_tracker')
    .select('id, area_name, expire_date')
    .eq('user_id', userId)
    .not('expire_date', 'is', null);
  return (data || []) as VisaRow[];
}

async function loadManagedVessels(userId: string): Promise<VesselRow[]> {
  const { data } = await supabaseAdmin
    .from('vessels')
    .select(
      'id, name, type, flag, imo, official_number, stamp, ais_tracking_enabled, ais_last_sync_error',
    )
    .eq('vessel_manager_id', userId);
  return (data || []) as VesselRow[];
}

async function loadCrewCertificateItems(
  vesselUserId: string,
  vesselIds: string[],
): Promise<ActivityRailItem[]> {
  if (vesselIds.length === 0) return [];

  const [{ data: assignments }, { data: access }] = await Promise.all([
    supabaseAdmin
      .from('vessel_assignments')
      .select('user_id, vessel_id')
      .in('vessel_id', vesselIds)
      .is('end_date', null),
    supabaseAdmin
      .from('vessel_sea_time_access_requests')
      .select('crew_user_id')
      .eq('vessel_user_id', vesselUserId)
      .eq('status', 'approved'),
  ]);

  const allowed = new Set(
    (access || [])
      .map((row) => String((row as { crew_user_id?: string }).crew_user_id || ''))
      .filter(Boolean),
  );

  const crewIds = Array.from(
    new Set(
      (assignments || [])
        .map((row) => String((row as { user_id?: string }).user_id || ''))
        .filter((id) => id && allowed.has(id)),
    ),
  ).slice(0, MAX_CREW_IDS);

  if (crewIds.length === 0) return [];

  const [{ data: certs }, { data: profiles }] = await Promise.all([
    supabaseAdmin
      .from('certificates')
      .select(CERT_SELECT)
      .in('user_id', crewIds)
      .not('expiry_date', 'is', null)
      .limit(120),
    supabaseAdmin
      .from('users')
      .select('id, first_name, last_name')
      .in('id', crewIds),
  ]);

  const nameById = new Map<string, string>();
  for (const profile of profiles || []) {
    const row = profile as {
      id: string;
      first_name?: string | null;
      last_name?: string | null;
    };
    nameById.set(row.id, displayName(row.first_name, row.last_name));
  }

  const items: ActivityRailItem[] = [];
  for (const cert of (certs || []) as CertificateRow[]) {
    items.push(
      ...certificateItems([cert], {
        crewName: nameById.get(cert.user_id),
        href: '/dashboard/crew',
      }),
    );
  }
  return items;
}

async function loadPendingSignoffs(
  actor: ActorRow,
): Promise<ActivityRailItem[]> {
  const role = String(actor.role || '').toLowerCase();
  if (role !== 'captain' && role !== 'vessel' && role !== 'admin') return [];

  let query = supabaseAdmin
    .from('testimonials')
    .select(
      'id, user_id, start_date, end_date, signoff_token_expires_at, captain_user_id, captain_email',
    )
    .eq('status', 'pending_captain')
    .limit(20);

  if (role !== 'admin') {
    const email = (actor.email || '').replace(/[,()]/g, '').trim();
    if (actor.id && email) {
      query = query.or(
        `captain_user_id.eq.${actor.id},captain_email.ilike.${email}`,
      );
    } else {
      query = query.eq('captain_user_id', actor.id);
    }
  }

  const { data } = await query;
  const rows = (data || []) as Array<{
    id: string;
    user_id?: string | null;
    end_date?: string | null;
    signoff_token_expires_at?: string | null;
  }>;
  if (rows.length === 0) return [];

  const crewIds = Array.from(
    new Set(rows.map((row) => row.user_id).filter((id): id is string => !!id)),
  );
  const { data: profiles } = crewIds.length
    ? await supabaseAdmin
        .from('users')
        .select('id, first_name, last_name')
        .in('id', crewIds)
    : { data: [] as Array<{ id: string; first_name?: string | null; last_name?: string | null }> };

  const nameById = new Map<string, string>();
  for (const profile of profiles || []) {
    nameById.set(
      profile.id,
      displayName(profile.first_name, profile.last_name),
    );
  }

  return rows.map((row) => {
    const dueRaw = row.signoff_token_expires_at || row.end_date || null;
    const dueAt = dueRaw ? String(dueRaw).slice(0, 10) : null;
    const daysUntil = activityRailDaysUntil(dueAt);
    const overdue = daysUntil != null && daysUntil < 0;
    const crew = row.user_id
      ? nameById.get(row.user_id) || 'crew member'
      : 'crew member';
    return {
      id: `pending-signoff-${row.id}`,
      kind: 'pending_signoff' as const,
      category: overdue ? 'overdue' : 'issue',
      severity: overdue ? 'critical' : 'warning',
      title: overdue ? 'Sign-off overdue' : 'Sign-off waiting',
      description: `Testimonial for ${crew} still needs a captain signature.`,
      href: ACTIVITY_RAIL_INBOX_HREF,
      dueAt,
      daysUntil,
      meta: crew,
    };
  });
}

async function loadCrewPendingTestimonials(
  userId: string,
): Promise<ActivityRailItem[]> {
  const { count } = await supabaseAdmin
    .from('testimonials')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending_captain');
  if (!count) return [];
  return [
    {
      id: 'pending-testimonial-sent',
      kind: 'pending_testimonial',
      category: 'upcoming',
      severity: 'info',
      title:
        count === 1
          ? 'Testimonial awaiting sign-off'
          : `${count} testimonials awaiting sign-off`,
      description: 'Sent to a captain and still waiting for a signature.',
      href: '/dashboard/career-documents',
    },
  ];
}

async function loadVesselSeaTimeRequests(
  vesselId: string | null,
): Promise<ActivityRailItem[]> {
  if (!vesselId) return [];
  const { count } = await supabaseAdmin
    .from('sea_time_requests')
    .select('id', { count: 'exact', head: true })
    .eq('vessel_id', vesselId)
    .eq('status', 'pending');
  if (!count) return [];
  return [
    {
      id: 'pending-sea-time',
      kind: 'pending_sea_time',
      category: 'issue',
      severity: 'warning',
      title:
        count === 1
          ? 'Sea-time request pending'
          : `${count} sea-time requests pending`,
      description: 'Crew are waiting for this import to be reviewed in Inbox.',
      href: ACTIVITY_RAIL_INBOX_HREF,
    },
  ];
}

async function loadPlanCoverageItems(userId: string): Promise<ActivityRailItem[]> {
  const rows = await listPendingCoverageForManager(userId);
  if (!rows.length) return [];
  const names = Array.from(
    new Set(rows.map((row) => (row.vessel_name || '').trim()).filter(Boolean)),
  );
  const vesselLabel =
    names.length === 1 ? names[0] : names.length > 1 ? `${names.length} vessels` : 'this vessel';
  return [
    {
      id: 'pending-plan-coverage',
      kind: 'pending_plan_coverage',
      category: 'issue',
      severity: 'warning',
      title:
        rows.length === 1
          ? 'Plan coverage waiting'
          : `${rows.length} plan coverage requests waiting`,
      description: `Approve or decline so crew can pause their personal plan under ${vesselLabel}.`,
      href: ACTIVITY_RAIL_INBOX_HREF,
    },
  ];
}

async function loadCrewSeaTimeOffers(userId: string): Promise<ActivityRailItem[]> {
  const { data, error } = await supabaseAdmin
    .from('vessel_sea_time_offers')
    .select('id, vessel_id')
    .eq('crew_user_id', userId)
    .eq('status', 'pending')
    .limit(20);
  if (error) {
    console.error('[activity-rail] vessel_sea_time_offers', error);
    return [];
  }
  const rows = (data || []) as Array<{ id: string; vessel_id?: string | null }>;
  if (rows.length === 0) return [];
  const vesselIds = Array.from(
    new Set(rows.map((row) => row.vessel_id).filter((id): id is string => !!id)),
  );
  const names = await loadVesselNames(vesselIds);
  const vesselLabel =
    names.length === 1
      ? names[0]
      : names.length > 1
        ? `${names.length} vessels`
        : 'a vessel';
  return [
    {
      id: 'pending-sea-time-offer',
      kind: 'pending_sea_time_offer',
      category: 'issue',
      severity: 'warning',
      title:
        rows.length === 1
          ? `${vesselLabel} sent you sea time`
          : `${rows.length} sea-time imports waiting`,
      description: 'Accept or decline this import in Inbox. Nothing is copied until you decide.',
      href: ACTIVITY_RAIL_INBOX_HREF,
      meta: vesselLabel,
    },
  ];
}

async function loadCrewSeaTimeAccessRequests(
  userId: string,
): Promise<ActivityRailItem[]> {
  const { data, error } = await supabaseAdmin
    .from('vessel_sea_time_access_requests')
    .select('id, vessel_name')
    .eq('crew_user_id', userId)
    .eq('status', 'pending')
    .limit(20);
  if (error) {
    console.error('[activity-rail] vessel_sea_time_access_requests', error);
    return [];
  }
  const rows = (data || []) as Array<{ id: string; vessel_name?: string | null }>;
  if (rows.length === 0) return [];
  const names = Array.from(
    new Set(rows.map((row) => (row.vessel_name || '').trim()).filter(Boolean)),
  );
  const vesselLabel =
    names.length === 1 ? names[0] : names.length > 1 ? `${names.length} vessels` : 'a vessel';
  return [
    {
      id: 'pending-sea-time-access',
      kind: 'pending_sea_time_access',
      category: 'issue',
      severity: 'warning',
      title:
        rows.length === 1
          ? `${vesselLabel} asked for sea-time access`
          : `${rows.length} sea-time access requests waiting`,
      description: 'Approve or decline in Inbox before they can view your records.',
      href: ACTIVITY_RAIL_INBOX_HREF,
      meta: vesselLabel,
    },
  ];
}

async function loadVesselClaimItems(
  vesselId: string | null,
): Promise<ActivityRailItem[]> {
  if (!vesselId) return [];
  const { count } = await supabaseAdmin
    .from('vessel_claim_requests')
    .select('id', { count: 'exact', head: true })
    .eq('vessel_id', vesselId)
    .in('status', ['pending', 'admin_approved']);
  if (!count) return [];
  return [
    {
      id: 'pending-vessel-claim',
      kind: 'pending_claim',
      category: 'issue',
      severity: 'warning',
      title:
        count === 1
          ? 'Captaincy claim waiting'
          : `${count} captaincy claims waiting`,
      description: 'Someone asked to be assigned as captain. Review it in Inbox.',
      href: ACTIVITY_RAIL_INBOX_HREF,
    },
  ];
}

async function loadTrainingSignoffItems(
  actor: ActorRow,
): Promise<ActivityRailItem[]> {
  const role = String(actor.role || '').toLowerCase();
  if (role !== 'captain' && role !== 'vessel' && role !== 'admin') return [];

  const [single, batch] = await Promise.all([
    supabaseAdmin
      .from('trb_signoff_requests')
      .select('id', { count: 'exact', head: true })
      .eq('signer_user_id', actor.id)
      .eq('status', 'pending')
      .or('is_batch_shadow.is.null,is_batch_shadow.eq.false'),
    supabaseAdmin
      .from('trb_batch_signoff_requests')
      .select('id', { count: 'exact', head: true })
      .eq('signer_user_id', actor.id)
      .eq('status', 'pending'),
  ]);

  const count = (single.count || 0) + (batch.count || 0);
  if (!count) return [];
  return [
    {
      id: 'pending-training-signoff',
      kind: 'pending_training_signoff',
      category: 'issue',
      severity: 'warning',
      title:
        count === 1
          ? 'Training sign-off waiting'
          : `${count} training sign-offs waiting`,
      description: 'A generated record is still unsigned. Open Inbox to complete it.',
      href: ACTIVITY_RAIL_INBOX_HREF,
    },
  ];
}

async function loadVesselNameMap(vesselIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (vesselIds.length === 0) return map;
  const { data } = await supabaseAdmin
    .from('vessels')
    .select('id, name')
    .in('id', vesselIds);
  for (const row of data || []) {
    const id = String((row as { id?: string }).id || '');
    const name = String((row as { name?: string | null }).name || '').trim();
    if (id && name) map.set(id, name);
  }
  return map;
}

async function loadVesselNames(vesselIds: string[]): Promise<string[]> {
  return Array.from(new Set((await loadVesselNameMap(vesselIds)).values()));
}

function todayYmdUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadLogCompletenessItems(
  actor: ActorRow,
): Promise<ActivityRailItem[]> {
  const role = String(actor.role || '').toLowerCase();
  if (role === 'admin') return [];

  const today = todayYmdUtc();
  const scopes: Array<{ vesselId: string; startDate: string | null }> = [];

  if (role === 'vessel' && actor.active_vessel_id) {
    scopes.push({
      vesselId: actor.active_vessel_id,
      startDate: actor.start_date || null,
    });
  } else if (role === 'crew' || role === 'captain') {
    const { data } = await supabaseAdmin
      .from('vessel_assignments')
      .select('vessel_id, start_date, end_date')
      .eq('user_id', actor.id);
    for (const row of data || []) {
      const vesselId = String((row as { vessel_id?: string }).vessel_id || '');
      if (!vesselId) continue;
      const startDate = (row as { start_date?: string | null }).start_date || null;
      const endDate = (row as { end_date?: string | null }).end_date || null;
      if (startDate && startDate.slice(0, 10) > today) continue;
      if (endDate && endDate.slice(0, 10) < today) continue;
      scopes.push({ vesselId, startDate });
    }
  }

  if (scopes.length === 0) return [];

  const windowStarts = scopes
    .map((scope) =>
      resolveActivityRailLogWindowStart({
        today,
        assignmentStart: scope.startDate,
        lookbackDays: ACTIVITY_RAIL_LOG_LOOKBACK_DAYS,
      }),
    )
    .filter((value): value is string => !!value);
  const minWindow = windowStarts.length
    ? windowStarts.reduce((min, value) => (value < min ? value : min))
    : today;

  const vesselIds = Array.from(new Set(scopes.map((scope) => scope.vesselId)));
  const [{ data: logs }, nameById] = await Promise.all([
    supabaseAdmin
      .from('daily_state_logs')
      .select('vessel_id, date')
      .eq('user_id', actor.id)
      .in('vessel_id', vesselIds)
      .gte('date', minWindow)
      .lte('date', today),
    loadVesselNameMap(vesselIds),
  ]);

  const datesByVessel = new Map<string, string[]>();
  for (const row of logs || []) {
    const vesselId = String((row as { vessel_id?: string }).vessel_id || '');
    const date = String((row as { date?: string }).date || '').slice(0, 10);
    if (!vesselId || !date) continue;
    const list = datesByVessel.get(vesselId) || [];
    list.push(date);
    datesByVessel.set(vesselId, list);
  }

  const todayNames: string[] = [];
  const gapNames: string[] = [];
  let gapCount = 0;

  for (const scope of scopes) {
    const windowStart = resolveActivityRailLogWindowStart({
      today,
      assignmentStart: scope.startDate,
      lookbackDays: ACTIVITY_RAIL_LOG_LOOKBACK_DAYS,
    });
    if (!windowStart) continue;
    const logged = datesByVessel.get(scope.vesselId) || [];
    const lastLog = logged.length
      ? logged.reduce((latest, date) => (date > latest ? date : latest))
      : null;
    const onlyToday = scope.startDate
      ? summarizeActivityRailLogGaps({
          today,
          windowStart,
          loggedDates: logged,
        })
      : lastLog && lastLog >= windowStart
        ? summarizeActivityRailLogGaps({
            today,
            windowStart: laterActivityRailYmd(
              addActivityRailUtcDays(lastLog, 1) || today,
              windowStart,
            ),
            loggedDates: logged,
          })
        : {
            todayMissing: !logged.includes(today),
            missingExcludingToday: [] as string[],
          };
    const vesselName = nameById.get(scope.vesselId) || 'this vessel';
    if (onlyToday.todayMissing) todayNames.push(vesselName);
    if (onlyToday.missingExcludingToday.length > 0) {
      gapCount += onlyToday.missingExcludingToday.length;
      gapNames.push(vesselName);
    }
  }

  const uniqueToday = Array.from(new Set(todayNames));
  const uniqueGaps = Array.from(new Set(gapNames));
  const items: ActivityRailItem[] = [];

  if (uniqueToday.length > 0) {
    const vesselLabel =
      uniqueToday.length === 1 ? uniqueToday[0] : `${uniqueToday.length} vessels`;
    items.push({
      id: 'log-today-missing',
      kind: 'log_today_missing',
      category: 'missing',
      severity: 'warning',
      title: 'Today is not logged',
      description: `No state saved yet for ${vesselLabel}. Open Current to log it — this will not auto-fill.`,
      href: '/dashboard/current',
      daysUntil: 0,
      meta: vesselLabel,
    });
  }

  if (gapCount > 0) {
    const vesselLabel =
      uniqueGaps.length === 1 ? uniqueGaps[0] : `${uniqueGaps.length} vessels`;
    items.push({
      id: 'log-days-missing',
      kind: 'log_days_missing',
      category: 'missing',
      severity: gapCount >= 7 ? 'warning' : 'info',
      title: gapCount === 1 ? '1 day not logged' : `${gapCount} days not logged`,
      description: `There are gaps on ${vesselLabel} since the assignment started. Open the calendar to fill them in — this will not auto-fill.`,
      href: '/dashboard/calendar',
      daysUntil: -gapCount,
      meta: vesselLabel,
    });
  }

  return items;
}

async function loadAdminItems(): Promise<ActivityRailItem[]> {
  const [
    claims,
    applications,
    reports,
    feedback,
  ] = await Promise.all([
    supabaseAdmin
      .from('vessel_claim_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'vessel_approved', 'admin_approved']),
    supabaseAdmin
      .from('captain_role_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabaseAdmin
      .from('ais_state_reports')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'reviewing']),
    supabaseAdmin
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']),
  ]);

  const items: ActivityRailItem[] = [];
  const claimCount = claims.count || 0;
  if (claimCount > 0) {
    items.push({
      id: 'admin-claims',
      kind: 'pending_claim',
      category: 'issue',
      severity: 'warning',
      title:
        claimCount === 1
          ? 'Vessel claim waiting'
          : `${claimCount} vessel claims waiting`,
      description: 'Captaincy claims need a review in Inbox.',
      href: ACTIVITY_RAIL_INBOX_HREF,
    });
  }
  const appCount = applications.count || 0;
  if (appCount > 0) {
    items.push({
      id: 'admin-captaincy',
      kind: 'pending_captaincy',
      category: 'issue',
      severity: 'warning',
      title:
        appCount === 1
          ? 'Captain application pending'
          : `${appCount} captain applications pending`,
      description: 'Role applications are waiting for a decision.',
      href: ACTIVITY_RAIL_INBOX_HREF,
    });
  }
  const reportCount = reports.count || 0;
  if (reportCount > 0) {
    items.push({
      id: 'admin-ais-reports',
      kind: 'open_ais_report',
      category: 'issue',
      severity: 'warning',
      title:
        reportCount === 1
          ? 'AIS wrong-state report open'
          : `${reportCount} AIS wrong-state reports open`,
      description: 'Review reported mismatches before they go stale.',
      href: '/dashboard/ais-wrong-states',
    });
  }
  const feedbackCount = feedback.count || 0;
  if (feedbackCount > 0) {
    items.push({
      id: 'admin-feedback',
      kind: 'open_feedback',
      category: 'issue',
      severity: 'info',
      title:
        feedbackCount === 1
          ? 'Open feedback item'
          : `${feedbackCount} open feedback items`,
      description: 'User feedback is waiting for a response.',
      href: '/dashboard/feedback',
    });
  }
  return items;
}

export async function buildActivityRail(userId: string): Promise<ActivityRailPayload> {
  const { data: actorRow } = await supabaseAdmin
    .from('users')
    .select(
      'id, role, email, first_name, last_name, nationality, date_of_birth, discharge_book_number, position, signature, active_vessel_id, start_date',
    )
    .eq('id', userId)
    .maybeSingle();

  if (!actorRow) {
    return { items: [], counts: countActivityRailItems([]) };
  }

  const actor = actorRow as ActorRow;
  const role = String(actor.role || '').toLowerCase();
  const items: ActivityRailItem[] = [];

  items.push(...profileMissingItems(actor));
  items.push(...signatureMissingItem(actor));

  const ownCerts = await settled(loadOwnCertificates(userId), []);
  items.push(
    ...certificateItems(ownCerts, { href: '/dashboard/certificates' }),
  );

  if (role === 'crew' || role === 'captain') {
    const visas = await settled(loadOwnVisas(userId), []);
    items.push(...visaItems(visas));
    items.push(
      ...(await settled(loadCrewPendingTestimonials(userId), [])),
    );
    items.push(...(await settled(loadCrewSeaTimeOffers(userId), [])));
    items.push(
      ...(await settled(loadCrewSeaTimeAccessRequests(userId), [])),
    );
  }

  if (role === 'captain' || role === 'vessel' || role === 'admin') {
    items.push(...(await settled(loadPendingSignoffs(actor), [])));
    items.push(...(await settled(loadTrainingSignoffItems(actor), [])));
  }

  if (role === 'vessel') {
    const vessels = await settled(loadManagedVessels(userId), []);
    items.push(...vesselIncompleteItems(vessels));
    items.push(...aisIssueItems(vessels));
    items.push(
      ...(await settled(
        loadCrewCertificateItems(
          userId,
          vessels.map((vessel) => vessel.id),
        ),
        [],
      )),
    );
    const vesselId = actor.active_vessel_id || vessels[0]?.id || null;
    items.push(...(await settled(loadVesselSeaTimeRequests(vesselId), [])));
    items.push(...(await settled(loadPlanCoverageItems(userId), [])));
    items.push(...(await settled(loadVesselClaimItems(vesselId), [])));
  }

  items.push(...(await settled(loadLogCompletenessItems(actor), [])));

  if (role === 'admin') {
    items.push(...(await settled(loadAdminItems(), [])));
  }

  const sorted = sortActivityRailItems(items).slice(0, MAX_ITEMS);
  return {
    items: sorted,
    counts: countActivityRailItems(sorted),
  };
}
