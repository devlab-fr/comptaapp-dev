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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  console.log("CREATE_PORTAL_SESSION_HANDLER_RUNNING");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

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
  } catch (err) {
    console.error("CREATE_PORTAL_SESSION_ERROR", err);
    return new Response(JSON.stringify({ ok: false, step: "EXCEPTION", error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});