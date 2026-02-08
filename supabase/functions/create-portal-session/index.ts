import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  console.log("=== CREATE-PORTAL-SESSION CALLED ===", {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
  });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

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

  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";

    console.log("CREATE_PORTAL_SESSION_START", {
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader.slice(0, 25),
      timestamp: new Date().toISOString(),
    });

    if (!authHeader) {
      console.error("CREATE_PORTAL_SESSION_NO_AUTH");
      return new Response(JSON.stringify({ ok: false, step: "AUTH_HEADER", error: "NO_AUTHORIZATION_HEADER" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();

    console.log("CREATE_PORTAL_SESSION_GET_USER", {
      hasUser: !!user,
      userId: user?.id || "none",
      userEmail: user?.email || "none",
      error: userError?.message || null,
    });

    if (userError || !user) {
      console.error("CREATE_PORTAL_SESSION_GET_USER_FAILED", { userError });
      return new Response(JSON.stringify({ ok: false, step: "GET_USER", error: userError?.message || "NO_USER" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    console.log("CREATE_PORTAL_SESSION_CUSTOMER", {
      userId: user.id,
      hasCustomer: !!customer,
      stripeCustomerId: customer?.stripe_customer_id || "none",
      error: customerError?.message || null,
    });

    console.log("STRIPE_FLOW", {
      action: "portal",
      email: user.email,
      hasCustomerId: !!(customer?.stripe_customer_id),
      userId: user.id,
    });

    if (!customer || !customer.stripe_customer_id) {
      console.error("CREATE_PORTAL_SESSION_NO_CUSTOMER", { userId: user.id });
      return new Response(JSON.stringify({ ok: false, step: "CUSTOMER_LOOKUP", error: "NO_STRIPE_CUSTOMER" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const origin = req.headers.get("origin") || "http://localhost:5173";

    console.log("CREATE_PORTAL_SESSION_CREATING_STRIPE_SESSION", {
      stripeCustomerId: customer.stripe_customer_id,
      returnUrl: `${origin}/app`,
    });

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${origin}/app`,
    });

    console.log("CREATE_PORTAL_SESSION_SUCCESS", {
      sessionId: session.id,
      url: session.url,
    });

    return new Response(JSON.stringify({ ok: true, url: session.url }), {
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