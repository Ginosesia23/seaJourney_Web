# Subscription Payment Flow

This document describes how subscription payments are processed and how the Supabase `users` table is updated.

## Flow Overview

1. **User selects a plan** (`/offers` page)
2. **Checkout session created** (`createCheckoutSession` in `actions.ts`)
3. **User completes payment** on Stripe
4. **Redirect to success page** (`/payment-success`)
5. **Payment verified** and **Supabase updated**

## Detailed Steps

### 1. Checkout Session Creation (`src/app/actions.ts`)

When a user clicks "Choose Plan", `createCheckoutSession` is called:

```typescript
// Fetches the Stripe product/price
const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
const product = price.product as Stripe.Product;

// Extracts tier from product metadata or name
let tier = 'premium'; // default
if (product.metadata?.tier) {
  tier = product.metadata.tier;
} else if (product.name) {
  // Smart extraction from product name
  // "SeaJourney Premium" -> "premium"
  // "SeaJourney Pro" -> "pro"
}

// Creates checkout session with tier in metadata
const session = await stripe.checkout.sessions.create({
  // ... other config
  metadata: {
    userId,
    priceId,
    tier,        // ← Tier stored here
    productId,
    productName,
  },
  success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
});
```

### 2. Payment Verification (`src/app/api/stripe/verify-checkout-session/route.ts`)

After payment, the success page calls the verification API:

```typescript
// Retrieves the checkout session
const session = await stripe.checkout.sessions.retrieve(sessionId);

// Extracts tier from metadata
const tier = session.metadata?.tier || 'premium';

// Returns tier to client
return { success: true, tier, productId, productName, userId };
```

### 3. Supabase Update (`src/app/payment-success/page.tsx`)

The payment success page updates the Supabase `users` table:

```typescript
// Gets tier from verification result
const tier = result.tier ?? 'premium';

// Updates Supabase users table
await updateUserProfile(supabase, user.id, {
  subscriptionStatus: 'active',
  subscriptionTier: tier,  // ← Updates subscription_tier column
});
```

### 4. Database Update (`src/supabase/database/queries.ts`)

The `updateUserProfile` function updates the Supabase table:

```typescript
await supabase
  .from('users')
  .update({
    subscription_status: 'active',
    subscription_tier: tier,  // ← Stored in database
  })
  .eq('id', userId);
```

## Tier Extraction Logic

The tier is determined in this order:

1. **Product Metadata** (`product.metadata.tier`) - Recommended
   - Set this in Stripe Dashboard → Products → [Your Product] → Metadata
   - Add key: `tier`, value: `premium`, `pro`, `basic`, etc.

2. **Product Name Parsing** (fallback)
   - Looks for keywords: "premium", "pro", "basic" in product name
   - Example: "SeaJourney Premium" → `premium`

3. **Default** (if neither works)
   - Falls back to `'premium'`

## Recommended Stripe Setup

### Option 1: Use Product Metadata (Best Practice)

In Stripe Dashboard:
1. Go to Products → [Your Product]
2. Scroll to "Metadata"
3. Add:
   - Key: `tier`
   - Value: `premium` (or `pro`, `basic`, etc.)

### Option 2: Use Product Names

Name your products clearly:
- "SeaJourney Premium" → tier: `premium`
- "SeaJourney Pro" → tier: `pro`
- "SeaJourney Basic" → tier: `basic`

## Database Schema

The `users` table has these subscription fields:

```sql
subscription_tier TEXT NOT NULL DEFAULT 'free'
subscription_status TEXT NOT NULL DEFAULT 'inactive' 
  CHECK (subscription_status IN ('active', 'inactive', 'past-due'))
```

## Testing

1. Create a test product in Stripe with metadata `tier: 'premium'`
2. Complete a test payment
3. Check Supabase `users` table:
   ```sql
   SELECT id, email, subscription_tier, subscription_status 
   FROM users 
   WHERE id = 'your-user-id';
   ```
4. Verify `subscription_tier` and `subscription_status` are updated correctly

