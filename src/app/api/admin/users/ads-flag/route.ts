import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) return user.id;
  }
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * PATCH: Set users.ads for a non-admin account (admin only).
 * Body: { userId: string, ads: boolean | null } — null clears the flag (not set).
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

    const body = await req.json();
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (!Object.prototype.hasOwnProperty.call(body, 'ads')) {
      return NextResponse.json({ error: 'Missing ads' }, { status: 400 });
    }

    const adsRaw = body.ads;
    if (adsRaw !== null && adsRaw !== true && adsRaw !== false) {
      return NextResponse.json(
        { error: 'ads must be true, false, or null' },
        { status: 400 }
      );
    }

    const adsValue = adsRaw as boolean | null;

    const { data: target, error: targetError } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle();

    if (targetError || !target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (target.role === 'admin') {
      return NextResponse.json(
        { error: 'Cannot change ads flag for admin accounts' },
        { status: 403 }
      );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('users')
      .update({ ads: adsValue })
      .eq('id', userId)
      .select('id, ads')
      .single();

    if (updateError) {
      console.error('[ADMIN ADS FLAG]', updateError);
      return NextResponse.json(
        { error: 'Failed to update', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ user: updated });
  } catch (e) {
    console.error('[ADMIN ADS FLAG]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
