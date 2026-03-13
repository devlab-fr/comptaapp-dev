import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, stripe-signature",
};

Deno.serve(async (req: Request) => {
  const traceId = crypto.randomUUID?.() ?? String(Date.now());
  console.log("=== stripe-webhook CALLED ===", {
    ts: new Date().toISOString(),
    traceId,
    method: req.method,
    url: req.url,
  });

  if (req.method === "GET") {
    return new Response("ok", { status: 200 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const key = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
  const webhookSecret = (Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "").trim();

  console.log("=== stripe-webhook INIT CHECK ===", {
    ts: new Date().toISOString(),
    hasKey: !!key,
    hasWebhookSecret: !!webhookSecret,
    traceId,
  });

  if (!key) {
    console.log("[STRIPE_DISABLED] missing STRIPE_SECRET_KEY", {
      ts: new Date().toISOString(),
      fn: "stripe-webhook",
      traceId,
    });
    return new Response(
      JSON.stringify({ error: "STRIPE_DISABLED", message: "Stripe not configured yet", traceId }),
      {
        status: 501,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  if (!webhookSecret) {
    console.log("[STRIPE_DISABLED] missing STRIPE_WEBHOOK_SECRET", {
      ts: new Date().toISOString(),
      fn: "stripe-webhook",
      traceId,
    });
    return new Response(
      JSON.stringify({ error: "STRIPE_DISABLED", message: "Stripe webhook secret not configured", traceId }),
      {
        status: 501,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const stripe = new Stripe(key, {
    apiVersion: "2024-12-18.acacia",
  });

  const PRICE_TO_TIER: Record<string, string> = {
    [Deno.env.get("STRIPE_PRICE_PRO") || ""]: "PRO",
    [Deno.env.get("STRIPE_PRICE_PRO_PLUS") || ""]: "PRO_PLUS",
    [Deno.env.get("STRIPE_PRICE_PRO_PLUS_PLUS") || ""]: "PRO_PLUS_PLUS",
  };

  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ ok: false, traceId, error: "No signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    console.log("STRIPE_WEBHOOK_OK", {
      traceId,
      type: event.type,
      id: event.id,
      livemode: event.livemode,
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const companyId = session.metadata?.company_id;
        const customerId = String(session.customer);
        const subscriptionId = String(session.subscription);

        console.log("CHECKOUT_COMPLETED", { traceId, sessionId: session.id, userId, companyId, customerId, subscriptionId });

        if (userId && customerId) {
          const { data: customerData, error: customerError } = await supabase.from("stripe_customers").upsert({
            user_id: userId,
            stripe_customer_id: customerId,
          }, {
            onConflict: "user_id"
          }).select();

          console.log("DB_STEP_RESULT", { traceId, step: "stripe_customers_upsert", data: customerData, error: customerError });

          if (customerError) {
            console.error("SUPABASE_DB_ERROR", { traceId, step: "stripe_customers_upsert", error: customerError });
            return new Response(JSON.stringify({ ok: false, traceId, step: "stripe_customers_upsert", error: customerError }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        if (!userId) {
          console.error("WEBHOOK_MISSING_USER_ID", { traceId, sessionId: session.id, customerId, subscriptionId });
          return new Response(JSON.stringify({
            ok: false,
            traceId,
            error: "MISSING_USER_ID",
            message: "user_id is required in checkout session metadata"
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!companyId) {
          console.error("WEBHOOK_MISSING_COMPANY_ID", { traceId, sessionId: session.id, userId, customerId, subscriptionId });
          return new Response(JSON.stringify({
            ok: false,
            traceId,
            error: "MISSING_COMPANY_ID",
            message: "company_id is required in checkout session metadata for multi-company support"
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (userId && subscriptionId && companyId) {
          const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
          console.log("LINE_ITEMS", { traceId, items: items.data.map(i => i.price?.id) });

          const priceId = items.data[0]?.price?.id;
          if (!priceId) {
            console.error("SUPABASE_DB_ERROR", { traceId, step: "resolve_price", error: "No priceId found in line_items" });
            return new Response(JSON.stringify({ ok: false, traceId, step: "resolve_price", error: "No priceId found" }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const planTier = PRICE_TO_TIER[priceId] || "FREE";
          console.log("PLAN_RESOLVED", { traceId, priceId, planTier, companyId });

          const subscription = await stripe.subscriptions.retrieve(subscriptionId);

          const { data: subData, error: subError } = await supabase.from("user_subscriptions").upsert({
            user_id: userId,
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            price_id: priceId,
            status: subscription.status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            plan_tier: planTier,
            cancel_at_period_end: subscription.cancel_at_period_end,
          }, {
            onConflict: "user_id"
          }).select();

          console.log("DB_STEP_RESULT", { traceId, step: "user_subscriptions_upsert", data: subData, error: subError });

          if (subError) {
            console.error("SUPABASE_DB_ERROR", { traceId, step: "user_subscriptions_upsert", error: subError });
            return new Response(JSON.stringify({ ok: false, traceId, step: "user_subscriptions_upsert", error: subError }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const { data: companySubData, error: companySubError } = await supabase.from("company_subscriptions").upsert({
            company_id: companyId,
            plan_tier: planTier,
            stripe_subscription_id: subscriptionId,
            status: subscription.status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          }, {
            onConflict: "company_id"
          }).select();

          console.log("DB_STEP_RESULT", { traceId, step: "company_subscriptions_upsert", companyId, data: companySubData, error: companySubError });

          if (companySubError) {
            console.error("SUPABASE_DB_ERROR", { traceId, step: "company_subscriptions_update", error: companySubError });
            return new Response(JSON.stringify({ ok: false, traceId, step: "company_subscriptions_update", error: companySubError }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({
            ok: true,
            traceId,
            userId,
            companyId,
            customerId,
            subscriptionId,
            planTier,
            priceId
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const priceId = subscription.items.data[0].price.id;
        const planTier = subscription.status === "active" ? (PRICE_TO_TIER[priceId] || "FREE") : "FREE";
        const companyId = subscription.metadata?.company_id;

        console.log("SUBSCRIPTION_UPDATED", { traceId, subscriptionId, companyId, planTier, status: subscription.status });

        if (!companyId) {
          console.error("WEBHOOK_MISSING_COMPANY_ID", {
            traceId,
            subscriptionId,
            eventId: event.id,
            eventType: event.type,
            reason: "No company_id in subscription metadata"
          });
          return new Response(JSON.stringify({
            ok: false,
            traceId,
            error: "MISSING_COMPANY_ID",
            message: "company_id is required in subscription metadata for multi-company support"
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: subData } = await supabase
          .from("user_subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();

        if (subData) {
          const { error: subUpdateError } = await supabase.from("user_subscriptions").update({
            status: subscription.status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            plan_tier: planTier,
            cancel_at_period_end: subscription.cancel_at_period_end,
            price_id: priceId,
            updated_at: new Date().toISOString(),
          }).eq("stripe_subscription_id", subscriptionId);

          if (subUpdateError) {
            console.error("SUPABASE_UPSERT_ERROR [user_subscriptions update]", subUpdateError);
          }

          const { error: companySubUpdateError } = await supabase.from("company_subscriptions").update({
            plan_tier: planTier,
            status: subscription.status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          }).eq("company_id", companyId);

          console.log("DB_STEP_RESULT", { traceId, step: "company_subscriptions_update", companyId, error: companySubUpdateError });

          if (companySubUpdateError) {
            console.error("SUPABASE_UPSERT_ERROR [company_subscriptions update]", companySubUpdateError);
            return new Response(JSON.stringify({
              ok: false,
              traceId,
              error: "DB_UPDATE_ERROR",
              step: "company_subscriptions_update",
              details: companySubUpdateError
            }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        break;
      }

      case "invoice.paid": {
        console.log("INVOICE_PAID", { traceId, invoiceId: event.data.object.id });
        break;
      }

      case "invoice.payment_failed": {
        console.log("INVOICE_PAYMENT_FAILED", { traceId, invoiceId: event.data.object.id });
        break;
      }
    }

    return new Response(JSON.stringify({ ok: true, traceId, received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("STRIPE_WEBHOOK_ERR", { traceId, error: err?.message || err });
    return new Response(JSON.stringify({ ok: false, traceId, error: "Webhook error", details: err?.message || String(err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
