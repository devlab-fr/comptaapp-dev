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
  linked_accounting_entry_id?: string | null;
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

  const lineIds = (data || []).map((line: any) => line.id);

  let reconciledLines: Record<string, string> = {};
  if (lineIds.length > 0) {
    const { data: entries } = await supabase
      .from('accounting_entries')
      .select('id, bank_statement_line_id')
      .in('bank_statement_line_id', lineIds)
      .not('bank_statement_line_id', 'is', null);

    if (entries) {
      entries.forEach((entry: any) => {
        reconciledLines[entry.bank_statement_line_id] = entry.id;
      });
    }
  }

  return (data || []).map((line: any) => ({
    ...line,
    match_status: line.bank_reconciliations?.[0]?.match_status || 'unmatched',
    note: line.bank_reconciliations?.[0]?.note || null,
    linked_accounting_entry_id: reconciledLines[line.id] || null,
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

export async function createBankAccountingEntry(
  companyId: string,
  lineId: string,
  accountCode: string,
  label: string
): Promise<string> {
  const { data: bankLine, error: lineError } = await supabase
    .from('bank_statement_lines')
    .select('*')
    .eq('id', lineId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (lineError || !bankLine) {
    throw new Error('Transaction bancaire introuvable');
  }

  if (bankLine.linked_accounting_entry_id) {
    throw new Error('Cette transaction est déjà liée à une écriture comptable');
  }

  const { data: journal, error: journalError } = await supabase
    .from('journals')
    .select('id')
    .eq('company_id', companyId)
    .eq('code', 'BQ')
    .eq('is_active', true)
    .maybeSingle();

  if (journalError || !journal) {
    throw new Error('Journal BQ introuvable');
  }

  const { data: account512, error: account512Error } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('code', '512')
    .eq('is_active', true)
    .maybeSingle();

  if (account512Error || !account512) {
    throw new Error('Compte 512 (Banque) introuvable');
  }

  const { data: targetAccount, error: targetAccountError } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('code', accountCode)
    .eq('is_active', true)
    .maybeSingle();

  if (targetAccountError || !targetAccount) {
    throw new Error(`Compte ${accountCode} introuvable`);
  }

  const fiscalYear = new Date(bankLine.date).getFullYear();
  const amountEuros = Math.abs(bankLine.amount_cents) / 100;
  const isCredit = bankLine.amount_cents > 0;

  const { data: entry, error: entryError } = await supabase
    .from('accounting_entries')
    .insert({
      company_id: companyId,
      fiscal_year: fiscalYear,
      journal_id: journal.id,
      entry_date: bankLine.date,
      description: `Transaction bancaire - ${label}`,
    })
    .select('id')
    .single();

  if (entryError || !entry) {
    throw new Error('Erreur lors de la création de l\'écriture comptable');
  }

  const lines = isCredit
    ? [
        {
          entry_id: entry.id,
          account_id: account512.id,
          label,
          debit: amountEuros,
          credit: 0,
          line_order: 1,
        },
        {
          entry_id: entry.id,
          account_id: targetAccount.id,
          label,
          debit: 0,
          credit: amountEuros,
          line_order: 2,
        },
      ]
    : [
        {
          entry_id: entry.id,
          account_id: targetAccount.id,
          label,
          debit: amountEuros,
          credit: 0,
          line_order: 1,
        },
        {
          entry_id: entry.id,
          account_id: account512.id,
          label,
          debit: 0,
          credit: amountEuros,
          line_order: 2,
        },
      ];

  const { error: linesError } = await supabase
    .from('accounting_lines')
    .insert(lines);

  if (linesError) {
    await supabase.from('accounting_entries').delete().eq('id', entry.id);
    throw new Error('Erreur lors de la création des lignes comptables');
  }

  const { error: updateError } = await supabase
    .from('bank_statement_lines')
    .update({
      linked_accounting_entry_id: entry.id,
    })
    .eq('id', lineId)
    .eq('company_id', companyId);

  if (updateError) {
    await supabase.from('accounting_entries').delete().eq('id', entry.id);
    throw new Error('Erreur lors de la mise à jour de la transaction bancaire');
  }

  const { error: reconciliationError } = await supabase
    .from('bank_reconciliations')
    .upsert({
      company_id: companyId,
      bank_statement_line_id: lineId,
      match_status: 'matched',
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'bank_statement_line_id',
    });

  if (reconciliationError) {
    console.error('Erreur lors de la mise à jour du statut de rapprochement:', reconciliationError);
  }

  return entry.id;
}
