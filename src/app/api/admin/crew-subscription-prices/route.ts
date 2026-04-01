import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

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

function tierFromPrice(price: Stripe.Price): string {
  return (
    (price.metadata?.tier || price.metadata?.price_tier || price.nickname || 'unknown')
      .toString()
      .toLowerCase()
      .trim() || 'standard'
  );
}

/**
 * Active crew subscription prices (Stripe) for admin plan picker.
 */
export async function GET(req: NextRequest) {
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

    const productId = (process.env.STRIPE_SUBSCRIPTION_PRODUCT_ID || '')
      .trim()
      .replace(/[;,\s]+$/, '');

    if (!productId) {
      return NextResponse.json(
        { error: 'STRIPE_SUBSCRIPTION_PRODUCT_ID is not configured' },
        { status: 500 },
      );
    }

    const list = await stripe.prices.list({
      active: true,
      product: productId,
      limit: 100,
      expand: ['data.product'],
    });

    const prices = list.data
      .filter((price) => {
        const product = price.product as Stripe.Product;
        return product?.active && price.active;
      })
      .map((price) => {
        const product = price.product as Stripe.Product;
        const amount = price.unit_amount != null ? price.unit_amount / 100 : null;
        return {
          id: price.id,
          tier: tierFromPrice(price),
          nickname: price.nickname || null,
          amount,
          currency: (price.currency || 'gbp').toUpperCase(),
          interval: price.recurring?.interval || null,
          intervalCount: price.recurring?.interval_count ?? 1,
          productName: product?.name || null,
        };
      });

    return NextResponse.json({ prices });
  } catch (e) {
    console.error('[ADMIN CREW PRICES]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
