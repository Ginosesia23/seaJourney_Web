// lib/stripe.ts
import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  console.error(
    '[STRIPE INIT] STRIPE_SECRET_KEY is NOT set. Stripe calls will fail.'
  );
}

export const stripe = new Stripe(secretKey as string, {
  apiVersion: '2024-06-20',
});
