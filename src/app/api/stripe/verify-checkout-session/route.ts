// app/api/stripe/verify-checkout-session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function jsonNoStore(data: any, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      // Avoid any caching in Next/fetch/CDN layers
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store',
    },
  });
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // Stripe success_url should pass:
    // /payment-success?session_id={CHECKOUT_SESSION_ID}
    const sessionId =
      url.searchParams.get('session_id') ||
      url.searchParams.get('sessionId') ||
      '';

    if (!sessionId || typeof sessionId !== 'string') {
      return jsonNoStore(
        {
          success: false,
          status: 'error',
          error: 'Missing session_id',
        },
        { status: 400 },
      );
    }

    console.log('[VERIFY] Received verification request (GET)');
    console.log('[VERIFY] Retrieving Stripe session:', sessionId);

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as any)?.id || null;

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer as any)?.id || null;

    const meta = session.metadata || {};
    const userId = (meta.userId as string | undefined) || undefined;
    const tier = ((meta.tier || 'standard') as string).toLowerCase();

    console.log('[VERIFY] Stripe session retrieved:', {
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      mode: session.mode,
      metadata: session.metadata,
      subscriptionId,
      customerId,
    });

    /**
     * ✅ Key change:
     * For Checkout, treat `session.status === "complete"` as the primary indicator.
     * The DB/webhook update may lag slightly; that's not a failure.
     */
    const checkoutComplete = session.status === 'complete';

    if (!checkoutComplete) {
      // This is a real "not completed" case
      console.warn('[VERIFY] Checkout not complete yet:', {
        status: session.status,
        payment_status: session.payment_status,
        subscription_status:
          typeof session.subscription === 'object'
            ? (session.subscription as any)?.status
            : 'N/A',
      });

      return jsonNoStore(
        {
          success: false,
          status: 'error',
          error: 'Checkout not complete',
          session_status: session.status,
          payment_status: session.payment_status,
        },
        { status: 400 },
      );
    }

    // If you don't have a userId in metadata, Stripe is verified but you can't map it.
    // Still return success so UI can proceed (you can handle mapping elsewhere).
    if (!userId) {
      console.warn('[VERIFY] No userId in session.metadata; cannot update DB');
      return jsonNoStore({
        success: true,
        status: 'success',
        tier,
        subscriptionId,
        customerId,
        productName: meta.productName,
        payment_status: session.payment_status,
        session_status: session.status,
        warning: 'Verified with Stripe but no userId in metadata (DB not updated).',
      });
    }

    /**
     * ✅ Wait for webhook to update DB (source of truth),
     * but if it doesn't happen quickly, we still return "processing"
     * rather than "failed".
     */
    const MAX_RETRIES = 10; // ~10 seconds total
    const RETRY_DELAY_MS = 1000;

    let lastUserRow:
      | {
          subscription_tier: string | null;
          subscription_status: string | null;
          stripe_subscription_id: string | null;
        }
      | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('subscription_tier, subscription_status, stripe_subscription_id')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('[VERIFY] DB check error (will keep trying):', error);
      }

      lastUserRow = user ?? lastUserRow;

      const dbActive = user?.subscription_status === 'active';

      if (dbActive) {
        console.log('[VERIFY] ✅ Subscription active in DB (webhook likely finished).');
        return jsonNoStore({
          success: true,
          status: 'success',
          tier: user?.subscription_tier || tier,
          subscriptionId: user?.stripe_subscription_id || subscriptionId,
          customerId,
          productName: meta.productName,
          payment_status: session.payment_status,
          session_status: session.status,
          alreadyUpdated: true,
        });
      }

      if (attempt < MAX_RETRIES) {
        console.log(`[VERIFY] DB not active yet (attempt ${attempt}/${MAX_RETRIES})...`);
        await sleep(RETRY_DELAY_MS);
      }
    }

    /**
     * ✅ If webhook is still processing after retries:
     * Return "processing" (NOT failure). Your success page should keep polling
     * or redirect after it sees the active status.
     */
    console.warn(
      '[VERIFY] ⚠️ Stripe complete but DB not active yet after retries. Returning processing.',
    );

    return jsonNoStore({
      success: true,
      status: 'processing',
      tier: lastUserRow?.subscription_tier || tier,
      subscriptionId: lastUserRow?.stripe_subscription_id || subscriptionId,
      customerId,
      productName: meta.productName,
      payment_status: session.payment_status,
      session_status: session.status,
      warning:
        'Stripe checkout is complete. Subscription activation is still processing. Please wait a moment or refresh.',
    });
  } catch (err: any) {
    console.error('[VERIFY] ❌ Error verifying checkout session:', err);
    return jsonNoStore(
      {
        success: false,
        status: 'error',
        error: err?.message || 'Verification error',
      },
      { status: 500 },
    );
  }
}

/**
 * Optional: keep POST for backwards compatibility if your client already calls POST.
 * It forwards to GET logic by translating body.sessionId -> ?session_id=
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = body?.sessionId || body?.session_id;

    if (!sessionId || typeof sessionId !== 'string') {
      return jsonNoStore(
        { success: false, status: 'error', error: 'Missing sessionId' },
        { status: 400 },
      );
    }

    // Rebuild URL with query param and call GET handler
    const url = new URL(req.url);
    url.searchParams.set('session_id', sessionId);

    // Create a shallow clone request to reuse GET
    const rewrittenReq = new NextRequest(url.toString(), {
      method: 'GET',
      headers: req.headers,
    });

    return GET(rewrittenReq);
  } catch (err: any) {
    console.error('[VERIFY] ❌ Error in POST wrapper:', err);
    return jsonNoStore(
      { success: false, status: 'error', error: err?.message || 'Bad request' },
      { status: 400 },
    );
  }
}
