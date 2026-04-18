import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function htmlRedirect(url: string): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${url}"></head><body></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacVerify(secret: string, payloadB64: string, signature: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expected === signature;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    const appUrl = Deno.env.get("APP_URL") || "https://app.comptaapp.fr";

    if (errorParam) {
      return htmlRedirect(`${appUrl}/banque?bridge_error=${encodeURIComponent(errorParam)}`);
    }

    if (!code || !state) {
      return jsonError("Paramètres manquants", 400);
    }

    const bridgeStateSecret = Deno.env.get("BRIDGE_STATE_SECRET");
    if (!bridgeStateSecret) return jsonError("Configuration manquante", 500);

    const dotIndex = state.lastIndexOf(".");
    if (dotIndex === -1) return jsonError("State invalide", 401);

    const payloadB64 = state.substring(0, dotIndex);
    const signature = state.substring(dotIndex + 1);

    const valid = await hmacVerify(bridgeStateSecret, payloadB64, signature);
    if (!valid) return jsonError("Signature invalide", 401);

    let parsed: { company_id: string; user_id: string; timestamp: number };
    try {
      parsed = JSON.parse(atob(payloadB64));
    } catch {
      return jsonError("State malformé", 401);
    }

    const { company_id, user_id, timestamp } = parsed;

    if (Date.now() - timestamp > 10 * 60 * 1000) {
      return jsonError("State expiré", 401);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("id", company_id)
      .maybeSingle();

    if (companyError || !company) {
      return jsonError("Company introuvable", 400);
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("company_id", company_id)
      .eq("user_id", user_id)
      .in("role", ["admin", "owner"])
      .maybeSingle();

    if (membershipError || !membership) {
      return jsonError("Accès refusé", 401);
    }

    const clientId = Deno.env.get("BRIDGE_CLIENT_ID");
    const clientSecret = Deno.env.get("BRIDGE_CLIENT_SECRET");
    const redirectUri = Deno.env.get("BRIDGE_REDIRECT_URI");

    if (!clientId || !clientSecret || !redirectUri) {
      return jsonError("Configuration Bridge manquante", 500);
    }

    const tokenResponse = await fetch("https://api.bridgeapi.io/v2/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      console.error("[bridge-auth-callback] token exchange failed:", tokenResponse.status, errBody);
      return jsonError("Échec échange token Bridge", 502);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    const tokenExpiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    const accountsResponse = await fetch("https://api.bridgeapi.io/v2/accounts", {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Bridge-Version": "2021-06-01",
      },
    });

    if (!accountsResponse.ok) {
      console.error("[bridge-auth-callback] accounts fetch failed:", accountsResponse.status);
      return jsonError("Échec récupération comptes Bridge", 502);
    }

    const accountsData = await accountsResponse.json();
    const accounts: Array<{ id: number; name: string; currency_code: string; item_id: number }> =
      accountsData.resources || accountsData || [];

    for (const account of accounts) {
      const bridgeAccountId = String(account.id);
      const bridgeItemId = String(account.item_id);

      const { error: upsertError } = await supabaseAdmin
        .from("bank_accounts")
        .upsert(
          {
            company_id,
            name: account.name,
            currency: account.currency_code || "EUR",
            bridge_account_id: bridgeAccountId,
            bridge_item_id: bridgeItemId,
            bridge_access_token: access_token,
            bridge_refresh_token: refresh_token,
            bridge_token_expires_at: tokenExpiresAt,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "company_id,bridge_account_id",
            ignoreDuplicates: false,
          }
        );

      if (upsertError) {
        console.error("[bridge-auth-callback] upsert error for account", bridgeAccountId, ":", upsertError.message);
      }
    }

    const { data: linkedAccounts } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, bridge_last_sync_at")
      .eq("company_id", company_id)
      .not("bridge_account_id", "is", null)
      .is("bridge_last_sync_at", null);

    if (linkedAccounts && linkedAccounts.length > 0) {
      EdgeRuntime.waitUntil(
        triggerInitialSync(supabaseAdmin, company_id, access_token)
      );
    }

    return htmlRedirect(`${appUrl}/banque?bridge_connected=1`);
  } catch (err) {
    console.error("[bridge-auth-callback] error:", (err as Error).message);
    return jsonError("Erreur interne", 500);
  }
});

async function triggerInitialSync(
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
  accessToken: string
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    await fetch(`${supabaseUrl}/functions/v1/bridge-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ company_id: companyId }),
    });
  } catch (err) {
    console.error("[bridge-auth-callback] initial sync trigger failed:", (err as Error).message);
  }
}
