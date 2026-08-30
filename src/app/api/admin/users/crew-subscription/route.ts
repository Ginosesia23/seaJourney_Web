import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { executeSubscriptionPlanChange } from '@/lib/subscription-plan-change';

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

const CREW_TIERS = new Set([
  'free',
  'crew_limited',
  'standard',
  'premium',
]);

const VESSEL_TIERS = new Set([
  'free',
  'vessel_lite',
  'vessel_basic',
  'vessel_pro',
  'vessel_fleet',
]);

const ACCOUNT_ROLES = new Set(['crew', 'captain', 'vessel']);

const STATUSES = new Set(['active', 'inactive', 'past_due']);

/**
 * PATCH: Admin updates a crew/captain (or converts to vessel) subscription.
 * Body:
 * - { userId, action: "stripe_plan", priceId } — requires stripe_subscription_id; crew/captain only
 * - { userId, action: "manual", subscriptionTier, subscriptionStatus, role? }
 *     — DB only. `role` may be crew | captain | vessel (converts account type).
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
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const action = body.action as string;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (userId === actorId) {
      return NextResponse.json(
        { error: 'Cannot change your own account role or subscription here' },
        { status: 403 },
      );
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from('users')
      .select(
        'id, role, stripe_subscription_id, email, active_vessel_id, managed_by_vessel_id',
      )
      .eq('id', userId)
      .maybeSingle();

    if (targetError || !target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentRole = (target.role || '').toLowerCase();
    if (currentRole === 'admin') {
      return NextResponse.json(
        { error: 'Cannot update admin accounts here' },
        { status: 403 },
      );
    }

    if (action === 'stripe_plan') {
      if (currentRole !== 'crew' && currentRole !== 'captain') {
        return NextResponse.json(
          { error: 'Stripe plan changes are only for crew and captain accounts' },
          { status: 403 },
        );
      }

      const priceId = typeof body.priceId === 'string' ? body.priceId.trim() : '';
      if (!priceId) {
        return NextResponse.json({ error: 'Missing priceId' }, { status: 400 });
      }

      const subId = target.stripe_subscription_id;
      if (!subId) {
        return NextResponse.json(
          {
            error:
              'This user has no Stripe subscription ID. Use a manual tier update or they must subscribe in the app first.',
          },
          { status: 400 },
        );
      }

      try {
        const result = await executeSubscriptionPlanChange({
          subscriptionId: subId,
          priceId,
          userId,
        });
        return NextResponse.json(result.body, { status: result.status });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Stripe plan change failed';
        console.error('[ADMIN CREW SUBSCRIPTION] stripe_plan', err);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    if (action === 'manual') {
      // Starting role must be crew/captain (this page’s source list) or already vessel
      // if an admin is adjusting after conversion.
      if (
        currentRole !== 'crew' &&
        currentRole !== 'captain' &&
        currentRole !== 'vessel'
      ) {
        return NextResponse.json(
          { error: 'Only crew, captain, or vessel accounts can be updated here' },
          { status: 403 },
        );
      }

      let nextRole = currentRole;
      if (typeof body.role === 'string' && body.role.trim()) {
        nextRole = body.role.toLowerCase().trim();
      }
      if (!ACCOUNT_ROLES.has(nextRole)) {
        return NextResponse.json(
          { error: 'role must be crew, captain, or vessel' },
          { status: 400 },
        );
      }

      const tier =
        typeof body.subscriptionTier === 'string'
          ? body.subscriptionTier.toLowerCase().trim()
          : '';
      let status =
        typeof body.subscriptionStatus === 'string'
          ? body.subscriptionStatus.toLowerCase().trim()
          : '';
      if (status === 'past-due') {
        status = 'past_due';
      }

      const allowedTiers = nextRole === 'vessel' ? VESSEL_TIERS : CREW_TIERS;
      if (!tier || !allowedTiers.has(tier)) {
        return NextResponse.json(
          {
            error:
              nextRole === 'vessel'
                ? 'Invalid subscriptionTier for vessel account'
                : 'Invalid subscriptionTier for crew account',
          },
          { status: 400 },
        );
      }
      if (!status || !STATUSES.has(status)) {
        return NextResponse.json(
          { error: 'subscriptionStatus must be active, inactive, or past-due' },
          { status: 400 },
        );
      }

      const roleChanged = nextRole !== currentRole;
      const updatePayload: Record<string, unknown> = {
        role: nextRole,
        subscription_tier: tier,
        subscription_status: status,
        pending_subscription_tier: null,
        pending_change_effective_at: null,
      };

      // Converting to a vessel manager: drop crew-side links that would confuse
      // vessel-manager flows. They can create / attach a vessel afterward.
      // Note: linked_account_features is NOT NULL (JSONB) — reset to [] rather than null.
      if (roleChanged && nextRole === 'vessel') {
        updatePayload.active_vessel_id = null;
        updatePayload.managed_by_vessel_id = null;
        updatePayload.linked_account_features = [];
      }

      // Converting back to crew/captain from vessel: clear vessel-manager link.
      if (roleChanged && nextRole !== 'vessel' && currentRole === 'vessel') {
        updatePayload.active_vessel_id = null;
        updatePayload.managed_by_vessel_id = null;
        updatePayload.linked_account_features = [];
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select(
          'id, role, subscription_tier, subscription_status, current_period_end, cancel_at_period_end, stripe_subscription_id, active_vessel_id',
        )
        .single();

      if (updateError) {
        console.error('[ADMIN CREW SUBSCRIPTION] manual update', updateError);
        return NextResponse.json(
          {
            error: updateError.message || 'Failed to update user',
            details: updateError.message,
            code: updateError.code,
          },
          { status: 500 },
        );
      }

      const warnings: string[] = [];
      if (target.stripe_subscription_id) {
        warnings.push(
          'User still has a Stripe subscription — billing may not match this manual tier until Stripe or the webhook updates it.',
        );
      }
      if (roleChanged && nextRole === 'vessel') {
        warnings.push(
          'Account is now a vessel account. It will leave the Crew subscriptions list; manage it under Vessel subscriptions after linking a vessel.',
        );
      }
      if (roleChanged && currentRole === 'vessel' && nextRole !== 'vessel') {
        warnings.push(
          'Account was converted from vessel back to a crew-style role.',
        );
      }

      return NextResponse.json({
        success: true,
        mode: 'manual',
        roleChanged,
        user: updated,
        warning: warnings.length ? warnings.join(' ') : null,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use stripe_plan or manual.' },
      { status: 400 },
    );
  } catch (e) {
    console.error('[ADMIN CREW SUBSCRIPTION]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
