import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { stripe } from '@/lib/stripe';
import { applyManualSubscriptionUpdate } from '@/lib/admin/manual-subscription';
import {
  findUserProfileByEmail,
  isEmailRegisteredToOtherUser,
} from '@/lib/admin/lookup-user-by-email';

/**
 * Admin-only email transfer for demo → official account handoff.
 *
 * Updates auth + profile email on the **same user id** so all sea-time data,
 * vessels, subscriptions, and storage paths stay intact.
 *
 * GET  ?userId=… | ?email=…     → preview target account
 * GET  ?checkEmail=…            → whether an email is already registered
 * PATCH { userId, newEmail, clearTesting?, sendPasswordReset?, updateSubscription?, role?, subscriptionTier?, subscriptionStatus? }
 */

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://www.seajourney.co.uk';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

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

async function loadTargetProfile(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select(
      'id, role, email, username, first_name, last_name, subscription_tier, subscription_status, active_vessel_id, is_testing, stripe_customer_id, created_at',
    )
    .eq('id', userId)
    .maybeSingle();

  const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const authUser = authData?.user ?? null;

  let vesselName: string | null = null;
  if (profile?.active_vessel_id) {
    const { data: vessel } = await supabaseAdmin
      .from('vessels')
      .select('name')
      .eq('id', profile.active_vessel_id)
      .maybeSingle();
    vesselName = (vessel?.name as string | undefined) ?? null;
  }

  const { count: assignmentCount } = await supabaseAdmin
    .from('vessel_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  return {
    profile,
    authUser,
    vesselName,
    assignmentCount: assignmentCount ?? 0,
  };
}

