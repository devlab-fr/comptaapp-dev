import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Load .env
const envContent = readFileSync(resolve(projectRoot, '.env'), 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseAnonKey = envVars.VITE_SUPABASE_ANON_KEY;

console.log('=== ENTITLEMENTS EDGE FUNCTION TEST ===\n');
console.log('SUPABASE_URL:', supabaseUrl);
console.log('Anon key (first 20 chars):', supabaseAnonKey.substring(0, 20) + '...\n');

// Create Supabase admin client (using anon key since we don't have service role)
const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey);

// Since we can't generate tokens without service role, we'll test the DB directly
// and simulate what the edge function should return
console.log('NOTE: Testing without real user token (simulating edge function logic)\n');

// Test with each company
const companies = [
  { id: 'f16c81a7-1a2c-4b31-92cc-08c46b62b08f', name: 'ENTREPRISE4', expectedPlan: 'PRO_PLUS' },
  { id: '0307c5f6-d49e-44d0-90cf-715e548d2145', name: 'ENTREPRISE3', expectedPlan: 'PRO_PLUS_PLUS' },
  { id: 'd4e20257-12bc-498a-a470-e507d13a6845', name: 'ENTREPRISE2', expectedPlan: 'PRO_PLUS_PLUS' },
  { id: 'c9103915-38dc-475e-b77e-9cf54044a5ca', name: 'ENTREPRISE1', expectedPlan: 'PRO_PLUS_PLUS' },
  { id: '55d4bbdb-9a94-4dad-8c19-b861b3dfead0', name: 'MYSOCIETY.FR', expectedPlan: 'FREE' },
];

for (const company of companies) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TESTING: ${company.name} (${company.id})`);
  console.log(`Expected plan: ${company.expectedPlan}`);
  console.log('='.repeat(80));

  // First check DB directly
  const { data: dbSub, error: dbError } = await supabaseAdmin
    .from('company_subscriptions')
    .select('plan_tier, status')
    .eq('company_id', company.id)
    .maybeSingle();

  console.log('\n1. DATABASE (company_subscriptions):');
  if (dbError) {
    console.log('   ERROR:', dbError.message);
  } else if (!dbSub) {
    console.log('   No subscription found');
  } else {
    console.log('   plan_tier:', dbSub.plan_tier);
    console.log('   status:', dbSub.status);
  }

  // Simulate what edge function SHOULD return
  console.log('\n2. SIMULATED EDGE FUNCTION OUTPUT:');
  if (!dbSub) {
    console.log('   Should return: { plan: "free", status: "inactive", limits: { maxExpensesPerMonth: 30 } }');
  } else {
    // Apply the same logic as get-user-entitlements/index.ts
    const normalizePlanTier = (input) => {
      if (!input) return "FREE";
      const normalized = String(input).trim().toUpperCase().replace(/\s+/g, "_");
      if (normalized === "FREE" || normalized === "GRATUIT") return "FREE";
      if (normalized === "PRO") return "PRO";
      if (
        normalized === "PRO_PLUS" || normalized === "PRO+" || normalized === "PROPLUS" ||
        normalized === "PRO_PLUS_PLUS" || normalized === "PRO++" || normalized === "PROPLUSPLUS"
      ) {
        if (normalized.includes("PLUS_PLUS") || normalized === "PRO++" || normalized === "PROPLUSPLUS") {
          return "PRO_PLUS_PLUS";
        }
        return "PRO_PLUS";
      }
      return "FREE";
    };

    const PLAN_TIER_TO_PLAN = {
      "FREE": "free",
      "PRO": "pro",
      "PRO_PLUS": "pro_plus",
      "PRO_PLUS_PLUS": "pro_pp",
    };

    const planTierRaw = dbSub.plan_tier || "FREE";
    const planTier = normalizePlanTier(planTierRaw);
    const plan = PLAN_TIER_TO_PLAN[planTier] || "free";
    const status = dbSub.status === "active" ? "active" : "inactive";

    const entitlements = {
      plan,
      status,
      limits: {
        maxExpensesPerMonth: plan === "free" ? 30 : null,
      },
    };

    console.log('   Should return:', JSON.stringify(entitlements, null, 2).split('\n').map(l => '   ' + l).join('\n'));

    console.log('\n3. VERIFICATION:');
    console.log('   DB plan_tier:', dbSub.plan_tier);
    console.log('   Normalized to:', planTier);
    console.log('   Converted to:', plan);
    console.log('   Status:', status);

    if (company.expectedPlan === dbSub.plan_tier) {
      console.log('   ✅ DB has expected plan');
    } else {
      console.log('   ❌ DB plan mismatch! Expected:', company.expectedPlan, 'Got:', dbSub.plan_tier);
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log('TEST COMPLETE');
console.log('='.repeat(80));
