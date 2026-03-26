import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { ensureStripeCustomer } from "../_shared/ensureStripeCustomer.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";

  const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [
    "http://localhost:5173",
    "http://localhost:3000",
  ];

  const ALLOWED_ORIGINS = new Set(allowedOrigins);

  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(
      JSON.stringify({ ok: false, error: "CORS_FORBIDDEN", origin }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    console.log("=== CREATE-PORTAL-SESSION CALLED ===", {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
    });

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey || stripeSecretKey.trim() === "") {
      console.log("[STRIPE_DISABLED] missing STRIPE_SECRET_KEY", {
        ts: new Date().toISOString(),
        fn: "create-portal-session",
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
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!token) {
      console.error("AUTH_FAIL_MISSING_TOKEN");
      return new Response(JSON.stringify({
        error: "Missing Authorization Bearer token",
        debugReason: "JWT_MISSING",
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);

    console.log("GET_USER_RESULT", {
      hasUser: !!user,
      userId: user?.id || "none",
      userEmail: user?.email || "none",
      errorMessage: userError?.message || null,
      errorCode: userError?.status || null,
    });

    if (userError || !user) {
      console.error("AUTH_FAIL_GETUSER", {
        error: userError?.message,
        status: userError?.status,
      });

      return new Response(JSON.stringify({
        error: "Invalid JWT",
        debugReason: userError?.message?.includes("expired") ? "JWT_EXPIRED" : "JWT_INVALID",
        detail: userError?.message || "NO_USER",
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const companyId = body.companyId;

    if (!companyId) {
      console.error("PORTAL_NO_COMPANY_ID", { userId: user.id });
      return new Response(JSON.stringify({ error: "Missing companyId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await supabaseAdmin
      .from("memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();

    console.log("PORTAL_MEMBERSHIP_CHECK", {
      userId: user.id,
      companyId,
      hasMembership: !!membership,
      role: membership?.role || "none",
      usedAdminClient: true,
    });

    if (!membership || membership.role !== "owner") {
      console.error("PORTAL_NOT_AUTHORIZED", {
        userId: user.id,
        companyId,
        role: membership?.role || "none",
      });
      return new Response(JSON.stringify({
        error: "Not authorized for this company",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = await ensureStripeCustomer({
      stripe,
      supabaseAdmin,
      companyId,
      userId: user.id,
    });

    let origin = req.headers.get("origin") || new URL(req.url).origin;

    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      const publicUrl = Deno.env.get("APP_URL") || Deno.env.get("PUBLIC_APP_URL");
      if (publicUrl) {
        origin = publicUrl;
      }
    }

    const returnUrl = `${origin}/app/company/${companyId}/subscription`;

    console.log("PORTAL_CREATING_SESSION", {
      companyId,
      customerSuffix: customerId.slice(-4),
      returnUrl,
    });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    console.log("PORTAL_SUCCESS", {
      sessionId: session.id,
      url: session.url,
      mode: "portal",
      companyId,
    });

    return new Response(JSON.stringify({ ok: true, url: session.url, mode: "portal" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[FUNCTION_ERROR]", {
      fn: "create-portal-session",
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