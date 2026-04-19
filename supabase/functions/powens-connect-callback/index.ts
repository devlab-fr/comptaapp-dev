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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    let body: {
      state?: string;
      connection_id?: string | number;
      error?: string;
      error_description?: string;
    };

    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { state, connection_id, error, error_description } = body;

    if (!state) {
      return new Response(JSON.stringify({ error: "Missing state parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (error) {
      await serviceClient
        .from("powens_connections")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("state", state);

      return new Response(
        JSON.stringify({
          error: error,
          error_description: error_description ?? null,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!connection_id) {
      return new Response(JSON.stringify({ error: "Missing connection_id parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: connection, error: fetchError } = await serviceClient
      .from("powens_connections")
      .select("id, status")
      .eq("state", state)
      .maybeSingle();

    if (fetchError || !connection) {
      return new Response(JSON.stringify({ error: "Connection not found for given state" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (connection.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Connection already processed", current_status: connection.status }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { error: updateError } = await serviceClient
      .from("powens_connections")
      .update({
        powens_connection_id: connection_id,
        status: "connected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to update connection" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
