/*
  # Add UNIQUE constraints to Stripe tables

  1. Changes
    - Add UNIQUE index on `user_subscriptions(user_id)` to enable ON CONFLICT upsert
    - Add UNIQUE index on `stripe_customers(user_id)` to enable ON CONFLICT upsert
  
  2. Purpose
    - Fix 42P10 error (no unique constraint matching ON CONFLICT specification)
    - Allow upsert operations with onConflict: "user_id"
*/

CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_user_id_uidx
ON public.user_subscriptions (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS stripe_customers_user_id_uidx
ON public.stripe_customers (user_id);
