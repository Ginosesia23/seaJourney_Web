// app/api/billing/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getStripeProducts,
  getUserStripeSubscription,
} from '@/app/actions';
import { syncSupabaseUserFromStripeSubscription } from '@/lib/sync-user-stripe-billing';
import { extractTierFromSubscription } from '@/lib/stripe-subscription-helpers';
import { expireCompGrantIfNeeded } from '@/lib/partner-promo';
import { shouldSyncSubscriptionFromStripe } from '@/lib/subscription-tier-labels';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: Request) {
  console.log(
    '[API /api/billing] Has STRIPE_SECRET_KEY?',
    !!process.env.STRIPE_SECRET_KEY,
    process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.slice(0, 8) + '...' : 'undefined'
  );

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const isVesselAccount = searchParams.get('isVesselAccount') === 'true';

  if (!email) {
    return NextResponse.json(
      { error: 'Missing email parameter' },
      { status: 400 },
    );
  }

  try {
    console.log('[API /api/billing] Fetching subscription data for:', email);
    console.log('[API /api/billing] Is vessel account:', isVesselAccount);
    
    const subscriptionData = await getUserStripeSubscription(email);
    const stripePrices = await getStripeProducts(isVesselAccount);

    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) {
      const {
        data: { user },
        error: authErr,
      } = await supabaseAdmin.auth.getUser(token);
      if (
        !authErr &&
        user?.id &&
        user.email?.toLowerCase() === email.trim().toLowerCase()
      ) {
        const { data: profileRow } = await supabaseAdmin
          .from('users')
          .select(
            'is_testing, stripe_subscription_id, subscription_tier, subscription_status',
          )
          .eq('id', user.id)
          .maybeSingle();

        const maySyncFromStripe = shouldSyncSubscriptionFromStripe(profileRow);

        if (subscriptionData?.subscription && maySyncFromStripe) {
          try {
            await syncSupabaseUserFromStripeSubscription(
              user.id,
              subscriptionData.subscription,
            );
          } catch (syncErr) {
            console.error('[API /api/billing] Profile sync from Stripe failed:', syncErr);
          }
        } else if (!subscriptionData?.subscription) {
          try {
            await expireCompGrantIfNeeded(user.id);
          } catch (expireErr) {
            console.error('[API /api/billing] Comp expiry failed:', expireErr);
          }
        } else if (subscriptionData?.subscription && !maySyncFromStripe) {
          console.log(
            '[API /api/billing] Skipping Stripe tier sync — manual/demo account',
            { userId: user.id, isTesting: profileRow?.is_testing },
          );
        }
      }
    }

    const stripeTierLive = subscriptionData?.subscription
      ? extractTierFromSubscription(subscriptionData.subscription)
      : null;

    console.log('[API /api/billing] Successfully fetched:', {
      hasSubscriptionData: !!subscriptionData,
      pricesCount: stripePrices.length,
      stripeTierLive,
    });

    return NextResponse.json(
      { subscriptionData, stripePrices, stripeTierLive },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[API /api/billing] Error:', err);
    console.error('[API /api/billing] Error details:', {
      message: err?.message,
      type: err?.type,
      code: err?.code,
      isVesselAccount,
    });
    return NextResponse.json(
      {
        error:
          err?.message ||
          'Failed to load billing data. Please try again later.',
      },
      { status: 500 },
    );
  }
}
