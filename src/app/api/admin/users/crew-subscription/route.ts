import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { applyManualSubscriptionUpdate } from '@/lib/admin/manual-subscription';
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
      const tier =
        typeof body.subscriptionTier === 'string'
          ? body.subscriptionTier.toLowerCase().trim()
          : '';
      let status =
        typeof body.subscriptionStatus === 'string'
          ? body.subscriptionStatus.toLowerCase().trim()
          : '';

      if (!tier || !status) {
        return NextResponse.json(
          { error: 'Missing subscriptionTier or subscriptionStatus' },
          { status: 400 },
        );
      }

      const result = await applyManualSubscriptionUpdate(userId, {
        role: typeof body.role === 'string' ? body.role : undefined,
        subscriptionTier: tier,
        subscriptionStatus: status,
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json({
        success: true,
        mode: 'manual',
        roleChanged: result.roleChanged,
        user: result.user,
        warning: result.warning,
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
