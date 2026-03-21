import { supabase } from '../lib/supabase';

export interface BankAccount {
  id: string;
  company_id: string;
  name: string;
  currency: string;
  opening_balance_cents: number;
  opening_balance_date: string | null;
  start_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankStatementLine {
  id: string;
  company_id: string;
  bank_account_id: string;
  statement_id: string;
  date: string;
  label: string;
  amount_cents: number;
  currency: string;
  external_id_hash: string;
  created_at: string;
  match_status?: string;
  note?: string;
}

export async function getBankAccounts(companyId: string): Promise<BankAccount[]> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createBankAccount(
  companyId: string,
  name: string,
  currency: string = 'EUR',
  openingBalanceCents: number = 0
): Promise<string> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .insert({
      company_id: companyId,
      name,
      currency,
      opening_balance_cents: openingBalanceCents,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw error || new Error('Failed to create bank account');
  }

  return data.id;
}

export async function getBankStatementLines(companyId: string, bankAccountId: string): Promise<BankStatementLine[]> {
  const { data, error } = await supabase
    .from('bank_statement_lines')
    .select(`
      *,
      bank_reconciliations (
        match_status,
        note
      )
    `)
    .eq('company_id', companyId)
    .eq('bank_account_id', bankAccountId)
    .order('date', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((line: any) => ({
    ...line,
    match_status: line.bank_reconciliations?.[0]?.match_status || 'unmatched',
    note: line.bank_reconciliations?.[0]?.note || null,
  }));
}

export async function updateReconciliation(
  companyId: string,
  lineId: string,
  matchStatus: string,
  note: string | null
): Promise<void> {
  const { data: existingReconciliation } = await supabase
    .from('bank_reconciliations')
    .select('id')
    .eq('bank_statement_line_id', lineId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (existingReconciliation) {
    const { error } = await supabase
      .from('bank_reconciliations')
      .update({
        match_status: matchStatus,
        note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingReconciliation.id);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await supabase
      .from('bank_reconciliations')
      .insert({
        company_id: companyId,
        bank_statement_line_id: lineId,
        match_status: matchStatus,
        note,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      throw error;
    }
  }
}

export async function calculateRealBalance(
  companyId: string,
  bankAccountId: string,
  targetDate?: string
): Promise<number> {
  const { data: account, error: accountError } = await supabase
    .from('bank_accounts')
    .select('opening_balance_cents')
    .eq('id', bankAccountId)
    .eq('company_id', companyId)
    .single();

  if (accountError || !account) {
    throw accountError || new Error('Bank account not found');
  }

  let query = supabase
    .from('bank_statement_lines')
    .select('amount_cents')
    .eq('company_id', companyId)
    .eq('bank_account_id', bankAccountId);

  if (targetDate) {
    query = query.lte('date', targetDate);
  }

  const { data: lines, error: linesError } = await query;

  if (linesError) {
    throw linesError;
  }

  const totalCents = (lines || []).reduce((sum, line) => sum + line.amount_cents, 0);

  return account.opening_balance_cents + totalCents;
}
