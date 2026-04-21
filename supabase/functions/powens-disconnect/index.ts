import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

    const { companyId } = await req.json();
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
      .in("role", ["owner", "admin"])
      .maybeSingle();

    if (membershipError || !membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: connections, error: connError } = await serviceClient
      .from("powens_connections")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "connected");

    if (connError) throw connError;

    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ error: "No active connection found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateConnError } = await serviceClient
      .from("powens_connections")
      .update({ status: "disconnected" })
      .eq("company_id", companyId)
      .eq("status", "connected");

    if (updateConnError) throw updateConnError;

    const { data: remaining, error: checkError } = await serviceClient
      .from("powens_connections")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "connected");

    if (checkError) throw checkError;

    if (remaining && remaining.length > 0) {
      throw new Error("Disconnect incomplete: connected rows still exist");
    }

    const { error: updateBankError } = await serviceClient
      .from("bank_accounts")
      .update({ powens_auth_token: null, powens_user_id: null })
      .eq("company_id", companyId);

    if (updateBankError) {
      throw updateBankError;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
