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
    };

    const authenticateBody = JSON.stringify({ external_user_id: user.id });
    console.log("[bridge-auth-init] authenticate request", {
      endpoint: "https://api.bridgeapi.io/v2/authenticate",
      headers: {
        "Bridge-Version": bridgeHeaders["Bridge-Version"],
        "Client-Id": bridgeHeaders["Client-Id"],
        "Content-Type": bridgeHeaders["Content-Type"],
        "Client-Secret": bridgeHeaders["Client-Secret"] ? "[SET]" : "[MISSING]",
      },
      body: authenticateBody,
    });

    const authenticateRes = await fetch("https://api.bridgeapi.io/v2/authenticate", {
      method: "POST",
      headers: bridgeHeaders,
      body: authenticateBody,
    });

    const authenticateRawBody = await authenticateRes.text();
    console.log("[bridge-auth-init] authenticate response", {
      status: authenticateRes.status,
      body: authenticateRawBody,
    });

    if (!authenticateRes.ok) {
      return jsonError("Erreur authenticate Bridge", 502);
    }

    const authenticateJson = JSON.parse(authenticateRawBody);
    const { access_token } = authenticateJson;

    const connectRes = await fetch("https://api.bridgeapi.io/v2/connect/items/add", {
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
      console.error("[bridge-auth-init] connect error:", err);
      return jsonError("Erreur connect Bridge", 502);
    }

    const { redirect_url } = await connectRes.json();

    return new Response(
      JSON.stringify({ redirect_url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[bridge-auth-init] error:", (err as Error).message);
    return jsonError("Erreur interne", 500);
  }
});
