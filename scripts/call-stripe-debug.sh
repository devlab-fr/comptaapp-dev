#!/bin/bash

# This script calls the stripe-debug-company edge function using service role auth

SUPABASE_URL="https://lmbxmluyggwvvjpyvlnt.supabase.co"
COMPANY_ID="c9103915-38dc-475e-b77e-9cf54044a5ca"
EXPECTED_NAME="ENTREPRISE1"

echo "=== CALLING STRIPE-DEBUG-COMPANY EDGE FUNCTION ==="
echo "Company ID: $COMPANY_ID"
echo "Expected Name: $EXPECTED_NAME"
echo ""

# Get service role key from Supabase project settings
# We need to call this via a different method since service role is not in .env

# Alternative: Use supabase CLI to get the service role key
SERVICE_ROLE_KEY=$(supabase status 2>/dev/null | grep "service_role key" | awk '{print $NF}')

if [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "ERROR: Could not retrieve service role key from supabase CLI"
  echo "Trying to read from environment variables in edge function runtime..."
  echo ""
  echo "NOTE: Service role key is only available in edge function runtime context."
  echo "We need to use a different approach - calling via authenticated user session."
  exit 1
fi

echo "Service Role Key found (first 20 chars): ${SERVICE_ROLE_KEY:0:20}..."
echo ""

# Make the API call
RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/stripe-debug-company" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"companyId\":\"$COMPANY_ID\",\"expectedCompanyName\":\"$EXPECTED_NAME\"}")

echo "=== RESPONSE ==="
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""
