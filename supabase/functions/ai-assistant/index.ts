import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Tu es un assistant comptable pédagogique.

RÈGLES ABSOLUES :
- Tu n'émets AUCUN conseil financier, bancaire, fiscal, juridique ou commercial
- Tu n'interviens PAS dans les décisions d'achat, de vente, d'investissement ou de crédit
- Tu te limites STRICTEMENT à expliquer les données visibles et leur lecture comptable
- Tu n'as accès qu'aux données explicitement fournies dans le contexte
- Tu ne fais AUCUNE recommandation d'optimisation ou de stratégie
- Tu réponds en français, de manière claire et pédagogique

INTERDICTIONS :
- Conseiller un crédit ou un placement
- Proposer une optimisation fiscale ou comptable
- Donner une stratégie business
- Influencer une décision d'entreprise

TON RÔLE :
Expliquer la signification des chiffres comptables affichés, les mécanismes comptables de base, et aider l'utilisateur à mieux comprendre ses données.`;

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("authorization");
    console.log('[AI EDGE AUTH]', {
      hasHeader: !!authHeader,
      preview: authHeader?.slice(0, 30),
      length: authHeader?.length
    });

    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized - invalid token" }, 401);
    }

    const { context, data, userMessage, conversationHistory, companyId } = await req.json();

    console.log('[AI BODY PARSED]', {
      context,
      companyId,
      hasData: !!data,
      dataKeys: data ? Object.keys(data) : [],
      userMessageLength: userMessage?.length || 0
    });

    if (!companyId) {
      return jsonResponse({ error: "Missing companyId" }, 400);
    }

    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (membershipError || !membership) {
      return jsonResponse({ error: "Forbidden - not a member of this company" }, 403);
    }

    const { data: subscription, error: subscriptionError } = await supabase
      .from("company_subscriptions")
      .select("plan_tier, status")
      .eq("company_id", companyId)
      .maybeSingle();

    if (subscriptionError || !subscription || subscription.plan_tier !== "PRO_PLUS_PLUS" || subscription.status !== "active") {
      return jsonResponse({ error: "Forbidden - Pro++ subscription required" }, 403);
    }

    if (!userMessage || !context || !data) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const contextDescription = getContextDescription(context, data);

    console.log('[AI CONTEXT BUILT]', {
      success: true,
      contextPreview: contextDescription.slice(0, 100)
    });

    const messages = [
      ...(conversationHistory || []),
      {
        role: "user",
        content: `Contexte comptable : ${contextDescription}\n\nQuestion : ${userMessage}`,
      },
    ];

    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: messages,
      }),
    });

    console.log('[AI ANTHROPIC RESPONSE]', {
      status: anthropicResponse.status,
      ok: anthropicResponse.ok
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error('[AI ANTHROPIC ERROR FULL BODY]', errorText);

      try {
        const errorJson = JSON.parse(errorText);
        console.error('[AI ANTHROPIC ERROR PARSED]', {
          type: errorJson.error?.type || errorJson.type || 'Unknown',
          message: errorJson.error?.message || errorJson.message || 'No message',
          code: errorJson.error?.code || errorJson.code || 'No code'
        });
      } catch (parseError) {
        console.error('[AI ANTHROPIC ERROR NOT JSON]', 'Body is not valid JSON');
      }

      throw new Error("Anthropic API request failed");
    }

    const anthropicData = await anthropicResponse.json();

    console.log('[AI ANTHROPIC DATA STRUCTURE]', {
      hasContent: !!anthropicData.content,
      contentLength: anthropicData.content?.length || 0,
      topLevelKeys: Object.keys(anthropicData)
    });

    const assistantResponse = anthropicData.content[0].text;

    return new Response(
      JSON.stringify({ response: assistantResponse }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error('[AI CATCH ERROR]', {
      errorName: error?.name || 'Unknown',
      errorMessage: error?.message || 'No message',
      errorStack: error?.stack || 'No stack'
    });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function getContextDescription(context: string, data: Record<string, any>): string {
  switch (context) {
    case 'synthese':
      return `Vue synthèse - Résultat net HT: ${formatAmount(data.netResult)}, Revenus HT: ${formatAmount(data.revenues)}, Dépenses HT: ${formatAmount(data.expenses)}`;

    case 'compte-resultat':
      return `Compte de résultat - Produits HT: ${formatAmount(data.produitsHT)}, Charges HT: ${formatAmount(data.chargesHT)}, Résultat HT: ${formatAmount(data.resultatHT)}`;

    case 'tva':
      return `TVA - TVA collectée: ${formatAmount(data.tvaCollectee)}, TVA déductible: ${formatAmount(data.tvaDeductible)}, Solde TVA: ${formatAmount(data.soldeTVA)}`;

    default:
      return `Données comptables: ${JSON.stringify(data)}`;
  }
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}
