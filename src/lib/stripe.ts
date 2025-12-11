// lib/stripe.ts
import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  console.error(
    '[STRIPE INIT] ❌ STRIPE_SECRET_KEY is NOT set. Stripe calls will fail.'
  );
  console.error(
    '[STRIPE INIT] Please set STRIPE_SECRET_KEY in your environment variables.'
  );
} else {
  console.log('[STRIPE INIT] ✅ Stripe secret key found');
  console.log('[STRIPE INIT] Key prefix:', secretKey.slice(0, 8));
  console.log('[STRIPE INIT] Environment:', secretKey.startsWith('sk_live_') ? 'LIVE' : secretKey.startsWith('sk_test_') ? 'SANDBOX' : 'UNKNOWN');
}

// Initialize Stripe client - will throw if key is invalid but we still export it
// The calling code should handle errors gracefully
export const stripe = new Stripe(secretKey || '', {
  apiVersion: '2024-06-20',
});
