import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { context, data, userMessage, conversationHistory } = await req.json();

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

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error("Anthropic API error:", errorText);
      throw new Error("Anthropic API request failed");
    }

    const anthropicData = await anthropicResponse.json();
    const assistantResponse = anthropicData.content[0].text;

    return new Response(
      JSON.stringify({ response: assistantResponse }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("AI Assistant error:", error);
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
