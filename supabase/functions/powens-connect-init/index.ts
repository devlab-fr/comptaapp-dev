import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { companyId?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { companyId } = body;
    if (!companyId) {
      return new Response(JSON.stringify({ error: "Missing companyId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: membership, error: membershipError } = await serviceClient
      .from("memberships")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .in("role", ["admin", "owner"])
      .maybeSingle();

    if (membershipError || !membership) {
      return new Response(JSON.stringify({ error: "Forbidden: not an admin of this company" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const state = crypto.randomUUID();

    const { data: connectionRow, error: insertError } = await serviceClient
      .from("powens_connections")
      .insert({
        company_id: companyId,
        state: state,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !connectionRow) {
      return new Response(JSON.stringify({ error: "Failed to create powens connection record" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const powensApiBase = Deno.env.get("POWENS_API_BASE_URL")!;
    const powensClientId = Deno.env.get("POWENS_CLIENT_ID")!;
    const powensClientSecret = Deno.env.get("POWENS_CLIENT_SECRET")!;
    const powensRedirectUri = Deno.env.get("POWENS_REDIRECT_URI")!;
    const powendDomain = Deno.env.get("POWENS_DOMAIN")!;

    const initResponse = await fetch(`${powensApiBase}/auth/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: powensClientId,
        client_secret: powensClientSecret,
      }),
    });

    if (!initResponse.ok) {
      const errText = await initResponse.text();
      return new Response(JSON.stringify({ error: "Powens auth/init failed", detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const initData = await initResponse.json();
    const authToken: string = initData.auth_token;
    const idUser: number = initData.id_user;

    await serviceClient
      .from("powens_connections")
      .update({
        powens_user_id: idUser,
        powens_auth_token: authToken,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionRow.id);

    const codeResponse = await fetch(`${powensApiBase}/auth/token/code`, {
      method: "GET",
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!codeResponse.ok) {
      const errText = await codeResponse.text();
      return new Response(JSON.stringify({ error: "Powens auth/token/code failed", detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const codeData = await codeResponse.json();
    const code: string = codeData.code;

    const connectUrl = new URL("https://webview.powens.com/fr/connect");
    connectUrl.searchParams.set("domain", powendDomain);
    connectUrl.searchParams.set("client_id", powensClientId);
    connectUrl.searchParams.set("redirect_uri", powensRedirectUri);
    connectUrl.searchParams.set("code", code);
    connectUrl.searchParams.set("state", state);

    return new Response(
      JSON.stringify({
        connect_url: connectUrl.toString(),
        state: state,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
