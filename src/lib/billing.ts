import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

/**
 * Maps a Stripe price ID to a subscription tier
 * Fetches the price from Stripe and extracts tier from metadata
 */
export async function mapPriceToTier(priceId: string): Promise<string> {
  try {
    const price = await stripe.prices.retrieve(priceId, {
      expand: ['product'],
    });

    const product = price.product as Stripe.Product;

    // Extract tier from price metadata (preferred) or product metadata
    // With the new model, tier is stored in price metadata
    let tier = 'standard'; // default
    if (price.metadata?.tier) {
      tier = price.metadata.tier.toLowerCase();
    } else if (product.metadata?.tier) {
      tier = product.metadata.tier.toLowerCase();
    } else if (price.metadata?.price_tier) {
      tier = price.metadata.price_tier.toLowerCase();
    } else {
      // Fallback: try to determine from price nickname or ID
      const priceNickname = (price.nickname || '').toLowerCase();
      if (priceNickname.includes('premium')) {
        tier = 'premium';
      } else if (priceNickname.includes('pro') || priceNickname.includes('professional')) {
        tier = 'pro';
      } else if (priceNickname.includes('standard')) {
        tier = 'standard';
      }
    }

    // Normalize tier names
    if (tier === 'professional') tier = 'pro';
    
    return tier;
  } catch (error) {
    console.error('[BILLING] Error mapping price to tier:', error);
    // Return 'standard' as a safe default
    return 'standard';
  }
}
