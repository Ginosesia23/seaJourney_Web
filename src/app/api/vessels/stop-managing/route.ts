import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { unlinkVesselManagerSession } from '@/lib/unlink-vessel-manager';

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) return user.id;
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * POST: Vessel manager stops managing their active vessel (wrong vessel chosen).
 * Body: { confirm: true, vesselId?: string }
 *
 * Requires the caller to be role=vessel and to currently manage the vessel
 * (vessel_manager_id or active_vessel_id). Wipes that account's session data
 * for the vessel; does not delete other crew members' records.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.confirm !== true) {
      return NextResponse.json(
        {
          error:
            'Confirmation required. Send { confirm: true } after acknowledging data loss.',
        },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id, role, active_vessel_id, email')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if ((profile.role || '').toLowerCase() !== 'vessel') {
      return NextResponse.json(
        { error: 'Only vessel manager accounts can stop managing a vessel here' },
        { status: 403 },
      );
    }

    let vesselId =
      typeof body.vesselId === 'string' && body.vesselId.trim()
        ? body.vesselId.trim()
        : (profile.active_vessel_id as string | null) || '';

    if (!vesselId) {
      // Fall back: vessel that lists this user as manager
      const { data: managed } = await supabaseAdmin
        .from('vessels')
        .select('id')
        .eq('vessel_manager_id', userId)
        .limit(1)
        .maybeSingle();
      vesselId = (managed?.id as string) || '';
    }

    if (!vesselId) {
      return NextResponse.json(
        { error: 'No vessel is currently linked to this account' },
        { status: 400 },
      );
    }

    const { data: vessel, error: vesselError } = await supabaseAdmin
      .from('vessels')
      .select('id, name, vessel_manager_id')
      .eq('id', vesselId)
      .maybeSingle();

    if (vesselError || !vessel) {
      return NextResponse.json({ error: 'Vessel not found' }, { status: 404 });
    }

    const isManager =
      vessel.vessel_manager_id === userId || profile.active_vessel_id === vesselId;
    if (!isManager) {
      return NextResponse.json(
        { error: 'You are not the managing account for this vessel' },
        { status: 403 },
      );
    }

    try {
      const result = await unlinkVesselManagerSession({
        vesselId,
        managerUserId: userId,
      });
      return NextResponse.json({
        success: true,
        message:
          'Vessel unlinked. Your start date, daily logs, passages, and map data for this vessel have been permanently deleted.',
        ...result,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to stop managing vessel';
      const status =
        typeof err === 'object' && err && 'status' in err
          ? Number((err as { status: number }).status) || 500
          : 500;
      return NextResponse.json({ error: message }, { status });
    }
  } catch (e) {
    console.error('[STOP MANAGING VESSEL]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
