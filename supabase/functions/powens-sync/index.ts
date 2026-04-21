import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function hashExternalId(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
    const powensApiBase = Deno.env.get("POWENS_API_BASE_URL")!;

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

    const { data: connection, error: connError } = await serviceClient
      .from("powens_connections")
      .select("powens_user_id, powens_auth_token, powens_connection_id")
      .eq("company_id", companyId)
      .eq("status", "connected")
      .not("powens_user_id", "is", null)
      .not("powens_auth_token", "is", null)
      .not("powens_connection_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: "No active Powens connection found for this company" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { powens_user_id, powens_auth_token, powens_connection_id } = connection;

    const accountsResponse = await fetch(
      `${powensApiBase}/users/${powens_user_id}/accounts?connection_id=${powens_connection_id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${powens_auth_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!accountsResponse.ok) {
      const errText = await accountsResponse.text();
      return new Response(
        JSON.stringify({ error: "Failed to fetch Powens accounts", detail: errText }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const accountsData = await accountsResponse.json();
    const powensAccounts: Array<{
      id: number;
      name: string;
      balance: number;
      currency: { id: string };
      type: string;
      iban?: string | null;
      number?: string | null;
      original_id?: string | null;
    }> = accountsData.accounts ?? [];

    const normalizeIban = (value: string | null | undefined): string | null => {
      if (!value) return null;
      const cleaned = value.replace(/[\s-]/g, "").toUpperCase();
      return cleaned.length > 0 ? cleaned : null;
    };

    let accountsCount = 0;
    const syncedBankAccountIds: Array<{ bankAccountId: string; powensAccountId: number }> = [];
    const now = new Date().toISOString();

    for (const pa of powensAccounts) {
      let { data: existing } = await serviceClient
        .from("bank_accounts")
        .select("id")
        .eq("company_id", companyId)
        .eq("powens_account_id", pa.id)
        .maybeSingle();

      if (!existing) {
        const { data: legacy } = await serviceClient
          .from("bank_accounts")
          .select("id")
          .eq("company_id", companyId)
          .eq("powens_connection_id", powens_connection_id)
          .is("powens_account_id", null)
          .maybeSingle();
        if (legacy) {
          existing = legacy;
        }
      }

      const normalizedIban = normalizeIban(pa.iban);

      let bankAccountId: string;

      if (existing) {
        const updatePayload: Record<string, unknown> = {
          name: pa.name,
          currency: pa.currency?.id ?? "EUR",
          powens_user_id: powens_user_id,
          powens_auth_token: powens_auth_token,
          powens_connection_id: powens_connection_id,
          powens_account_id: pa.id,
          powens_last_sync_at: now,
          updated_at: now,
        };
        if (normalizedIban) {
          updatePayload.iban = normalizedIban;
        }

        await serviceClient
          .from("bank_accounts")
          .update(updatePayload)
          .eq("id", existing.id);

        bankAccountId = existing.id;
      } else {
        const insertPayload: Record<string, unknown> = {
          company_id: companyId,
          name: pa.name,
          currency: pa.currency?.id ?? "EUR",
          opening_balance_cents: Math.round((pa.balance ?? 0) * 100),
          powens_user_id: powens_user_id,
          powens_auth_token: powens_auth_token,
          powens_connection_id: powens_connection_id,
          powens_account_id: pa.id,
          powens_last_sync_at: now,
        };
        if (normalizedIban) {
          insertPayload.iban = normalizedIban;
        }

        const { data: inserted, error: insertErr } = await serviceClient
          .from("bank_accounts")
          .insert(insertPayload)
          .select("id")
          .single();

        if (insertErr || !inserted) continue;

        bankAccountId = inserted.id;
        accountsCount++;
      }

      syncedBankAccountIds.push({ bankAccountId, powensAccountId: pa.id });
    }

    let transactionsImported = 0;
    let duplicates = 0;

    for (const { bankAccountId, powensAccountId } of syncedBankAccountIds) {
      const txResponse = await fetch(
        `${powensApiBase}/users/${powens_user_id}/transactions?account_id=${powensAccountId}&limit=500`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${powens_auth_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!txResponse.ok) continue;

      const txData = await txResponse.json();
      const transactions: Array<{
        id: number;
        date: string;
        wording: string;
        value: number;
        original_currency?: { id: string };
        currency?: { id: string };
      }> = txData.transactions ?? [];

      if (transactions.length === 0) continue;

      const periodStart = transactions.reduce(
        (min, t) => (t.date < min ? t.date : min),
        transactions[0].date
      );
      const periodEnd = transactions.reduce(
        (max, t) => (t.date > max ? t.date : max),
        transactions[0].date
      );

      const { data: statement, error: stmtErr } = await serviceClient
        .from("bank_statements")
        .insert({
          company_id: companyId,
          bank_account_id: bankAccountId,
          period_start: periodStart,
          period_end: periodEnd,
          source: "powens",
          imported_at: now,
        })
        .select("id")
        .single();

      if (stmtErr || !statement) continue;

      for (const tx of transactions) {
        const rawId = `powens_${powens_user_id}_${tx.id}`;
        const externalIdHash = await hashExternalId(rawId);
        const amountCents = Math.round((tx.value ?? 0) * 100);
        const currency = tx.original_currency?.id ?? tx.currency?.id ?? "EUR";
        const label = tx.wording ?? "";

        try {
          const { error: lineErr } = await serviceClient
            .from("bank_statement_lines")
            .insert({
              company_id: companyId,
              bank_account_id: bankAccountId,
              statement_id: statement.id,
              date: tx.date,
              label,
              amount_cents: amountCents,
              currency,
              external_id_hash: externalIdHash,
            });

          if (lineErr) {
            if (lineErr.code === "23505") {
              duplicates++;
            }
          } else {
            transactionsImported++;
          }
        } catch {
          duplicates++;
        }
      }

      await serviceClient
        .from("bank_accounts")
        .update({ powens_last_sync_at: now, updated_at: now })
        .eq("id", bankAccountId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        accounts: accountsCount,
        transactionsImported,
        duplicates,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
