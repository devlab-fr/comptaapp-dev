import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { ensureStripeCustomer } from "../_shared/ensureStripeCustomer.ts";

export const config = {
  verify_jwt: false,
};

const BUILD_ID = "DEBUG_BYPASS_2026_02_22_V8.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mapping: planTier -> environment variable key
const ENV_KEY_BY_PLAN: Record<string, string> = {
  PRO: "STRIPE_PRICE_PRO",
  PRO_PLUS: "STRIPE_PRICE_PRO_PLUS",
  PRO_PLUS_PLUS: "STRIPE_PRICE_PRO_PLUS_PLUS",
};

const TIER_RANK: Record<string, number> = {
  FREE: 0,
  PRO: 1,
  PRO_PLUS: 2,
  PRO_PLUS_PLUS: 3,
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";

  const ALLOWED_ORIGINS = new Set([
    "https://comptaapp-dev-2n37.bolt.host",
    "http://localhost:5173",
    "http://localhost:3000",
  ]);

  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-debug, x-requested-with",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(
      JSON.stringify({ ok: false, error: "CORS_FORBIDDEN", origin }),
      { status: 403, headers: { "Content-Type": "application/json", "Vary": "Origin" } }
    );
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // DEBUG BYPASS: Prove function is reached + runtime env check
  if (req.headers.get("x-debug") === "1") {
    console.log("DEBUG_BYPASS_TRIGGERED", { buildId: BUILD_ID });
    return new Response(
      JSON.stringify({
        ok: true,
        reached: true,
        buildId: BUILD_ID,
        runtimeEnvCheck: {
          STRIPE_PRICE_PRO: Boolean(Deno.env.get("STRIPE_PRICE_PRO")),
          STRIPE_PRICE_PRO_PLUS: Boolean(Deno.env.get("STRIPE_PRICE_PRO_PLUS")),
          STRIPE_PRICE_PRO_PLUS_PLUS: Boolean(Deno.env.get("STRIPE_PRICE_PRO_PLUS_PLUS")),
        },
      }),
      { status: 200, headers: jsonHeaders }
    );
  }

  console.log("BUILD_ID:", BUILD_ID);

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
      JSON.stringify({ error: "STRIPE_DISABLED", message: "Stripe not configured yet", buildId: BUILD_ID }),
      { status: 501, headers: jsonHeaders }
    );
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-12-18.acacia",
  });

  const edgeSupabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const edgeProjectRef = edgeSupabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || "unknown";

  console.log("EDGE_RUNTIME_ENV_DIAGNOSTIC", {
    BUILD_ID,
    SUPABASE_URL: edgeSupabaseUrl,
    SUPABASE_ANON_KEY_LENGTH: supabaseAnonKey?.length ?? 0,
    SUPABASE_ANON_KEY_PREFIX: supabaseAnonKey?.substring(0, 20) ?? "missing",
    SUPABASE_SERVICE_ROLE_KEY_LENGTH: supabaseServiceRoleKey?.length ?? 0,
    extractedProjectRef: edgeProjectRef,
    expectedProjectRef: "lmbxmluyggwvvjpyvlnt",
    projectRefMatch: edgeProjectRef === "lmbxmluyggwvvjpyvlnt",
  });

  try {
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      "";

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      console.error("AUTH_FAIL_MISSING_TOKEN", { hasAuthHeader: !!authHeader });
      return new Response(JSON.stringify({ ok: false, error: "JWT_MISSING" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    let tokenIss: string | null = null;
    let tokenProjectRef: string | null = null;
    let tokenAud: string | null = null;
    let tokenExp: number | null = null;
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        tokenIss = payload?.iss || null;
        tokenAud = payload?.aud || null;
        tokenExp = payload?.exp || null;
        if (tokenIss) {
          const match = tokenIss.match(/https?:\/\/([^.]+)\.supabase\.co/);
          tokenProjectRef = match ? match[1] : null;
        }
      }
    } catch (e) {
      console.warn("TOKEN_DECODE_FAILED", { error: String(e) });
    }

    console.log("TOKEN_VS_ENV_DIAGNOSTIC", {
      tokenProjectRef: tokenProjectRef ?? "unknown",
      envProjectRef: edgeProjectRef,
      projectRefMatch: tokenProjectRef === edgeProjectRef,
      tokenIss: tokenIss ?? "unknown",
      tokenAud: tokenAud ?? "unknown",
      tokenExp: tokenExp ?? 0,
      tokenExpired: tokenExp ? tokenExp < Date.now() / 1000 : null,
      tokenLength: token.length,
    });

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: { user }, error: userError } =
      await supabaseAuth.auth.getUser(token);

    console.log("GET_USER_RESULT", {
      hasUser: !!user,
      hasError: !!userError,
      errorName: userError?.name ?? null,
      errorMsg: userError?.message ?? null,
      errorStatus: userError?.status ?? null,
      tokenLen: token.length,
    });

    if (userError || !user) {
      console.error("AUTH_FAIL_INVALID_JWT", { errorMsg: userError?.message ?? "no_user" });
      return new Response(JSON.stringify({
        ok: false,
        error: "INVALID_JWT",
        message: userError?.message ?? "no_user"
      }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    console.log("CHECKOUT_USER_AUTHENTICATED", { userId: user.id, email: user.email });

    const body = await req.json();
    const { companyId } = body;

    console.log("CHECKOUT_REQUEST_BODY", { body, companyId, userId: user.id });

    if (!companyId) {
      console.error("CHECKOUT_NO_COMPANY_ID", { userId: user.id });
      return new Response(JSON.stringify({
        error: "Missing companyId",
        buildId: BUILD_ID,
        debug: { userId: user.id }
      }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const rawTier = (
      body?.planTier ??
      body?.tier ??
      body?.targetPlan ??
      ""
    ).toString().trim().toUpperCase();

    // Normalize planTier with alias support
    const normalizedTarget =
      rawTier === "PRO_PP" ? "PRO_PLUS_PLUS" :
      rawTier === "PRO_PLUS_PLUS_PLUS" ? "PRO_PLUS_PLUS" :
      rawTier
        .replace(/\+\+/g, "_PLUS_PLUS")
        .replace(/\+/g, "_PLUS")
        .replace(/\s+/g, "_")
        .replace(/[^A-Z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");

    const hasTargetPlan = !!normalizedTarget && normalizedTarget !== "";

    console.log("CHECKOUT_TIER_NORMALIZATION", {
      rawTier,
      normalizedTarget,
      hasTargetPlan,
    });

    // Early validation: check if planTier is missing
    if (!normalizedTarget) {
      console.error("CHECKOUT_MISSING_PLAN_TIER", { body, rawTier });
      return new Response(JSON.stringify({
        ok: false,
        error: "BAD_REQUEST",
        message: "planTier missing",
        raw: rawTier,
        buildId: BUILD_ID
      }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    // Check if planTier is known
    const envKey = ENV_KEY_BY_PLAN[normalizedTarget] ?? null;
    if (!envKey) {
      console.error("CHECKOUT_UNKNOWN_PLAN_TIER", { normalizedTarget, rawTier });
      return new Response(JSON.stringify({
        ok: false,
        error: "BAD_REQUEST",
        message: "Unknown planTier",
        raw: rawTier,
        normalizedTarget,
        buildId: BUILD_ID
      }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    // Resolve priceId from environment
    const priceId = Deno.env.get(envKey) ?? "";

    // Validate priceId immediately
    if (!priceId) {
      console.error("CHECKOUT_MISSING_PRICE_ID", { normalizedTarget, missingEnvKey: envKey });
      return new Response(JSON.stringify({
        ok: false,
        error: "CONFIG_ERROR",
        message: "Missing Stripe Price ID for planTier",
        planTier: normalizedTarget,
        missingEnvKey: envKey,
        buildId: BUILD_ID
      }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

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
        buildId: BUILD_ID,
        debug: {
          userId: user.id,
          companyId,
          membershipsFoundCount: membership ? 1 : 0,
          membershipRole: membership?.role || "none",
          usedAdminClient: true,
        }
      }), {
        status: 403,
        headers: jsonHeaders,
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

    // Validate upgrade path: target plan must be strictly higher than current plan
    if (hasTargetPlan && existingSubscription?.plan_tier) {
      const currentRank = TIER_RANK[existingSubscription.plan_tier] ?? 0;
      const targetRank = TIER_RANK[normalizedTarget] ?? 0;

      console.log("UPGRADE_PATH_VALIDATION", {
        currentPlan: existingSubscription.plan_tier,
        currentRank,
        targetPlan: normalizedTarget,
        targetRank,
        isValidUpgrade: targetRank > currentRank,
      });

      if (targetRank <= currentRank) {
        console.error("INVALID_UPGRADE_PATH", {
          currentPlan: existingSubscription.plan_tier,
          currentRank,
          targetPlan: normalizedTarget,
          targetRank,
          message: "Cannot downgrade or stay on same plan",
        });
        return new Response(JSON.stringify({
          error: "INVALID_UPGRADE",
          message: `Cannot change from ${existingSubscription.plan_tier} to ${normalizedTarget}. Only upgrades are allowed.`,
          buildId: BUILD_ID,
          debug: {
            currentPlan: existingSubscription.plan_tier,
            targetPlan: normalizedTarget,
            currentRank,
            targetRank,
          }
        }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
    }

    const customerId = await ensureStripeCustomer({
      stripe,
      supabaseAdmin: admin,
      companyId,
      userId: user.id,
    });

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

    // MANAGE MODE: No target plan provided, user wants to manage existing subscription
    if (
      !hasTargetPlan &&
      existingSubscription?.stripe_subscription_id &&
      (existingSubscription.status === "active" || existingSubscription.status === "trialing")
    ) {
      console.log("MODE_MANAGE_EXISTING_SUB", {
        mode: "manage",
        companyId,
        customerSuffix: customerId.slice(-4),
        subscriptionSuffix: existingSubscription.stripe_subscription_id.slice(-4),
        hasTargetPlan: false,
      });

      const returnUrl = `${origin}/app/company/${companyId}/subscription`;

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      console.log("PORTAL_SESSION_CREATED", {
        mode: "manage",
        companyId,
        sessionId: portalSession.id,
        url: portalSession.url,
      });

      return new Response(JSON.stringify({
        url: portalSession.url,
        mode: "manage",
        companyId,
        buildId: BUILD_ID,
      }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // UPGRADE MODE: Target plan provided, perform upgrade
    if (
      hasTargetPlan &&
      existingSubscription?.stripe_subscription_id &&
      (existingSubscription.status === "active" || existingSubscription.status === "trialing")
    ) {
      console.log("MODE_UPGRADE_EXISTING_SUB", {
        mode: "upgrade",
        companyId,
        currentPlan: existingSubscription.plan_tier,
        targetPlan: normalizedTarget,
        subscriptionId: existingSubscription.stripe_subscription_id,
        priceId,
      });

      // Retrieve current subscription to get subscription item ID
      const subscription = await stripe.subscriptions.retrieve(existingSubscription.stripe_subscription_id);
      const subscriptionItemId = subscription.items.data[0]?.id;

      if (!subscriptionItemId) {
        console.error("UPGRADE_ERROR_NO_ITEM_ID", {
          subscriptionId: existingSubscription.stripe_subscription_id,
        });
        return new Response(JSON.stringify({
          error: "SUBSCRIPTION_ITEM_NOT_FOUND",
          message: "Could not find subscription item to update",
          buildId: BUILD_ID,
        }), {
          status: 500,
          headers: jsonHeaders,
        });
      }

      // Update the subscription to new price
      const updatedSubscription = await stripe.subscriptions.update(
        existingSubscription.stripe_subscription_id,
        {
          items: [
            {
              id: subscriptionItemId,
              price: priceId,
            },
          ],
          proration_behavior: "always_invoice",
          metadata: {
            company_id: companyId,
            plan_tier: normalizedTarget,
          },
        }
      );

      console.log("UPGRADE_SUBSCRIPTION_UPDATED", {
        mode: "upgrade",
        subscriptionId: updatedSubscription.id,
        status: updatedSubscription.status,
        newPlan: normalizedTarget,
        companyId,
      });

      // Update local database
      await admin
        .from("company_subscriptions")
        .update({
          plan_tier: normalizedTarget,
          status: updatedSubscription.status,
          current_period_end: new Date(updatedSubscription.current_period_end * 1000).toISOString(),
        })
        .eq("company_id", companyId);

      return new Response(JSON.stringify({
        ok: true,
        mode: "upgrade",
        companyId,
        plan: normalizedTarget,
        buildId: BUILD_ID,
      }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // NEW SUBSCRIPTION MODE: No existing subscription, create new checkout session
    console.log("MODE_NEW_SUBSCRIPTION", {
      mode: "checkout",
      action: "new_subscription",
      userId: user.id,
      email: user.email,
      hasCustomerId: !!customerId,
      companyId,
      targetPlan: normalizedTarget,
      hasTargetPlan,
      priceId,
    });

    if (!priceId.startsWith("price_")) {
      return new Response(JSON.stringify({
        ok: false,
        error: "INVALID_PRICE_ID_FORMAT",
        normalizedTarget,
        priceId,
      }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    try {
      const price = await stripe.prices.retrieve(priceId);
      if (!price?.recurring) {
        return new Response(JSON.stringify({
          ok: false,
          error: "PRICE_NOT_RECURRING",
          normalizedTarget,
          priceId,
        }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
    } catch (e) {
      console.error("PRICE_LOOKUP_FAILED", String(e));
    }

    if (!customerId) {
      return new Response(JSON.stringify({
        ok: false,
        error: "MISSING_CUSTOMER_ID",
        normalizedTarget,
        priceId,
      }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

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

    console.log("CHECKOUT_SESSION_CREATED", {
      sessionId: session.id,
      url: session.url,
      mode: session.mode,
      normalizedTarget,
      priceId,
      companyId,
      customerId,
    });

    return new Response(JSON.stringify({
      ok: true,
      sessionId: session.id,
      url: session.url,
      mode: session.mode,
      normalizedTarget,
      priceId,
      buildId: BUILD_ID
    }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (e) {
    console.error("[FUNCTION_ERROR]", {
      fn: "create-checkout-session",
      error: e,
      message: e?.message,
      stack: e?.stack,
    });
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR", message: e?.message || "Unknown error", buildId: BUILD_ID }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});