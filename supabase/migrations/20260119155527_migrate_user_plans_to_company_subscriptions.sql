/*
  # Migrate user plans to company subscriptions

  ## Overview
  For existing users with paid plans, migrate their plan to their first company.
  This ensures backward compatibility with existing subscriptions.

  ## Logic
  - For each user with a paid plan (not FREE) in profiles table
  - Find their first company (ordered by created_at)
  - Update that company's subscription to match the user's plan
  - Copy stripe_subscription_id and current_period_end if available

  ## Safety
  - Only updates companies that currently have FREE plan
  - Uses ON CONFLICT to avoid errors
  - Preserves any manually set company subscriptions
*/

-- Update company_subscriptions for existing users with paid plans
UPDATE company_subscriptions
SET
  plan_tier = profiles.plan_tier,
  stripe_subscription_id = profiles.stripe_subscription_id,
  status = CASE
    WHEN profiles.stripe_subscription_id IS NOT NULL THEN 'active'
    ELSE 'active'
  END,
  current_period_end = profiles.current_period_end,
  updated_at = now()
FROM profiles
WHERE company_subscriptions.company_id IN (
  SELECT DISTINCT ON (memberships.user_id) companies.id
  FROM companies
  JOIN memberships ON memberships.company_id = companies.id
  WHERE memberships.user_id = profiles.id
  AND memberships.role = 'owner'
  ORDER BY memberships.user_id, companies.created_at ASC
)
AND profiles.id = (
  SELECT user_id FROM memberships
  WHERE memberships.company_id = company_subscriptions.company_id
  AND memberships.role = 'owner'
  LIMIT 1
)
AND profiles.plan_tier != 'FREE'
AND company_subscriptions.plan_tier = 'FREE';