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
 * PATCH: Admin removes the managing vessel account from a vessel and resets
 * that account's management session (logs, passages, map caches, start date).
 *
 * Body: { vesselId: string, managerUserId?: string }
 */
export async function PATCH(req: NextRequest) {
  try {
    const actorId = await getAuthedUserId(req);
    if (!actorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: actor, error: actorError } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', actorId)
      .single();

    if (actorError || !actor || actor.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const vesselId = typeof body.vesselId === 'string' ? body.vesselId.trim() : '';
    const managerUserId =
      typeof body.managerUserId === 'string' ? body.managerUserId.trim() : '';

    if (!vesselId) {
      return NextResponse.json({ error: 'Missing vesselId' }, { status: 400 });
    }

    try {
      const result = await unlinkVesselManagerSession({
        vesselId,
        managerUserId: managerUserId || null,
      });
      return NextResponse.json({ success: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to unlink manager';
      const status =
        typeof err === 'object' && err && 'status' in err
          ? Number((err as { status: number }).status) || 500
          : 500;
      return NextResponse.json({ error: message }, { status });
    }
  } catch (e) {
    console.error('[ADMIN UNLINK MANAGER]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
