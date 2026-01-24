-- Add Stripe-related columns to users table
-- This migration adds stripe_subscription_id and stripe_customer_id columns
-- to track Stripe subscriptions and customers in the users table

-- Add stripe_subscription_id column (nullable, stores Stripe subscription ID)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add stripe_customer_id column (nullable, stores Stripe customer ID)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN users.stripe_subscription_id IS 'Stripe subscription ID for this user';
COMMENT ON COLUMN users.stripe_customer_id IS 'Stripe customer ID for this user';
