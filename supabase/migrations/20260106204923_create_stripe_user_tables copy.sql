/*
  # Tables Stripe pour abonnements utilisateur

  1. Nouvelles Tables
    - `stripe_customers`
      - `user_id` (uuid, référence utilisateur)
      - `stripe_customer_id` (text, ID client Stripe)
      - `created_at` (timestamp)
    - `user_subscriptions`
      - `id` (uuid, PK)
      - `user_id` (uuid, référence utilisateur)
      - `stripe_subscription_id` (text, ID abonnement Stripe)
      - `stripe_customer_id` (text, ID client Stripe)
      - `price_id` (text, ID prix Stripe)
      - `status` (text, statut abonnement)
      - `current_period_end` (timestamp, fin période actuelle)
      - `plan_tier` (text, FREE/PRO/PRO_PLUS/PRO_PLUS_PLUS)
      - `cancel_at_period_end` (boolean, annulation prévue)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Sécurité
    - Enable RLS sur toutes les tables
    - Policies pour utilisateurs authentifiés
*/

-- Table stripe_customers
CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id uuid PRIMARY KEY,
  stripe_customer_id text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own stripe customer"
  ON stripe_customers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Table user_subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stripe_subscription_id text UNIQUE NOT NULL,
  stripe_customer_id text NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  plan_tier text NOT NULL DEFAULT 'FREE',
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON user_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription_id ON user_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe_customer_id ON stripe_customers(stripe_customer_id);