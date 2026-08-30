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
 * PATCH: Set users.is_testing (admin only).
 * Body: { userId: string, isTesting: boolean }
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

    if (typeof body.isTesting !== 'boolean') {
      return NextResponse.json(
        { error: 'isTesting must be a boolean' },
        { status: 400 },
      );
    }

    const isTesting = body.isTesting as boolean;

    if (userId === actorId && isTesting) {
      return NextResponse.json(
        { error: 'Cannot mark your own admin account as testing' },
        { status: 403 },
      );
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle();

    if (targetError || !target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('users')
      .update({ is_testing: isTesting })
      .eq('id', userId)
      .select('id, is_testing')
      .single();

    if (updateError) {
      console.error('[ADMIN TESTING FLAG]', updateError);
      return NextResponse.json(
        { error: 'Failed to update', details: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      user: { id: updated.id, isTesting: updated.is_testing },
    });
  } catch (e) {
    console.error('[ADMIN TESTING FLAG]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
