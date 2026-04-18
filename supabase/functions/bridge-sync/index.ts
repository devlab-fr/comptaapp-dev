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

interface BridgeAccount {
  id: string;
  company_id: string;
  bridge_account_id: string;
  bridge_item_id: string | null;
  bridge_access_token: string;
  bridge_refresh_token: string;
  bridge_token_expires_at: string | null;
  bridge_last_sync_at: string | null;
}

async function getValidToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  account: BridgeAccount
): Promise<string> {
  const clientId = Deno.env.get("BRIDGE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("BRIDGE_CLIENT_SECRET")!;

  const needsRefresh =
    account.bridge_token_expires_at !== null &&
    new Date(account.bridge_token_expires_at).getTime() - Date.now() < 5 * 60 * 1000;

  if (!needsRefresh) {
    return account.bridge_access_token;
  }

  const refreshResponse = await fetch("https://api.bridgeapi.io/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: account.bridge_refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!refreshResponse.ok) {
    await supabaseAdmin
      .from("bank_accounts")
      .update({ bridge_access_token: null, updated_at: new Date().toISOString() })
      .eq("id", account.id);
    throw new Error(`Token Bridge expiré pour le compte ${account.id} — reconnexion requise`);
  }

  const refreshData = await refreshResponse.json();
  const newToken: string = refreshData.access_token;
  const newExpiry = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();

  await supabaseAdmin
    .from("bank_accounts")
    .update({
      bridge_access_token: newToken,
      bridge_token_expires_at: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  return newToken;
}

async function syncAccount(
  supabaseAdmin: ReturnType<typeof createClient>,
  account: BridgeAccount
): Promise<{ synced: number; skipped: number }> {
  const accessToken = await getValidToken(supabaseAdmin, account);

  const sinceDate = account.bridge_last_sync_at
    ? new Date(new Date(account.bridge_last_sync_at).getTime() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]
    : undefined;

  const apiUrl = new URL(
    `https://api.bridgeapi.io/v2/accounts/${account.bridge_account_id}/transactions`
  );
  apiUrl.searchParams.set("limit", "500");
  if (sinceDate) {
    apiUrl.searchParams.set("since", sinceDate);
  }

  const txResponse = await fetch(apiUrl.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Bridge-Version": "2021-06-01",
    },
  });

  if (!txResponse.ok) {
    throw new Error(`Bridge transactions fetch failed: ${txResponse.status}`);
  }

  const txData = await txResponse.json();
  const transactions: Array<{
    id: number;
    date: string;
    description: string;
    amount: number;
    currency_code: string;
  }> = txData.resources || txData || [];

  const paginationCursor: string | null = txData.pagination?.next_uri ?? null;

  if (transactions.length === 0) {
    return { synced: 0, skipped: 0 };
  }

  const { data: existingStatement } = await supabaseAdmin
    .from("bank_statements")
    .select("id")
    .eq("company_id", account.company_id)
    .eq("bank_account_id", account.id)
    .eq("source", "bridge")
    .maybeSingle();

  let statementId: string;

  if (existingStatement) {
    statementId = existingStatement.id;
  } else {
    const { data: newStatement, error: stmtError } = await supabaseAdmin
      .from("bank_statements")
      .insert({
        company_id: account.company_id,
        bank_account_id: account.id,
        source: "bridge",
        imported_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (stmtError || !newStatement) {
      throw new Error("Impossible de créer le relevé bancaire Bridge");
    }
    statementId = newStatement.id;
  }

  let synced = 0;
  let skipped = 0;

  for (const tx of transactions) {
    const txId = String(tx.id);
    const externalHash = `bridge_${account.bridge_account_id}_${txId}`;
    const amountCents = Math.round(tx.amount * 100);

    const { error: upsertError } = await supabaseAdmin
      .from("bank_statement_lines")
      .upsert(
        {
          company_id: account.company_id,
          bank_account_id: account.id,
          statement_id: statementId,
          date: tx.date,
          label: tx.description || `Transaction ${txId}`,
          amount_cents: amountCents,
          currency: tx.currency_code || "EUR",
          external_id_hash: externalHash,
        },
        {
          onConflict: "company_id,external_id_hash",
          ignoreDuplicates: true,
        }
      );

    if (upsertError) {
      if (upsertError.code === "23505") {
        skipped++;
      } else {
        console.error("[bridge-sync] upsert line error:", upsertError.message);
        skipped++;
      }
    } else {
      synced++;
    }
  }

  let newSyncCursor: string;

  if (paginationCursor) {
    newSyncCursor = new Date().toISOString();
  } else {
    const maxDate = transactions.reduce((max, tx) => {
      return tx.date > max ? tx.date : max;
    }, transactions[0].date);

    const maxDateMinus1 = new Date(new Date(maxDate).getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0] + "T00:00:00.000Z";

    newSyncCursor = maxDateMinus1;
  }

  await supabaseAdmin
    .from("bank_accounts")
    .update({
      bridge_last_sync_at: newSyncCursor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  return { synced, skipped };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError("Unauthorized", 401);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceCall = authHeader === `Bearer ${serviceKey}`;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey
    );

    let companyId: string | undefined;
    let bankAccountId: string | undefined;

    if (!isServiceCall) {
      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !user) return jsonError("Unauthorized", 401);

      const body = await req.json().catch(() => ({}));
      companyId = body?.company_id;
      bankAccountId = body?.bank_account_id;

      if (!companyId) return jsonError("company_id requis", 400);

      const { data: membership } = await supabaseAdmin
        .from("memberships")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .in("role", ["admin", "owner"])
        .maybeSingle();

      if (!membership) return jsonError("Accès refusé", 403);
    } else {
      const body = await req.json().catch(() => ({}));
      companyId = body?.company_id;
      bankAccountId = body?.bank_account_id;

      if (!companyId) return jsonError("company_id requis", 400);
    }

    let query = supabaseAdmin
      .from("bank_accounts")
      .select("id, company_id, bridge_account_id, bridge_item_id, bridge_access_token, bridge_refresh_token, bridge_token_expires_at, bridge_last_sync_at")
      .eq("company_id", companyId)
      .not("bridge_account_id", "is", null)
      .not("bridge_access_token", "is", null);

    if (bankAccountId) {
      query = query.eq("id", bankAccountId);
    }

    const { data: accounts, error: accountsError } = await query;

    if (accountsError) return jsonError("Erreur récupération comptes", 500);
    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "Aucun compte Bridge à synchroniser", synced: 0, skipped: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
    const accountsToSync = accounts.filter((acc: BridgeAccount) => {
      if (!acc.bridge_last_sync_at) return true;
      return Date.now() - new Date(acc.bridge_last_sync_at).getTime() > SYNC_COOLDOWN_MS;
    });

    if (accountsToSync.length === 0) {
      return new Response(
        JSON.stringify({ message: "Synchronisation récente, aucune action", synced: 0, skipped: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSynced = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    for (const account of accountsToSync) {
      try {
        const result = await syncAccount(supabaseAdmin, account as BridgeAccount);
        totalSynced += result.synced;
        totalSkipped += result.skipped;
      } catch (err) {
        errors.push(`Compte ${account.id}: ${(err as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        synced: totalSynced,
        skipped: totalSkipped,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[bridge-sync] error:", (err as Error).message);
    return jsonError("Erreur interne", 500);
  }
});
