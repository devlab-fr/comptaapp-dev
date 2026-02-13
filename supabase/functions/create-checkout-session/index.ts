import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info, Content-Type, Authorization, Apikey, X-Client-Info",
  "Access-Control-Max-Age": "86400",
};

const TIER_TO_PRICE: Record<string, string> = {
  PRO: Deno.env.get("STRIPE_PRICE_PRO") || "",
  PRO_PLUS: Deno.env.get("STRIPE_PRICE_PRO_PLUS") || "",
  PRO_PLUS_PLUS: Deno.env.get("STRIPE_PRICE_PRO_PP") || "",
};

const TIER_RANK: Record<string, number> = {
  FREE: 0,
  PRO: 1,
  PRO_PLUS: 2,
  PRO_PLUS_PLUS: 3,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  console.log("=== CREATE-CHECKOUT-SESSION CALLED ===", {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
  });

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey || stripeSecretKey.trim() === "") {
    console.log("[STRIPE_DISABLED] missing STRIPE_SECRET_KEY", {
      ts: new Date().toISOString(),
      fn: "create-checkout-session",
    });
    return new Response(
      JSON.stringify({ error: "STRIPE_DISABLED", message: "Stripe not configured yet" }),
      {
        status: 501,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-12-18.acacia",
  });

  console.log("EDGE_EXPECTED", {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    projectRef: Deno.env.get("SUPABASE_URL")?.split("//")[1]?.split(".")[0] || "unknown",
  });

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    console.log("CHECKOUT_AUTH_HEADER", {
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader?.substring(0, 20) || "none",
    });

    if (!authHeader) {
      console.error("CHECKOUT_AUTH_ERROR", "MISSING_AUTH_HEADER");
      return new Response(JSON.stringify({ error: "MISSING_AUTH_HEADER" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startsBearer = authHeader.toLowerCase().startsWith("bearer ");
    const token = authHeader.replace(/^Bearer /i, "").trim();

    let jwtPayload: any = null;
    let issProjectRef: string | null = null;
    let iss: string | null = null;

    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        jwtPayload = JSON.parse(atob(parts[1]));
        iss = jwtPayload?.iss || null;
        if (iss) {
          const issMatch = iss.match(/https?:\/\/([^.]+)\.supabase\.co/);
          issProjectRef = issMatch ? issMatch[1] : null;
        }
      }
    } catch (e) {
      console.warn("CHECKOUT_JWT_DECODE_FAILED", e);
    }

    const expectedSupabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    let expectedProjectRef: string | null = null;
    try {
      const urlMatch = expectedSupabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
      expectedProjectRef = urlMatch ? urlMatch[1] : null;
    } catch (e) {
      console.warn("EXPECTED_URL_PARSE_FAILED", e);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { planTier, companyId } = await req.json();
    console.log("CHECKOUT_REQUEST_PARAMS_EARLY", { planTier, companyId });

    const projectRef = (() => {
      try {
        const host = new URL(supabaseUrl).host;       // ex: lmbxmluyggwvvjpyvlnt.supabase.co
        return host.split(".")[0] || "invalid";
      } catch {
        return "invalid";
      }
    })();

    console.log("AUTH_ENV_CHECK", {
      supabaseUrl,
      projectRef,
      anonKey: supabaseAnonKey ? "set" : "missing",
      authHeaderPresent: !!authHeader,
      tokenPrefix: token ? token.substring(0, 12) : "missing",
      tokenParts: token ? token.split(".").length : 0,
      issFromToken: iss || null,
      issProjectRef: issProjectRef || null,
      expectedProjectRef: expectedProjectRef || null,
    });

    if (projectRef !== "lmbxmluyggwvvjpyvlnt") {
      console.error("AUTH_PROJECT_MISMATCH", { projectRef, expected: "lmbxmluyggwvvjpyvlnt" });
      return new Response(JSON.stringify({
        error: "AUTH_PROJECT_MISMATCH",
        projectRef,
        expected: "lmbxmluyggwvvjpyvlnt",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log("CHECKOUT_AUTH_USER", {
      hasUser: !!user,
      userId: user?.id || "none",
      userEmail: user?.email || "none",
      error: userError?.message || null,
    });

    if (userError || !user) {
      console.error("CHECKOUT_AUTH_ERROR", "INVALID_JWT", {
        message: userError?.message,
        jwtExpired: jwtPayload?.exp ? jwtPayload.exp < Date.now() / 1000 : null,
      });
      return new Response(JSON.stringify({
        code: 401,
        message: "Invalid JWT",
        debug: {
          iss,
          issProjectRef,
          expectedSupabaseUrl,
          expectedProjectRef,
          tokenLen: token.length,
          startsBearer,
        }
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("CHECKOUT_USER_AUTHENTICATED", { userId: user.id, email: user.email });

    console.log("CHECKOUT_REQUEST_PARAMS", { planTier, companyId, userId: user.id });

    if (!companyId) {
      console.error("CHECKOUT_NO_COMPANY_ID", { userId: user.id });
      return new Response(JSON.stringify({
        error: "Missing companyId",
        debug: { userId: user.id }
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedTarget = (planTier || "").toUpperCase();
    const priceId = TIER_TO_PRICE[normalizedTarget];

    console.log("CHECKOUT_PRICE_MAPPING", {
      planTierRaw: planTier,
      planTierNormalized: normalizedTarget,
      STRIPE_PRICE_PRO: Deno.env.get("STRIPE_PRICE_PRO") ? "set" : "missing",
      STRIPE_PRICE_PRO_PLUS: Deno.env.get("STRIPE_PRICE_PRO_PLUS") ? "set" : "missing",
      STRIPE_PRICE_PRO_PP: Deno.env.get("STRIPE_PRICE_PRO_PP") ? "set" : "missing",
      resolvedPriceId: priceId ? `${priceId.substring(0, 12)}...` : "missing",
    });

    const { data: membership } = await admin
      .from("memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();

    console.log("CHECKOUT_MEMBERSHIP_CHECK", {
      userId: user.id,
      companyId,
      hasMembership: !!membership,
      role: membership?.role || "none",
      usedAdminClient: true,
    });

    if (!membership || membership.role !== "owner") {
      console.error("CHECKOUT_NOT_AUTHORIZED", {
        userId: user.id,
        companyId,
        role: membership?.role || "none",
        membershipsFoundCount: membership ? 1 : 0,
        usedAdminClient: true,
      });
      return new Response(JSON.stringify({
        error: "Not authorized for this company",
        debug: {
          userId: user.id,
          companyId,
          membershipsFoundCount: membership ? 1 : 0,
          membershipRole: membership?.role || "none",
          usedAdminClient: true,
        }
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingSubscription } = await admin
      .from("company_subscriptions")
      .select("stripe_subscription_id, status, plan_tier")
      .eq("company_id", companyId)
      .maybeSingle();

    console.log("CHECKOUT_SUBSCRIPTION_CHECK", {
      companyId,
      hasSubscription: !!existingSubscription,
      stripeSubId: existingSubscription?.stripe_subscription_id || null,
      status: existingSubscription?.status || null,
      planTier: existingSubscription?.plan_tier || null,
    });

    const { data: company } = await admin
      .from("companies")
      .select("stripe_customer_id, name")
      .eq("id", companyId)
      .maybeSingle();

    if (!company) {
      console.error("CHECKOUT_COMPANY_NOT_FOUND", { companyId });
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("CHECKOUT_CTX", {
      companyId,
      hasCompanyCustomer: !!company.stripe_customer_id,
    });

    let customerId = company.stripe_customer_id;

    if (!customerId) {
      const stripeCustomer = await stripe.customers.create({
        email: user.email,
        name: company.name,
        metadata: { company_id: companyId },
      });
      customerId = stripeCustomer.id;

      await admin
        .from("companies")
        .update({ stripe_customer_id: customerId })
        .eq("id", companyId);

      console.log("COMPANY_CUSTOMER_CREATED", {
        companyId,
        customerSuffix: customerId.slice(-4),
      });
    }

    let origin = req.headers.get("origin") ?? new URL(req.url).origin;

    // Stripe n'accepte pas les URLs localhost, utiliser l'URL publique en développement
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      const publicUrl = Deno.env.get("APP_URL") || Deno.env.get("PUBLIC_APP_URL");
      if (publicUrl) {
        console.log("CHECKOUT_LOCALHOST_DETECTED", {
          originalOrigin: origin,
          replacedWith: publicUrl,
        });
        origin = publicUrl;
      } else {
        console.warn("CHECKOUT_LOCALHOST_WITHOUT_FALLBACK", {
          origin,
          note: "Set APP_URL env var for local development",
        });
      }
    }

    if (
      existingSubscription?.stripe_subscription_id &&
      (existingSubscription.status === "active" || existingSubscription.status === "trialing")
    ) {
      console.log("PORTAL_FOR_EXISTING_SUB", {
        companyId,
        customerSuffix: customerId.slice(-4),
        subscriptionSuffix: existingSubscription.stripe_subscription_id.slice(-4),
      });

      const returnUrl = `${origin}/app/company/${companyId}/subscription`;

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      console.log("PORTAL_REDIRECT_FOR_CHANGE", {
        companyId,
        sessionId: portalSession.id,
        url: portalSession.url,
        mode: "portal",
      });

      return new Response(JSON.stringify({
        url: portalSession.url,
        mode: "portal",
        companyId,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("STRIPE_FLOW", {
      action: "checkout",
      email: user.email,
      companyName: company.name,
      hasCustomerId: !!customerId,
      companyId,
    });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing/cancel`,
      metadata: {
        user_id: user.id,
        company_id: companyId,
        plan_tier: normalizedTarget,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          company_id: companyId,
          plan_tier: normalizedTarget,
        },
      },
    });

    console.log("CHECKOUT_CREATED", {
      companyId,
      customerSuffix: customerId.slice(-4),
      planTier: normalizedTarget,
      priceSuffix: priceId.slice(-4),
    });

    console.log("STRIPE_CHECKOUT_SESSION_CREATED", {
      sessionId: session.id,
      customerId,
      companyId,
      url: session.url,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[FUNCTION_ERROR]", {
      fn: "create-checkout-session",
      error: e,
      message: e?.message,
      stack: e?.stack,
    });
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR", message: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});