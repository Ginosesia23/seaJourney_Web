import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Admin-only auth helpers for the user lookup detail page.
 *
 *  - GET  ?userId=…     → returns the auth status for that user (email
 *                          confirmation, last sign-in, banned-until) by reading
 *                          `auth.admin.getUserById`.
 *  - POST { userId }    → resends the signup confirmation email for users that
 *                          have NOT yet confirmed their email. Falls back to
 *                          `inviteUserByEmail` if `resend` rejects (e.g. the
 *                          user record was created via admin invite and has no
 *                          pending confirmation token).
 */

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

export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

    const userId = req.nextUrl.searchParams.get('userId')?.trim();
    const listMode = req.nextUrl.searchParams.get('list') === 'all';

    // Bulk list mode — used by the user lookup table to flag unverified users.
    // Walks `auth.admin.listUsers` (paginated) and returns id → confirmation
    // state for every account. Heavier than a single getUserById, so this
    // mode is opt-in via `?list=all`.
    if (listMode) {
        const summary: Array<{
        id: string;
        email: string | null;
        emailConfirmedAt: string | null;
        lastSignInAt: string | null;
        bannedUntil: string | null;
        isConfirmed: boolean;
        isDisabled: boolean;
      }> = [];
      const perPage = 1000;
      let page = 1;
      // Hard cap pages so we don't loop forever if Supabase paginates oddly.
      while (page <= 50) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        });
        if (error) {
          return NextResponse.json(
            { error: error.message || 'Failed to list users' },
            { status: 500 },
          );
        }
        const users = data?.users ?? [];
        for (const u of users) {
          const bannedUntil = (u as { banned_until?: string | null }).banned_until ?? null;
          const isDisabled = Boolean(bannedUntil && new Date(bannedUntil) > new Date());
          summary.push({
            id: u.id,
            email: u.email ?? null,
            emailConfirmedAt: u.email_confirmed_at ?? null,
            lastSignInAt: u.last_sign_in_at ?? null,
            bannedUntil,
            isConfirmed: Boolean(u.email_confirmed_at),
            isDisabled,
          });
        }
        if (users.length < perPage) break;
        page += 1;
      }
      return NextResponse.json({ users: summary });
    }

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      return NextResponse.json(
        { error: error?.message || 'User not found in auth.users' },
        { status: 404 },
      );
    }

    const u = data.user;
    return NextResponse.json({
      id: u.id,
      email: u.email ?? null,
      emailConfirmedAt: u.email_confirmed_at ?? null,
      phoneConfirmedAt: u.phone_confirmed_at ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
      bannedUntil: (u as any).banned_until ?? null,
      createdAt: u.created_at ?? null,
      updatedAt: u.updated_at ?? null,
      provider: u.app_metadata?.provider ?? null,
      providers: (u.app_metadata?.providers as string[] | undefined) ?? null,
      isConfirmed: Boolean(u.email_confirmed_at),
    });
  } catch (e) {
    console.error('[ADMIN AUTH STATUS]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

    const body = await req.json().catch(() => ({}));
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const { data: targetData, error: targetError } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    if (targetError || !targetData?.user) {
      return NextResponse.json(
        { error: targetError?.message || 'User not found' },
        { status: 404 },
      );
    }
    const target = targetData.user;
    const email = target.email;
    if (!email) {
      return NextResponse.json(
        { error: 'Target user has no email on file' },
        { status: 400 },
      );
    }
    if (target.email_confirmed_at) {
      return NextResponse.json(
        {
          error:
            'This user has already confirmed their email — no need to resend.',
        },
        { status: 409 },
      );
    }

    // Try the standard "resend signup confirmation" flow first.
    const { error: resendError } = await supabaseAdmin.auth.resend({
      type: 'signup',
      email,
    });

    if (!resendError) {
      return NextResponse.json({
        ok: true,
        method: 'resend-signup',
        sentTo: email,
      });
    }

    // Some users (e.g. created via admin invite) have no pending signup token,
    // so `resend` errors out. Fall back to firing a fresh invite email.
    const { error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      console.error('[ADMIN RESEND AUTH] resend + invite both failed', {
        resendError: resendError.message,
        inviteError: inviteError.message,
      });
      return NextResponse.json(
        {
          error: 'Failed to resend confirmation email',
          details: resendError.message || inviteError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      method: 'invite',
      sentTo: email,
    });
  } catch (e) {
    console.error('[ADMIN RESEND AUTH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
