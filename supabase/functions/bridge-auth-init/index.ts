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

async function hmacSign(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

    const bridgeStateSecret = Deno.env.get("BRIDGE_STATE_SECRET");
    if (!bridgeStateSecret) return jsonError("Configuration manquante", 500);

    const timestamp = Date.now();
    const payload = JSON.stringify({ company_id: companyId, user_id: user.id, timestamp });
    const payloadB64 = btoa(payload);
    const signature = await hmacSign(bridgeStateSecret, payloadB64);
    const state = `${payloadB64}.${signature}`;

    const clientId = Deno.env.get("BRIDGE_CLIENT_ID");
    const redirectUri = Deno.env.get("BRIDGE_REDIRECT_URI");

    if (!clientId || !redirectUri) {
      return jsonError("Configuration Bridge manquante", 500);
    }

    const authUrl = new URL("https://api.bridgeapi.io/v2/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);

    return new Response(
      JSON.stringify({ auth_url: authUrl.toString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[bridge-auth-init] error:", (err as Error).message);
    return jsonError("Erreur interne", 500);
  }
});
