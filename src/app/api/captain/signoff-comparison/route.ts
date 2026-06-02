import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * GET /api/captain/signoff-comparison?token=…&email=…
 *
 * Returns the broader review context for the captain sign-off page:
 *   - `dataSource`: which logs the testimonial was generated from
 *     ('crew' = crew member's own logs, 'vessel' = the vessel manager's
 *     authoritative logs, or null if not recorded)
 *   - `accessApproved`: whether the crew member has granted the vessel
 *     manager access to view their personal sea-time logs (only
 *     meaningful when dataSource === 'crew' — without approved access
 *     the captain shouldn't be shown the crew's logs)
 *   - `crewLogs`: the crew member's daily_state_logs in the period
 *     (only populated when both dataSource === 'crew' AND accessApproved)
 *   - `vesselLogs`: the vessel-account daily_state_logs in the period
 *     (always populated when available — used either as the "vessel side"
 *     of the comparison or as the single source for the breakdown when
 *     no crew logs are available)
 *
 * Auth model: bearer-style — caller proves they hold the signoff token
 * and the email it was generated for. Same gate as /api/captain/signoff.
 * Server-side fetches use supabaseAdmin so the linked captain account
 * (which has no RLS access to daily_state_logs for other users) can
 * still see the review context.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  if (!token || !email) {
    return NextResponse.json(
      { success: false, error: 'Invalid sign-off link.' },
      { status: 400 }
    );
  }

  const { data: testimonial, error: testimonialError } = await supabaseAdmin
    .from('testimonials')
    .select(
      'id, user_id, vessel_id, start_date, end_date, status, signoff_token, signoff_token_expires_at, signoff_target_email, signoff_used_at, data_source'
    )
    .eq('signoff_token', token)
    .eq('signoff_target_email', email)
    .maybeSingle();

  if (testimonialError) {
    console.error('[signoff-comparison] testimonial lookup failed:', testimonialError);
    return NextResponse.json(
      { success: false, error: 'Unable to load testimonial.' },
      { status: 500 }
    );
  }
  if (!testimonial) {
    return NextResponse.json(
      { success: false, error: 'This sign-off link is invalid or has been revoked.' },
      { status: 404 }
    );
  }

  // Same status/expiry checks the main GET enforces.
  const now = new Date();
  const expiresAt = testimonial.signoff_token_expires_at
    ? new Date(testimonial.signoff_token_expires_at)
    : null;
  if (expiresAt && expiresAt < now) {
    return NextResponse.json(
      { success: false, error: 'This sign-off link has expired.' },
      { status: 410 }
    );
  }
  if (testimonial.signoff_used_at) {
    return NextResponse.json(
      { success: false, error: 'This sign-off link has already been used.' },
      { status: 409 }
    );
  }

  const dataSource: 'crew' | 'vessel' | null = (testimonial.data_source as any) ?? null;

  // Find the vessel manager (we use their logs as the authoritative "vessel" side).
  const { data: vesselRow } = await supabaseAdmin
    .from('vessels')
    .select('vessel_manager_id')
    .eq('id', testimonial.vessel_id)
    .maybeSingle();
  const vesselManagerId: string | null = (vesselRow as any)?.vessel_manager_id ?? null;

  // Was the crew member's sea-time access approved on this vessel?
  // Approval is what makes it OK for the vessel side (and the captain) to
  // see the crew member's personal log entries.
  let accessApproved = false;
  if (testimonial.user_id && testimonial.vessel_id) {
    const { data: accessRows } = await supabaseAdmin
      .from('vessel_sea_time_access_requests')
      .select('id')
      .eq('crew_user_id', testimonial.user_id)
      .eq('vessel_id', testimonial.vessel_id)
      .eq('status', 'approved')
      .limit(1);
    accessApproved = Array.isArray(accessRows) && accessRows.length > 0;
  }

  // Bind the testimonial fields locally so the inner closure doesn't have to
  // re-narrow against `testimonial | null` (which TS can't track across an
  // async boundary).
  const tVesselId = testimonial.vessel_id;
  const tStart = testimonial.start_date;
  const tEnd = testimonial.end_date;

  /** Fetch a user's daily_state_logs for the vessel/date range, tolerant of the
   *  legacy `log_date` column. Returns rows in a stable shape. */
  async function fetchLogs(userId: string | null): Promise<Array<Record<string, any>>> {
    if (!userId) return [];
    const tryQuery = async (col: 'date' | 'log_date') => {
      return supabaseAdmin
        .from('daily_state_logs')
        .select('*')
        .eq('vessel_id', tVesselId)
        .eq('user_id', userId)
        .gte(col, tStart)
        .lte(col, tEnd)
        .order(col, { ascending: true });
    };
    const first = await tryQuery('date');
    if (!first.error) return first.data || [];
    if (first.error.code === '42703' || first.error.message?.includes('column "date"')) {
      const retry = await tryQuery('log_date');
      if (!retry.error) return retry.data || [];
    }
    console.error('[signoff-comparison] fetchLogs error:', first.error);
    return [];
  }

  // Only fetch crew logs when the testimonial was generated from them AND
  // the crew member has actively granted access. Otherwise we treat them
  // as private — the captain only sees the vessel-side breakdown.
  const shouldFetchCrewLogs = dataSource === 'crew' && accessApproved;
  const [crewLogsRaw, vesselLogsRaw] = await Promise.all([
    shouldFetchCrewLogs ? fetchLogs(testimonial.user_id) : Promise.resolve([] as any[]),
    fetchLogs(vesselManagerId),
  ]);

  /** Normalize a daily_state_logs row to the StateLog shape the comparison
   *  view + breakdown both expect (camelCased ids, tolerant date column). */
  const mapRow = (row: Record<string, any>) => ({
    id: row.id,
    userId: row.user_id,
    vesselId: row.vessel_id,
    date: row.date || row.log_date,
    state: row.state,
    isPartOfActivePassage: row.is_part_of_active_passage ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  return NextResponse.json({
    success: true,
    dataSource,
    accessApproved,
    crewLogs: crewLogsRaw.map(mapRow),
    vesselLogs: vesselLogsRaw.map(mapRow),
  });
}
