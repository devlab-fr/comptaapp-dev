import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
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
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";

    // SAFE DIAGNOSTIC LOGS
    const supabaseUrlHost = supabaseUrl ? new URL(supabaseUrl).host : "MISSING";
    console.log("AUTH_DIAGNOSTIC", {
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader.slice(0, 7),
      jwtLength: authHeader.length > 7 ? authHeader.length - 7 : 0,
      jwtFirst10: authHeader.slice(7, 17),
      SUPABASE_URL_host: supabaseUrlHost,
      has_SERVICE_ROLE_KEY: !!supabaseServiceKey,
      has_ANON_KEY: !!supabaseAnonKey,
      timestamp: new Date().toISOString(),
    });

    if (!authHeader) {
      console.error("AUTH_FAIL_NO_HEADER");
      return new Response(JSON.stringify({ code: 401, message: "NO_AUTHORIZATION_HEADER" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      console.error("AUTH_FAIL_NO_BEARER_PREFIX");
      return new Response(JSON.stringify({ code: 401, message: "INVALID_AUTH_FORMAT" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.slice(7).trim();

    if (!jwt) {
      console.error("AUTH_FAIL_EMPTY_JWT");
      return new Response(JSON.stringify({ code: 401, message: "EMPTY_JWT" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create two separate clients
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    console.log("CLIENTS_CREATED", {
      adminKeyUsed: "service_role",
      authKeyUsed: "anon",
    });

    // Validate user STRICTLY via supabaseAuth
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();

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
        code: 401,
        message: "Invalid JWT",
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
      return new Response(JSON.stringify({ ok: false, error: "Missing companyId" }), {
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
        ok: false,
        error: "Not authorized for this company",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("stripe_customer_id, name")
      .eq("id", companyId)
      .maybeSingle();

    if (!company) {
      console.error("PORTAL_COMPANY_NOT_FOUND", { companyId });
      return new Response(JSON.stringify({ ok: false, error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("PORTAL_CTX", {
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

      await supabaseAdmin
        .from("companies")
        .update({ stripe_customer_id: customerId })
        .eq("id", companyId);

      console.log("COMPANY_CUSTOMER_CREATED", {
        companyId,
        customerSuffix: customerId.slice(-4),
      });
    }

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