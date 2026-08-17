import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Admin account access controls.
 *
 * PATCH  { userId, disabled: boolean }
 *   Disable = ban the auth user (~100 years) and revoke sessions.
 *   Enable  = lift the ban so they can sign in again.
 *
 * DELETE { userId }
 *   Removes the auth user (they can no longer sign in) and deletes or
 *   anonymises the public.users row.
 */

const LONG_BAN = '876000h';

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

async function requireAdmin(req: NextRequest): Promise<
  | { ok: true; actorId: string }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const actorId = await getAuthedUserId(req);
  if (!actorId) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }
  const { data: actor, error } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', actorId)
    .single();
  if (error || !actor || actor.role !== 'admin') {
    return { ok: false, status: 403, body: { error: 'Forbidden' } };
  }
  return { ok: true, actorId };
}

async function loadTarget(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('id, role, email, username, first_name, last_name')
    .eq('id', userId)
    .maybeSingle();
  const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
  return { profile, authUser: authData?.user ?? null };
}

function guardTarget(
  actorId: string,
  targetId: string,
  targetRole: string | null | undefined,
): { error: string; status: number } | null {
  if (actorId === targetId) {
    return { error: 'You cannot disable or delete your own admin account.', status: 400 };
  }
  if ((targetRole || '').toLowerCase() === 'admin') {
    return { error: 'Admin accounts cannot be disabled or deleted from here.', status: 403 };
  }
  return null;
}

export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

    const body = await req.json().catch(() => ({}));
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const disabled = body.disabled;
    if (!userId || typeof disabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing userId or disabled (boolean)' },
        { status: 400 },
      );
    }

    const { profile, authUser } = await loadTarget(userId);
    if (!authUser && !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const blocked = guardTarget(gate.actorId, userId, profile?.role);
    if (blocked) {
      return NextResponse.json({ error: blocked.error }, { status: blocked.status });
    }

    if (!authUser) {
      return NextResponse.json(
        { error: 'No auth record for this user — they already cannot sign in.' },
        { status: 404 },
      );
    }

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: disabled ? LONG_BAN : 'none',
    });
    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message || 'Failed to update account' },
        { status: 500 },
      );
    }

    if (disabled) {
      try {
        await supabaseAdmin.auth.admin.signOut(userId, 'global');
      } catch (err) {
        console.warn('[admin/users/account] signOut after disable failed', err);
      }
    }

    const { data: refreshed } = await supabaseAdmin.auth.admin.getUserById(userId);
    const bannedUntil = (refreshed?.user as { banned_until?: string | null } | undefined)
      ?.banned_until ?? null;

    return NextResponse.json({
      ok: true,
      disabled,
      bannedUntil,
    });
  } catch (err) {
    console.error('[admin/users/account PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

    const body = await req.json().catch(() => ({}));
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const { profile, authUser } = await loadTarget(userId);
    if (!authUser && !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const blocked = guardTarget(gate.actorId, userId, profile?.role);
    if (blocked) {
      return NextResponse.json({ error: blocked.error }, { status: blocked.status });
    }

    if (authUser) {
      const { error: authDelErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authDelErr) {
        return NextResponse.json(
          { error: authDelErr.message || 'Failed to delete auth user' },
          { status: 500 },
        );
      }
    }

    let profileAction: 'deleted' | 'anonymised' | 'missing' = 'missing';
    if (profile) {
      const { error: profileDelErr } = await supabaseAdmin.from('users').delete().eq('id', userId);
      if (!profileDelErr) {
        profileAction = 'deleted';
      } else {
        const stamp = Date.now();
        const { error: anonErr } = await supabaseAdmin
          .from('users')
          .update({
            email: `deleted+${stamp}@invalid.local`,
            username: `deleted_${stamp}`,
            first_name: 'Deleted',
            last_name: 'Account',
            profile_picture: null,
            active_vessel_id: null,
            stripe_customer_id: null,
            stripe_subscription_id: null,
            subscription_status: 'inactive',
          })
          .eq('id', userId);
        if (anonErr) {
          console.error('[admin/users/account] anonymise failed', anonErr, profileDelErr);
          return NextResponse.json({
            ok: true,
            authDeleted: Boolean(authUser),
            profileAction: 'auth-only',
            warning:
              'Sign-in was removed, but the profile row could not be deleted because other records still reference it.',
          });
        }
        profileAction = 'anonymised';
      }
    }

    return NextResponse.json({
      ok: true,
      authDeleted: Boolean(authUser),
      profileAction,
    });
  } catch (err) {
    console.error('[admin/users/account DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
