import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ScanRequest {
  image: string;
  mimeType: string;
  requestId?: string;
  fileName?: string;
  fileSize?: number;
  lastModified?: number;
  companyId?: string;
}

interface ScanResult {
  suggested_type: 'expense' | 'revenue' | null;
  date: string | null;
  vendor_or_client: string | null;
  amount_ttc: number | null;
  amount_ht: number | null;
  amount_tva: number | null;
  tva_rate: number | null;
  currency: string | null;
  description: string | null;
  suggested_category_label: string | null;
  confidence: number;
}

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
    console.log('STAGE: received_request');

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

    let requestData: ScanRequest;

    try {
      requestData = await req.json();
    } catch (jsonError) {
      console.error('STAGE: parse_request_failed', jsonError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON request', stage: 'parse_request' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { image, mimeType, requestId, fileName, fileSize, lastModified, companyId } = requestData;

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

    console.log('REQUEST_METADATA:', {
      requestId,
      fileName,
      fileSize,
      lastModified,
      mimeType,
      imageLength: image?.length || 0
    });

    if (!image) {
      console.error('STAGE: validation_failed - missing image');
      return new Response(
        JSON.stringify({ error: 'Missing image data', stage: 'validation' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const isPdf = mimeType?.toLowerCase().includes('pdf');
    console.log(`FILE_TYPE: ${isPdf ? 'pdf' : 'image'}`);

    if (isPdf) {
      console.error('STAGE: validation_failed - PDF not supported');
      return new Response(
        JSON.stringify({
          error: 'PDF_NOT_SUPPORTED_UPLOAD_IMAGE',
          stage: 'validation',
          message: 'Les fichiers PDF ne sont pas supportés. Veuillez uploader une image (JPG, PNG, WEBP).'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('STAGE: config_error - missing API key');
      return new Response(
        JSON.stringify({ error: 'Server configuration error', stage: 'config' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('STAGE: openai_api_key_found');

    const prompt = `Tu es un expert comptable français.

Tu reçois le contenu OCR ou visuel d'un justificatif (ticket, facture, reçu).

OBJECTIF
Extraire les informations comptables et retourner UNIQUEMENT un JSON strict.

RÈGLES ABSOLUES
- Ne jamais expliquer
- Ne jamais commenter
- Ne jamais mettre de texte hors JSON
- Toujours remplir les champs si l'information est déductible
- Devise par défaut : EUR
- TVA française (20%, 10%, 5.5% ou 0)

FORMAT DE SORTIE (JSON STRICT)
{
  "suggested_type": "expense" | "revenue",
  "date": "YYYY-MM-DD",
  "vendor_or_client": "string",
  "description": "string",
  "amount_ht": number,
  "amount_tva": number,
  "amount_ttc": number,
  "tva_rate": number,
  "currency": "EUR",
  "suggested_category_label": "string",
  "confidence": number
}

LOGIQUE
- Une facture d'achat = expense
- Une facture de vente = revenue
- Si seulement TTC est visible → recalculer HT/TVA
- Exemple catégorie carburant : "Carburant"
- Confidence entre 0.6 et 1.0 si données cohérentes

Analyse maintenant le document fourni.`;

    let openaiResponse: Response;

    try {
      console.log('STAGE: calling_openai');

      const messageContent: any[] = [
        {
          type: 'text',
          text: prompt
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${image}`
          }
        }
      ];

      console.log('OPENAI_REQUEST_PREPARED:', {
        model: 'gpt-4o',
        hasImageUrl: true,
        imageDataPrefix: `data:${mimeType};base64,${image.substring(0, 50)}...`
      });

      openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: messageContent
            }
          ],
          max_tokens: 500,
          temperature: 0.1,
          response_format: { type: "json_object" }
        }),
      });
    } catch (fetchError) {
      console.error('STAGE: openai_network_error', fetchError);
      return new Response(
        JSON.stringify({ error: 'Network error calling OpenAI', stage: 'calling_openai' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text().catch(() => 'Unable to read error');
      console.error('STAGE: openai_api_error', {
        status: openaiResponse.status,
        statusText: openaiResponse.statusText,
        error: errorText
      });
      return new Response(
        JSON.stringify({
          error: `OpenAI API error: ${openaiResponse.status}`,
          stage: 'openai_response',
          details: errorText
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('STAGE: openai_ok');

    let openaiData: any;
    try {
      openaiData = await openaiResponse.json();
    } catch (jsonError) {
      console.error('STAGE: parse_openai_response_failed', jsonError);
      return new Response(
        JSON.stringify({ error: 'Failed to parse OpenAI response', stage: 'parse_openai_response' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      console.error('STAGE: no_content_from_openai', openaiData);
      return new Response(
        JSON.stringify({ error: 'No content received from OpenAI', stage: 'openai_response' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('OPENAI_CONTENT_RECEIVED:', content.substring(0, 200));

    let parsedResult: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      parsedResult = JSON.parse(jsonStr);
      console.log('STAGE: parse_ok - Successfully parsed AI response');
      console.log('PARSED_RESULT:', parsedResult);
    } catch (parseError) {
      console.error('STAGE: parse_ai_json_failed', parseError);
      console.error('CONTENT_WAS:', content);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI JSON response', stage: 'parse_ai_json', content }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result: ScanResult = {
      suggested_type: parsedResult.suggested_type || null,
      date: parsedResult.date || null,
      vendor_or_client: parsedResult.vendor_or_client || null,
      amount_ttc: parsedResult.amount_ttc !== undefined ? parsedResult.amount_ttc : null,
      amount_ht: parsedResult.amount_ht !== undefined ? parsedResult.amount_ht : null,
      amount_tva: parsedResult.amount_tva !== undefined ? parsedResult.amount_tva : null,
      tva_rate: parsedResult.tva_rate !== undefined ? parsedResult.tva_rate : null,
      currency: parsedResult.currency || "EUR",
      description: parsedResult.description || null,
      suggested_category_label: parsedResult.suggested_category_label || null,
      confidence: parsedResult.confidence !== undefined ? parsedResult.confidence : 0
    };

    console.log('STAGE: success - Scan completed successfully');
    console.log('FINAL_RESULT:', result);

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('STAGE: unhandled_error', error);
    console.error('ERROR_STACK:', error instanceof Error ? error.stack : 'No stack');
    return new Response(
      JSON.stringify({ error: 'Unexpected server error', stage: 'unhandled_error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});