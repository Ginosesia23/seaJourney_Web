import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/applications/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const VALID_STATUS = new Set(['open', 'reviewing', 'resolved', 'dismissed']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

async function requireAdmin(userId: string) {
  const { data: actor } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();
  if (!actor || actor.role !== 'admin') return null;
  return actor;
}

function displayName(u: {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  return full || u.username || u.email || 'Unknown';
}

/**
 * GET /api/admin/ais-wrong-state-reports?status=open
 * Admin list of AIS wrong-state reports.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  if (!(await requireAdmin(auth.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const statusFilter = req.nextUrl.searchParams.get('status') || 'open';
  const selectWithSnapshot =
    'id, reported_by_user_id, subject_user_id, vessel_id, account_type, log_date, detected_state, suggested_state, ais_nav_status, ais_speed_kn, notes, status, admin_notes, reviewed_by, reviewed_at, created_at, updated_at, detection_snapshot';
  const selectWithoutSnapshot =
    'id, reported_by_user_id, subject_user_id, vessel_id, account_type, log_date, detected_state, suggested_state, ais_nav_status, ais_speed_kn, notes, status, admin_notes, reviewed_by, reviewed_at, created_at, updated_at';

  let query = supabaseAdmin
    .from('ais_state_reports')
    .select(selectWithSnapshot)
    .order('created_at', { ascending: false })
    .limit(200);

  if (statusFilter !== 'all' && VALID_STATUS.has(statusFilter)) {
    query = query.eq('status', statusFilter);
  }

  let { data: rows, error } = await query;
  if (error?.message?.includes('detection_snapshot')) {
    let fallback = supabaseAdmin
      .from('ais_state_reports')
      .select(selectWithoutSnapshot)
      .order('created_at', { ascending: false })
      .limit(200);
    if (statusFilter !== 'all' && VALID_STATUS.has(statusFilter)) {
      fallback = fallback.eq('status', statusFilter);
    }
    const retry = await fallback;
    rows = retry.data as typeof rows;
    error = retry.error;
  }
  if (error) {
    console.error('[admin ais-wrong-state]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = new Set<string>();
  const vesselIds = new Set<string>();
  for (const r of rows || []) {
    if (r.reported_by_user_id) userIds.add(r.reported_by_user_id);
    if (r.subject_user_id) userIds.add(r.subject_user_id);
    if (r.reviewed_by) userIds.add(r.reviewed_by);
    if (r.vessel_id) vesselIds.add(r.vessel_id);
  }

  const [{ data: users }, { data: vessels }] = await Promise.all([
    userIds.size
      ? supabaseAdmin
          .from('users')
          .select('id, email, username, first_name, last_name, role')
          .in('id', [...userIds])
      : Promise.resolve({ data: [] as any[] }),
    vesselIds.size
      ? supabaseAdmin.from('vessels').select('id, name, mmsi, imo').in('id', [...vesselIds])
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const userMap = new Map((users || []).map((u) => [u.id, u]));
  const vesselMap = new Map((vessels || []).map((v) => [v.id, v]));

  const reports = (rows || []).map((r) => {
    const reporter = userMap.get(r.reported_by_user_id);
    const vessel = vesselMap.get(r.vessel_id);
    const reviewer = r.reviewed_by ? userMap.get(r.reviewed_by) : null;
    return {
      id: r.id,
      accountType: r.account_type,
      logDate: r.log_date,
      detectedState: r.detected_state,
      suggestedState: r.suggested_state,
      aisNavStatus: r.ais_nav_status,
      aisSpeedKn: r.ais_speed_kn != null ? Number(r.ais_speed_kn) : null,
      notes: r.notes,
      status: r.status,
      adminNotes: r.admin_notes,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      detectionSnapshot:
        'detection_snapshot' in r ? ((r as { detection_snapshot?: unknown }).detection_snapshot ?? null) : null,
      reporter: {
        id: r.reported_by_user_id,
        name: displayName(reporter || {}),
        email: reporter?.email ?? null,
        role: reporter?.role ?? null,
      },
      vessel: {
        id: r.vessel_id,
        name: vessel?.name ?? 'Unknown vessel',
        mmsi: vessel?.mmsi ?? null,
        imo: vessel?.imo ?? null,
      },
      reviewer: reviewer
        ? { id: r.reviewed_by, name: displayName(reviewer) }
        : null,
    };
  });

  const counts = {
    open: reports.filter((r) => r.status === 'open').length,
    reviewing: reports.filter((r) => r.status === 'reviewing').length,
    resolved: reports.filter((r) => r.status === 'resolved').length,
    dismissed: reports.filter((r) => r.status === 'dismissed').length,
    total: reports.length,
  };

  return NextResponse.json({ reports, counts });
}

/**
 * PATCH /api/admin/ais-wrong-state-reports
 * Update report status / admin notes.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  if (!(await requireAdmin(auth.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isRecord(body) || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const status = typeof body.status === 'string' ? body.status : null;
  if (!status || !VALID_STATUS.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  const adminNotes =
    typeof body.adminNotes === 'string' ? body.adminNotes.trim().slice(0, 4000) : undefined;

  const patch: Record<string, unknown> = {
    status,
    reviewed_by: auth.userId,
    reviewed_at: new Date().toISOString(),
  };
  if (adminNotes !== undefined) patch.admin_notes = adminNotes || null;

  const { data, error } = await supabaseAdmin
    .from('ais_state_reports')
    .update(patch)
    .eq('id', body.id)
    .select('id, status, admin_notes, reviewed_by, reviewed_at, updated_at')
    .single();

  if (error) {
    console.error('[admin ais-wrong-state patch]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ report: data });
}
