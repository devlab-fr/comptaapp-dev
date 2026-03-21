/*
  # Create profiles table with subscription plan management

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `plan_tier` (text) - Current subscription plan (FREE, PRO, PRO_PLUS, PRO_PLUS_PLUS)
      - `is_founder` (boolean) - Founder status for lifetime access
      - `plan_source` (text) - Source of plan assignment (internal, stripe)
      - `stripe_customer_id` (text, nullable) - Stripe customer ID
      - `stripe_subscription_id` (text, nullable) - Stripe subscription ID
      - `stripe_price_id` (text, nullable) - Stripe price ID
      - `current_period_end` (timestamptz, nullable) - Current subscription period end
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `profiles` table
    - Add policy for users to read their own profile
    - Add policy for users to update their own profile
  
  3. Triggers
    - Auto-create profile on user signup
    - Auto-update updated_at timestamp
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier text NOT NULL DEFAULT 'FREE' CHECK (plan_tier IN ('FREE', 'PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')),
  is_founder boolean NOT NULL DEFAULT false,
  plan_source text NOT NULL DEFAULT 'internal' CHECK (plan_source IN ('internal', 'stripe')),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- System policy for insert (will be used by trigger)
CREATE POLICY "System can insert profiles"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, plan_tier, is_founder, plan_source)
  VALUES (NEW.id, 'FREE', false, 'internal')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto-profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_profile_on_signup();

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_updated_at();

-- Create profiles for existing users
INSERT INTO profiles (id, plan_tier, is_founder, plan_source)
SELECT id, 'FREE', false, 'internal'
FROM auth.users
ON CONFLICT (id) DO NOTHING;
