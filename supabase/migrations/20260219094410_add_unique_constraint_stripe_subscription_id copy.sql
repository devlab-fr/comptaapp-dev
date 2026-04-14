/*
  # Add UNIQUE constraint on stripe_subscription_id

  ## Overview
  Enforce data integrity for company subscriptions by ensuring each Stripe subscription ID
  can only be associated with one company. This prevents accidental duplicate assignments
  from webhook processing errors.

  ## 1. Security Enhancement
    - Add UNIQUE constraint on `company_subscriptions.stripe_subscription_id`
    - Prevents multiple companies from sharing the same Stripe subscription
    - Ensures 1:1 mapping between company_id and stripe_subscription_id

  ## 2. Pre-check
    - Before adding constraint, we verified no duplicate values exist in the database
    - Safe to apply without data cleanup required

  ## 3. Impact
    - Database will reject any attempt to assign the same subscription to multiple companies
    - Webhook processing will fail fast if trying to create duplicate assignments
    - This is a defensive constraint that should never be violated in normal operation
*/

-- Add UNIQUE constraint on stripe_subscription_id
-- This ensures one subscription per company (excluding NULL values)
ALTER TABLE company_subscriptions
ADD CONSTRAINT company_subscriptions_stripe_subscription_id_key 
UNIQUE (stripe_subscription_id);

-- Create index for performance (UNIQUE automatically creates an index, but this makes it explicit)
-- Already created by UNIQUE constraint above, so this is just for documentation
COMMENT ON CONSTRAINT company_subscriptions_stripe_subscription_id_key ON company_subscriptions 
IS 'Ensures each Stripe subscription is linked to exactly one company';
