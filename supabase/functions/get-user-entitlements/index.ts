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
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
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

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      "";

    const jwt = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();

    if (!jwt) {
      console.log('[ENTITLEMENTS_EDGE] Missing JWT');
      return new Response(JSON.stringify({ code: 401, message: "Missing JWT" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log('[ENTITLEMENTS_EDGE] JWT validation', {
      headerPrefix: authHeader.slice(0, 20),
      jwtLength: jwt.length,
      jwtParts: jwt.split(".").length,
    });

    console.log("EDGE_SUPABASE_URL:", Deno.env.get("SUPABASE_URL"));

    console.log("DEBUG supabaseUrl:", supabaseUrl);
    console.log("DEBUG anonKey_len:", (supabaseAnonKey ?? "").length);
    console.log("DEBUG jwt_len:", jwt.length);
    console.log("DEBUG jwt_parts:", jwt.split(".").length);
    console.log("DEBUG authHeader_prefix:", authHeader.slice(0, 20));

    try {
      const payload = JSON.parse(atob(jwt.split(".")[1] ?? ""));
      console.log("DEBUG jwt_iss:", payload?.iss);
      console.log("DEBUG jwt_aud:", payload?.aud);
      console.log("DEBUG jwt_exp:", payload?.exp);
      console.log("DEBUG jwt_iat:", payload?.iat);
    } catch (e) {
      console.log("DEBUG jwt_payload_decode_error");
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: { user }, error } = await supabaseUser.auth.getUser();

    console.log("DEBUG getUser_error:", error);
    console.log("DEBUG getUser_error_message:", error?.message);
    console.log("DEBUG getUser_error_status:", (error as any)?.status);
    console.log("DEBUG user_id:", user?.id);

    if (error || !user) {
      console.log('[ENTITLEMENTS_EDGE] Invalid JWT', { error: error?.message });
      return new Response(JSON.stringify({ code: 401, message: "Invalid JWT" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log('[ENTITLEMENTS_EDGE] User authenticated', { userId: user.id });

    const body = await req.json().catch(() => ({}));
    const companyId = body.companyId;

    if (!companyId) {
      return jsonResponse(DEFAULT_ENTITLEMENTS);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from("company_subscriptions")
      .select("plan_tier, status")
      .eq("company_id", companyId)
      .maybeSingle();

    console.log('[ENTITLEMENTS_EDGE] DB Query', {
      companyId,
      subscription,
      subscriptionError
    });

    if (subscriptionError || !subscription) {
      console.log('[ENTITLEMENTS_EDGE] No subscription found, returning DEFAULT');
      return jsonResponse(DEFAULT_ENTITLEMENTS);
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

    console.log('[ENTITLEMENTS_EDGE] Computed entitlements', {
      companyId,
      planTierRaw,
      planTier,
      plan,
      status,
      entitlements
    });

    return jsonResponse(entitlements);
  } catch (err) {
    console.error("ENTITLEMENTS_EDGE_ERROR", err);
    return new Response(JSON.stringify({ code: 500, message: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
