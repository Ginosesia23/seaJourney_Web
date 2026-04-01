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

const CREW_STATUSES = new Set(['active', 'inactive', 'past_due']);

/**
 * PATCH: Admin updates a crew/captain member subscription.
 * Body:
 * - { userId, action: "stripe_plan", priceId } — requires stripe_subscription_id on user
 * - { userId, action: "manual", subscriptionTier, subscriptionStatus } — DB only (comps / fixes)
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

    const { data: target, error: targetError } = await supabaseAdmin
      .from('users')
      .select(
        'id, role, stripe_subscription_id, email',
      )
      .eq('id', userId)
      .maybeSingle();

    if (targetError || !target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const role = (target.role || '').toLowerCase();
    if (role !== 'crew' && role !== 'captain') {
      return NextResponse.json(
        { error: 'Only crew and captain accounts can be updated here' },
        { status: 403 },
      );
    }

    if (action === 'stripe_plan') {
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
      const tier = typeof body.subscriptionTier === 'string'
        ? body.subscriptionTier.toLowerCase().trim()
        : '';
      let status = typeof body.subscriptionStatus === 'string'
        ? body.subscriptionStatus.toLowerCase().trim()
        : '';
      if (status === 'past-due') {
        status = 'past_due';
      }

      if (!tier || !CREW_TIERS.has(tier)) {
        return NextResponse.json(
          { error: 'Invalid subscriptionTier for crew account' },
          { status: 400 },
        );
      }
      if (!status || !CREW_STATUSES.has(status)) {
        return NextResponse.json(
          { error: 'subscriptionStatus must be active, inactive, or past-due' },
          { status: 400 },
        );
      }

      const updatePayload: Record<string, unknown> = {
        subscription_tier: tier,
        subscription_status: status,
        pending_subscription_tier: null,
        pending_change_effective_at: null,
      };

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select(
          'id, subscription_tier, subscription_status, current_period_end, cancel_at_period_end, stripe_subscription_id',
        )
        .single();

      if (updateError) {
        console.error('[ADMIN CREW SUBSCRIPTION] manual update', updateError);
        return NextResponse.json(
          {
            error: 'Failed to update user',
            details: updateError.message,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        mode: 'manual',
        user: updated,
        warning:
          target.stripe_subscription_id
            ? 'User still has an active Stripe subscription — billing may not match this manual tier until Stripe or the webhook updates it.'
            : null,
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
