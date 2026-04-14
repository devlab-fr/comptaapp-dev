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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const item_id = url.searchParams.get("item_id");
    const user_uuid = url.searchParams.get("user_uuid");
    const success = url.searchParams.get("success");
    const context = url.searchParams.get("context");

    const appUrl = Deno.env.get("APP_URL") || "https://app.comptaapp.fr";

    if (success !== "true") {
      return htmlRedirect(`${appUrl}/banque?bridge_error=cancelled`);
    }

    if (!item_id || !user_uuid) {
      return jsonError("Paramètres manquants (item_id, user_uuid)", 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let company_id: string | null = null;

    if (context) {
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from("memberships")
        .select("company_id")
        .eq("user_id", context)
        .in("role", ["admin", "owner"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (membershipError || !membership) {
        return jsonError("Context invalide ou accès refusé", 403);
      }

      company_id = membership.company_id;
    } else {
      return jsonError("Context manquant", 400);
    }

    const clientId = Deno.env.get("BRIDGE_CLIENT_ID");
    const clientSecret = Deno.env.get("BRIDGE_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return jsonError("Configuration Bridge manquante", 500);
    }

    const bridgeHeaders = {
      "Bridge-Version": "2021-06-01",
      "Client-Id": clientId,
      "Client-Secret": clientSecret,
      "Content-Type": "application/json",
    };

    const authenticateRes = await fetch("https://api.bridgeapi.io/v2/authenticate", {
      method: "POST",
      headers: bridgeHeaders,
      body: JSON.stringify({ user_uuid }),
    });

    if (!authenticateRes.ok) {
      const errBody = await authenticateRes.text();
      console.error("[bridge-auth-callback] authenticate failed:", authenticateRes.status, errBody);
      return jsonError("Échec authenticate Bridge", 502);
    }

    const { access_token } = await authenticateRes.json();

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
            bridge_user_uuid: user_uuid,
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
