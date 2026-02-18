import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2024-12-18.acacia",
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRICE_TO_PLAN: Record<string, string> = {
  "price_1SeoNyCtfAi17goGuN8R2xUQ": "pro",
  "price_1SeoSuCtfAi17goG7qDAxnuc": "pro_plus",
  "price_1SgVlJCtfAi17goGZF7y9sVk": "pro_pp",
};

type PlanTier = "FREE" | "PRO" | "PRO_PLUS" | "PRO_PLUS_PLUS";

function normalizePlanTier(input: string | null | undefined): PlanTier {
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

  console.warn("NORMALIZE_PLAN_UNKNOWN", { input, normalized, fallback: "FREE" });
  return "FREE";
}

const PLAN_TIER_TO_PLAN: Record<PlanTier, string> = {
  "FREE": "free",
  "PRO": "pro",
  "PRO_PLUS": "pro_plus",
  "PRO_PLUS_PLUS": "pro_pp",
};

const DEFAULT_ENTITLEMENTS = {
  plan: "free",
  status: "inactive",
  limits: {
    maxExpensesPerMonth: 30,
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify(DEFAULT_ENTITLEMENTS), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify(DEFAULT_ENTITLEMENTS), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const companyId = body.companyId;

    if (!companyId) {
      return new Response(JSON.stringify(DEFAULT_ENTITLEMENTS), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from("company_subscriptions")
      .select("plan_tier, status")
      .eq("company_id", companyId)
      .maybeSingle();

    if (subscriptionError || !subscription) {
      return new Response(JSON.stringify(DEFAULT_ENTITLEMENTS), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const planTierRaw = subscription.plan_tier || "FREE";
    const planTier = normalizePlanTier(planTierRaw);
    const plan = PLAN_TIER_TO_PLAN[planTier] || "free";
    const status = subscription.status === "active" ? "active" : "inactive";

    const entitlements = {
      plan,
      status,
      limits: {
        maxExpensesPerMonth: plan === "free" ? 30 : null,
      },
    };

    return new Response(JSON.stringify(entitlements), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ENTITLEMENTS_EDGE_ERROR", err);
    return new Response(JSON.stringify(DEFAULT_ENTITLEMENTS), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
