/*
  # Create company subscriptions table - Plan per company

  ## Overview
  Shift from user-level plans to company-level plans.
  Each company has its own subscription plan independent of the user's other companies.

  ## 1. New Tables
    - `company_subscriptions`
      - `company_id` (uuid, primary key, references companies)
      - `plan_tier` (text) - Plan tier (FREE, PRO, PRO_PLUS, PRO_PLUS_PLUS)
      - `stripe_subscription_id` (text, nullable) - Stripe subscription ID
      - `status` (text, nullable) - Subscription status (active, trialing, past_due, canceled, etc.)
      - `current_period_end` (timestamptz, nullable) - Current period end date
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  ## 2. Security
    - Enable RLS on `company_subscriptions` table
    - Add policy for users to read subscriptions of their companies
    - Add policy for system to insert/update subscriptions

  ## 3. Triggers
    - Auto-create FREE subscription when company is created
    - Auto-update updated_at timestamp

  ## 4. Data Migration
    - Migrate existing companies to have FREE subscriptions by default
    - Companies owned by users with paid plans will be upgraded in next migration
*/

-- Create company_subscriptions table
CREATE TABLE IF NOT EXISTS company_subscriptions (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  plan_tier text NOT NULL DEFAULT 'FREE' CHECK (plan_tier IN ('FREE', 'PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')),
  stripe_subscription_id text,
  status text,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read subscriptions of their companies
CREATE POLICY "Users can read company subscriptions"
  ON company_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_subscriptions.company_id
      AND memberships.user_id = auth.uid()
    )
  );

-- System can insert company subscriptions
CREATE POLICY "System can insert company subscriptions"
  ON company_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_subscriptions.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role = 'owner'
    )
  );

-- System can update company subscriptions
CREATE POLICY "System can update company subscriptions"
  ON company_subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_subscriptions.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role = 'owner'
    )
  );

-- Function to auto-create FREE subscription when company is created
CREATE OR REPLACE FUNCTION create_company_subscription_on_company_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.company_subscriptions (company_id, plan_tier, status)
  VALUES (NEW.id, 'FREE', 'active')
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto-subscription creation
DROP TRIGGER IF EXISTS trg_create_company_subscription ON companies;
CREATE TRIGGER trg_create_company_subscription
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION create_company_subscription_on_company_insert();

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_company_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS company_subscriptions_updated_at ON company_subscriptions;
CREATE TRIGGER company_subscriptions_updated_at
  BEFORE UPDATE ON company_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_company_subscriptions_updated_at();

-- Migrate existing companies to FREE subscriptions
INSERT INTO company_subscriptions (company_id, plan_tier, status)
SELECT id, 'FREE', 'active'
FROM companies
ON CONFLICT (company_id) DO NOTHING;