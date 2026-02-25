import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://comptaapp-dev-2n37.bolt.host",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    console.log("=== STRIPE-DEBUG-COMPANY CALLED ===", {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
    });

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey || stripeSecretKey.trim() === "") {
      console.log("[STRIPE_DISABLED] missing STRIPE_SECRET_KEY");
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // For diagnostic purposes: allow service role key bypass
    const isServiceRole = token === supabaseServiceKey;

    let user = null;

    if (isServiceRole) {
      console.log("SERVICE_ROLE_BYPASS_ENABLED_FOR_DIAGNOSTIC");
      // Create a mock user for logging purposes
      user = { id: "service-role-diagnostic", email: "diagnostic@system" };
    } else {
      if (!token) {
        console.error("AUTH_FAIL_MISSING_TOKEN");
        return new Response(JSON.stringify({
          error: "Missing Authorization Bearer token",
          debugReason: "JWT_MISSING",
          hint: "Use a valid user JWT or service role key",
        }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
      const { data: { user: authUser }, error: userError } = await supabaseAuth.auth.getUser(token);

      console.log("GET_USER_RESULT", {
        hasUser: !!authUser,
        userId: authUser?.id || "none",
        userEmail: authUser?.email || "none",
        errorMessage: userError?.message || null,
      });

      if (userError || !authUser) {
        console.error("AUTH_FAIL_GETUSER", {
          error: userError?.message,
          status: userError?.status,
        });

        return new Response(JSON.stringify({
          error: "Invalid JWT",
          debugReason: userError?.message?.includes("expired") ? "JWT_EXPIRED" : "JWT_INVALID",
          detail: userError?.message || "NO_USER",
          hint: "Use a valid user JWT or service role key",
        }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      user = authUser;
    }

    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const companyId = body.companyId;
    const expectedCompanyName = body.expectedCompanyName;

    if (!companyId) {
      console.error("DEBUG_NO_COMPANY_ID", { userId: user.id });
      return new Response(JSON.stringify({ error: "Missing companyId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("=== STARTING STRIPE DEBUG FOR COMPANY ===", {
      companyId,
      expectedCompanyName,
      userId: user.id,
    });

    // 1) Stripe Account Info
    let stripeAccountId = "unknown";
    let livemode = false;
    try {
      const account = await stripe.accounts.retrieve();
      stripeAccountId = account.id;
      livemode = !account.charges_enabled ? false : true; // Approximation
      console.log("STRIPE_ACCOUNT_INFO", { stripeAccountId, livemode });
    } catch (e) {
      console.error("STRIPE_ACCOUNT_RETRIEVE_ERROR", e);
    }

    // 2) DB Read - Company
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, name, stripe_customer_id")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError || !company) {
      console.error("DB_COMPANY_NOT_FOUND", { companyId, error: companyError?.message });
      return new Response(JSON.stringify({
        error: "Company not found in database",
        companyId,
        detail: companyError?.message,
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("DB_COMPANY_FOUND", {
      id: company.id,
      name: company.name,
      stripe_customer_id: company.stripe_customer_id || "null",
    });

    // 3) DB Read - Company Subscription
    const { data: subscription } = await supabaseAdmin
      .from("company_subscriptions")
      .select("company_id, plan_tier, status, stripe_subscription_id")
      .eq("company_id", companyId)
      .maybeSingle();

    console.log("DB_SUBSCRIPTION_FOUND", {
      hasSubscription: !!subscription,
      plan_tier: subscription?.plan_tier || "null",
      status: subscription?.status || "null",
      stripe_subscription_id: subscription?.stripe_subscription_id || "null",
    });

    // 4) Stripe Customer Audit
    let customerFound = false;
    let customerData: any = null;
    let stripeCustomerError: string | null = null;

    if (company.stripe_customer_id) {
      try {
        const customer = await stripe.customers.retrieve(company.stripe_customer_id);
        if (customer && !customer.deleted) {
          customerFound = true;
          customerData = {
            id: customer.id,
            name: customer.name || null,
            email: customer.email || null,
            metadata: customer.metadata || {},
          };
          console.log("STRIPE_CUSTOMER_FOUND", customerData);
        } else {
          stripeCustomerError = "Customer deleted in Stripe";
          console.error("STRIPE_CUSTOMER_DELETED", { customerId: company.stripe_customer_id });
        }
      } catch (e: any) {
        stripeCustomerError = e?.message || "Unknown error";
        console.error("STRIPE_CUSTOMER_RETRIEVE_ERROR", {
          customerId: company.stripe_customer_id,
          error: e?.message,
        });
      }
    } else {
      stripeCustomerError = "No stripe_customer_id in database";
      console.log("NO_STRIPE_CUSTOMER_ID_IN_DB");
    }

    // 5) Coherence Checks
    const nameMatchesExpected = expectedCompanyName
      ? company.name === expectedCompanyName
      : null;

    const metadataHasCompanyId = customerData?.metadata
      ? !!(customerData.metadata.companyId || customerData.metadata.company_id || customerData.metadata.companyName)
      : false;

    const customerNameMatchesCompanyName = customerData?.name
      ? customerData.name === company.name
      : null;

    console.log("COHERENCE_CHECKS", {
      nameMatchesExpected,
      metadataHasCompanyId,
      customerNameMatchesCompanyName,
    });

    // 6) Root Cause Analysis
    let rootCause = "OK";

    if (!company.stripe_customer_id) {
      rootCause = "NO_STRIPE_CUSTOMER_ID_IN_DB";
    } else if (!customerFound) {
      rootCause = "STRIPE_CUSTOMER_ID_NOT_FOUND_IN_STRIPE";
    } else if (!metadataHasCompanyId) {
      rootCause = "CUSTOMER_METADATA_MISSING_COMPANY_ID";
    } else if (customerNameMatchesCompanyName === false) {
      rootCause = "CUSTOMER_NAME_MISMATCH";
    }

    // Build response
    const response = {
      buildId: new Date().toISOString(),
      stripeAccount: {
        stripeAccountId,
        livemode,
      },
      database: {
        company: {
          id: company.id,
          name: company.name,
          stripe_customer_id: company.stripe_customer_id || null,
        },
        subscription: subscription ? {
          company_id: subscription.company_id,
          plan_tier: subscription.plan_tier,
          status: subscription.status,
          stripe_subscription_id: subscription.stripe_subscription_id,
        } : null,
      },
      stripeCustomer: customerFound ? customerData : {
        error: stripeCustomerError,
      },
      coherenceChecks: {
        nameMatchesExpected,
        metadataHasCompanyId,
        customerNameMatchesCompanyName,
      },
      conclusion: {
        rootCause,
      },
    };

    console.log("=== DEBUG COMPLETE ===", { rootCause });

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[FUNCTION_ERROR]", {
      fn: "stripe-debug-company",
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
