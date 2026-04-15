import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError("Unauthorized", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonError("Unauthorized", 401);

    const body = await req.json();
    const companyId: string | undefined = body?.company_id;
    if (!companyId) return jsonError("company_id requis", 400);

    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("id, role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .in("role", ["admin", "owner"])
      .maybeSingle();

    if (membershipError || !membership) {
      return jsonError("Accès refusé", 403);
    }

    const clientId = Deno.env.get("BRIDGE_CLIENT_ID");
    const clientSecret = Deno.env.get("BRIDGE_CLIENT_SECRET");
    const redirectUri = Deno.env.get("BRIDGE_REDIRECT_URI");

    if (!clientId || !clientSecret || !redirectUri) {
      return jsonError("Configuration Bridge manquante", 500);
    }

    const bridgeHeaders = {
      "Bridge-Version": "2025-01-15",
      "Client-Id": clientId,
      "Client-Secret": clientSecret,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    const tokenBody = JSON.stringify({ external_user_id: user.id });
    console.log("[bridge-auth-init] authorization/token request", {
      endpoint: "https://api-sandbox.bridgeapi.io/v3/aggregation/authorization/token",
      body: tokenBody,
    });

    const tokenRes = await fetch("https://api-sandbox.bridgeapi.io/v3/aggregation/authorization/token", {
      method: "POST",
      headers: bridgeHeaders,
      body: tokenBody,
    });

    const tokenRawBody = await tokenRes.text();
    console.log("[bridge-auth-init] authorization/token response", {
      status: tokenRes.status,
      body: tokenRawBody,
    });

    if (!tokenRes.ok) {
      return new Response(
        JSON.stringify({ error: "Bridge error", status: tokenRes.status, body: tokenRawBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenJson = JSON.parse(tokenRawBody);
    const access_token: string = tokenJson.access_token;

    if (!access_token) {
      console.error("[bridge-auth-init] access_token manquant dans la réponse authorization/token", tokenRawBody);
      return jsonError("access_token manquant dans la réponse Bridge", 502);
    }

    const connectRes = await fetch("https://api-sandbox.bridgeapi.io/v3/aggregation/connect-sessions", {
      method: "POST",
      headers: {
        ...bridgeHeaders,
        "Authorization": `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        country: "fr",
        callback_url: redirectUri,
        context: user.id,
      }),
    });

    if (!connectRes.ok) {
      const err = await connectRes.text();
      console.error("[bridge-auth-init] connect-sessions error:", err);
      return jsonError("Erreur connect Bridge", 502);
    }

    const connectJson = await connectRes.json();
    const redirect_url: string = connectJson.redirect_url ?? connectJson.url;

    return new Response(
      JSON.stringify({ redirect_url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[bridge-auth-init] error:", (err as Error).message);
    return jsonError("Erreur interne", 500);
  }
});
