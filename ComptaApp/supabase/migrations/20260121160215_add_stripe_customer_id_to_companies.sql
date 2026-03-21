/*
  # Add Stripe Customer ID to Companies

  1. Changes
    - Add `stripe_customer_id` column to `companies` table
    - Each company gets its own Stripe customer for multi-company support
    - Column is nullable (will be populated on first subscription)
    - Unique constraint ensures one company per Stripe customer

  2. Notes
    - This enables per-company billing in multi-company setup
    - stripe_customer_id is created on-demand during first checkout
*/

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer_id
ON companies(stripe_customer_id);