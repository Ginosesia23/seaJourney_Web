import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { reconcileCrewPersonalPlanForUser, vesselRequiresPlanCoverageApproval } from '@/lib/crew-personal-plan-on-vessel';
import {
  decideVesselPlanCoverageRequest,
  ensurePendingVesselPlanCoverageRequest,
  listPendingCoverageForManager,
  listPendingCoverageForVessel,
} from '@/lib/vessel-plan-coverage';

export const runtime = 'nodejs';

async function authUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

/**
 * GET /api/vessel-plan-coverage?vesselId=…
 * List pending coverage requests for a vessel (vessel manager / admin).
 */
export async function GET(req: NextRequest) {
  const user = await authUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const vesselId = req.nextUrl.searchParams.get('vesselId')?.trim() || null;

  const { data: caller } = await supabaseAdmin
    .from('users')
    .select('id, role, active_vessel_id')
    .eq('id', user.id)
    .maybeSingle();

  const role = (caller?.role || '').toLowerCase();
  const isAdmin = role === 'admin';

  if (vesselId) {
    const isVesselOnVessel =
      role === 'vessel' && caller?.active_vessel_id === vesselId;
    let isManager = false;
    if (!isAdmin && !isVesselOnVessel) {
      const { data: managed } = await supabaseAdmin
        .from('vessels')
        .select('id')
        .eq('id', vesselId)
        .eq('vessel_manager_id', user.id)
        .maybeSingle();
      isManager = !!managed;
    }
    if (!isAdmin && !isVesselOnVessel && !isManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (!isAdmin && role !== 'vessel') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const pending = vesselId
    ? await listPendingCoverageForVessel(vesselId)
    : await listPendingCoverageForManager(user.id);
  const crewIds = [...new Set(pending.map((p) => p.crew_user_id))];
  let crewById: Record<
    string,
    {
      id: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      username: string | null;
    }
  > = {};

  if (crewIds.length) {
    const { data: crewRows } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name, username')
      .in('id', crewIds);
    for (const row of crewRows || []) {
      crewById[row.id as string] = row as (typeof crewById)[string];
    }
  }

  return NextResponse.json({
    requests: pending.map((r) => ({
      ...r,
      crew: crewById[r.crew_user_id] || null,
    })),
  });
}

/**
 * POST /api/vessel-plan-coverage
 * Crew: open/ensure a pending coverage request for an active assignment.
 * Body: { vesselId }
 */
export async function POST(req: NextRequest) {
  const user = await authUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { vesselId?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const vesselId = body.vesselId?.trim();
  if (!vesselId) {
    return NextResponse.json({ error: 'Missing vesselId' }, { status: 400 });
  }

  const { data: assignment } = await supabaseAdmin
    .from('vessel_assignments')
    .select('id')
    .eq('user_id', user.id)
    .eq('vessel_id', vesselId)
    .is('end_date', null)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json(
      { error: 'You need an active assignment on this vessel first' },
      { status: 400 },
    );
  }

  const qualifies = await vesselRequiresPlanCoverageApproval(vesselId);
  if (!qualifies) {
    return NextResponse.json({
      success: true,
      status: 'noop',
      created: false,
      message: 'This vessel is not on a plan that covers crew subscriptions',
    });
  }

  const result = await ensurePendingVesselPlanCoverageRequest({
    crewUserId: user.id,
    vesselId,
  });

  // Reconcile in case it was already approved (e.g. race / invite).
  void reconcileCrewPersonalPlanForUser(user.id).catch(() => {});

  return NextResponse.json({
    success: true,
    status: result.status,
    created: result.created,
    request: result.request,
  });
}

/**
 * PUT /api/vessel-plan-coverage
 * Vessel: approve or reject a pending request.
 * Body: { requestId, action: 'approve' | 'reject', rejectionReason? }
 */
export async function PUT(req: NextRequest) {
  const user = await authUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    requestId?: string;
    action?: string;
    rejectionReason?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const requestId = body.requestId?.trim();
  const action = body.action === 'approve' || body.action === 'reject'
    ? body.action
    : null;

  if (!requestId || !action) {
    return NextResponse.json(
      { error: 'Missing requestId or action' },
      { status: 400 },
    );
  }

  const { request, error } = await decideVesselPlanCoverageRequest({
    requestId,
    actorUserId: user.id,
    action,
    rejectionReason: body.rejectionReason,
  });

  if (error || !request) {
    const status = error === 'Forbidden' ? 403 : 404;
    return NextResponse.json({ error: error || 'Not found' }, { status });
  }

  if (action === 'approve') {
    try {
      await reconcileCrewPersonalPlanForUser(request.crew_user_id);
    } catch (err) {
      console.error('[vessel-plan-coverage] reconcile after approve failed', err);
    }
  }

  return NextResponse.json({ success: true, request });
}
