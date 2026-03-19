import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    console.log("=== STRIPE-DEBUG-CALLER EXECUTING ===");

    const companyId = "c9103915-38dc-475e-b77e-9cf54044a5ca";
    const expectedCompanyName = "ENTREPRISE1";

    console.log("Calling stripe-debug-company with service role key...");

    const debugResponse = await fetch(`${supabaseUrl}/functions/v1/stripe-debug-company`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        companyId,
        expectedCompanyName,
      }),
    });

    const result = await debugResponse.json();

    console.log("=== STRIPE-DEBUG RESULT ===");
    console.log(JSON.stringify(result, null, 2));

    return new Response(JSON.stringify(result, null, 2), {
      status: debugResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[CALLER_ERROR]", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
