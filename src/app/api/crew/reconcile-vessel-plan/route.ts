import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { reconcileCrewPersonalPlanForUser } from '@/lib/crew-personal-plan-on-vessel';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { userId?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const targetUserId = (body.userId || user.id).trim();
  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const { data: caller } = await supabaseAdmin
    .from('users')
    .select('id, role, active_vessel_id')
    .eq('id', user.id)
    .maybeSingle();

  const isSelf = targetUserId === user.id;
  const isAdmin = (caller?.role || '').toLowerCase() === 'admin';
  let canManage = isSelf || isAdmin;

  if (!canManage && caller?.role === 'vessel') {
    const { data: assignments } = await supabaseAdmin
      .from('vessel_assignments')
      .select('vessel_id')
      .eq('user_id', targetUserId)
      .is('end_date', null);

    const vesselIds = (assignments || []).map((a) => a.vessel_id as string);
    if (caller.active_vessel_id && vesselIds.includes(caller.active_vessel_id)) {
      canManage = true;
    } else if (vesselIds.length) {
      const { data: managed } = await supabaseAdmin
        .from('vessels')
        .select('id')
        .eq('vessel_manager_id', user.id)
        .in('id', vesselIds);
      canManage = (managed || []).length > 0;
    }
  }

  if (!canManage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await reconcileCrewPersonalPlanForUser(targetUserId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[API /api/crew/reconcile-vessel-plan]', error);
    return NextResponse.json(
      { error: 'Failed to update crew plan for vessel assignment' },
      { status: 500 },
    );
  }
}