function guardTarget(
  actorId: string,
  targetId: string,
  targetRole: string | null | undefined,
): { error: string; status: number } | null {
  if (actorId === targetId) {
    return {
      error: 'You cannot transfer your own admin account from here.',
      status: 400,
    };
  }
  if ((targetRole || '').toLowerCase() === 'admin') {
    return { error: 'Admin account emails cannot be changed here.', status: 403 };
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

    const checkEmail = req.nextUrl.searchParams.get('checkEmail')?.trim();
    const excludeUserId = req.nextUrl.searchParams.get('excludeUserId')?.trim() || '';
    if (checkEmail) {
      const normalized = normalizeEmail(checkEmail);
      if (!isValidEmail(normalized)) {
        return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
      }

      const availability = await isEmailRegisteredToOtherUser(normalized, excludeUserId || undefined);
      if (availability.available) {
        return NextResponse.json({ available: true, email: normalized });
      }

      const existing = availability.profile;
      return NextResponse.json({
        available: false,
        email: normalized,
        existingUser: {
          id: availability.userId,
          email: existing.email,
          role: existing.role ?? null,
          firstName: existing.first_name ?? null,
          lastName: existing.last_name ?? null,
          isTesting: Boolean(existing.is_testing),
        },
      });
    }

    const userId = req.nextUrl.searchParams.get('userId')?.trim();
    const email = req.nextUrl.searchParams.get('email')?.trim();

    let targetId = userId || '';
    if (!targetId && email) {
      const normalized = normalizeEmail(email);
      const profileByEmail = await findUserProfileByEmail(normalized);
      if (!profileByEmail) {
        return NextResponse.json({ error: 'No account found for that email' }, { status: 404 });
      }
      targetId = profileByEmail.id;
    }

    if (!targetId) {
      return NextResponse.json(
        { error: 'Provide userId, email, or checkEmail' },
        { status: 400 },
      );
    }

    const { profile, authUser, vesselName, assignmentCount } =
      await loadTargetProfile(targetId);

    if (!profile && !authUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      userId: targetId,
      profile: profile
        ? {
            id: profile.id,
            email: profile.email,
            username: profile.username,
            firstName: profile.first_name,
            lastName: profile.last_name,
            role: profile.role,
            subscriptionTier: profile.subscription_tier,
            subscriptionStatus: profile.subscription_status,
            isTesting: Boolean(profile.is_testing),
            vesselName,
            assignmentCount,
            createdAt: profile.created_at,
          }
        : null,
      auth: authUser
        ? {
            email: authUser.email,
            emailConfirmedAt: authUser.email_confirmed_at,
            lastSignInAt: authUser.last_sign_in_at,
            createdAt: authUser.created_at,
          }
        : null,
    });
  } catch (err) {
    console.error('[admin/users/change-email GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

    const body = await req.json().catch(() => ({}));
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const newEmailRaw = typeof body.newEmail === 'string' ? body.newEmail : '';
    const clearTesting = body.clearTesting !== false;
    const sendPasswordReset = body.sendPasswordReset !== false;
    const updateSubscription = body.updateSubscription === true;
    const subscriptionTier =
      typeof body.subscriptionTier === 'string' ? body.subscriptionTier.trim() : '';
    const subscriptionStatus =
      typeof body.subscriptionStatus === 'string' ? body.subscriptionStatus.trim() : '';
    const subscriptionRole =
      typeof body.role === 'string' ? body.role.trim() : undefined;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const newEmail = normalizeEmail(newEmailRaw);
    if (!isValidEmail(newEmail)) {
      return NextResponse.json({ error: 'Invalid new email address' }, { status: 400 });
    }

    const { profile, authUser } = await loadTargetProfile(userId);
    if (!authUser && !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const blocked = guardTarget(gate.actorId, userId, profile?.role);
    if (blocked) {
      return NextResponse.json({ error: blocked.error }, { status: blocked.status });
    }

    const oldEmail = normalizeEmail(
      (authUser?.email || profile?.email || '').toString(),
    );
    if (oldEmail === newEmail) {
      return NextResponse.json(
        { error: 'New email is the same as the current email' },
        { status: 400 },
      );
    }

    const availability = await isEmailRegisteredToOtherUser(newEmail, userId);
    if (!availability.available) {
      return NextResponse.json(
        {
          error:
            'That email is already registered to another account. Delete the empty duplicate first, or use a different email.',
          conflictingUserId: availability.userId,
        },
        { status: 409 },
      );
    }

    if (!authUser) {
      return NextResponse.json(
        { error: 'No auth record for this user — cannot update login email.' },
        { status: 404 },
      );
    }

    const { error: authUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    });
    if (authUpdateErr) {
      return NextResponse.json(
        { error: authUpdateErr.message || 'Failed to update auth email' },
        { status: 500 },
      );
    }

    const profileUpdates: Record<string, unknown> = { email: newEmail };
    if (clearTesting && profile?.is_testing) {
      profileUpdates.is_testing = false;
    }

    const { error: profileUpdateErr } = await supabaseAdmin
      .from('users')
      .update(profileUpdates)
      .eq('id', userId);
    if (profileUpdateErr) {
      console.error('[admin/users/change-email] profile update failed', profileUpdateErr);
      return NextResponse.json(
        {
          error:
            'Auth email was updated but the profile row failed to sync. Contact engineering.',
        },
        { status: 500 },
      );
    }

    let stripeUpdated = false;
    const stripeCustomerId = profile?.stripe_customer_id as string | null | undefined;
    if (stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
      try {
        await stripe.customers.update(stripeCustomerId, { email: newEmail });
        stripeUpdated = true;
      } catch (stripeErr) {
        console.warn('[admin/users/change-email] Stripe customer update failed', stripeErr);
      }
    }

    let passwordResetSent = false;
    if (sendPasswordReset) {
      const { error: resetErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: newEmail,
        options: { redirectTo: `${SITE_URL}/reset-password` },
      });
      passwordResetSent = !resetErr;
      if (resetErr) {
        console.warn('[admin/users/change-email] password reset link failed', resetErr);
      }
    }

    let subscriptionUpdated = false;
    let subscriptionWarning: string | null = null;
    let subscriptionResult: Record<string, unknown> | null = null;

    if (updateSubscription) {
      if (!subscriptionTier || !subscriptionStatus) {
        return NextResponse.json(
          { error: 'subscriptionTier and subscriptionStatus are required when updateSubscription is true' },
          { status: 400 },
        );
      }

      const subResult = await applyManualSubscriptionUpdate(userId, {
        role: subscriptionRole,
        subscriptionTier,
        subscriptionStatus,
      });

      if (!subResult.ok) {
        return NextResponse.json(
          {
            error: `Email was updated, but subscription change failed: ${subResult.error}`,
            partial: true,
            userId,
            newEmail,
          },
          { status: subResult.status },
        );
      }

      subscriptionUpdated = true;
      subscriptionWarning = subResult.warning;
      subscriptionResult = subResult.user;
    }

    return NextResponse.json({
      ok: true,
      userId,
      oldEmail: oldEmail || authUser.email,
      newEmail,
      clearTesting: clearTesting && Boolean(profile?.is_testing),
      stripeUpdated,
      passwordResetSent,
      subscriptionUpdated,
      subscriptionWarning,
      subscription: subscriptionResult,
    });
  } catch (err) {
    console.error('[admin/users/change-email PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
