import { calculateRealBalance } from '../banking/queries';
import { supabase } from '../lib/supabase';

export interface TreasuryBalance {
  real: number;
  theoretical: number | null;
  gap: number | null;
  startDate: string | null;
}

export async function calculateTreasuryBalance(
  companyId: string,
  bankAccountId: string,
  targetDate?: string
): Promise<TreasuryBalance> {
  const real = await calculateRealBalance(companyId, bankAccountId, targetDate);
  const result = await calculateTheoreticalBalance(companyId, bankAccountId, targetDate);

  const gap = result.theoretical !== null ? real - result.theoretical : null;

  return {
    real,
    theoretical: result.theoretical,
    gap,
    startDate: result.startDate,
  };
}

async function calculateTheoreticalBalance(
  companyId: string,
  bankAccountId: string,
  targetDate?: string
): Promise<{ theoretical: number | null; startDate: string | null }> {
  const { data: account, error: accountError } = await supabase
    .from('bank_accounts')
    .select('opening_balance_cents, start_date')
    .eq('id', bankAccountId)
    .eq('company_id', companyId)
    .single();

  if (accountError || !account) {
    return { theoretical: null, startDate: null };
  }

  let expenseQuery = supabase
    .from('expense_documents')
    .select('total_incl_vat')
    .eq('company_id', companyId)
    .eq('accounting_status', 'validated')
    .eq('payment_status', 'paid');

  if (account.start_date) {
    expenseQuery = expenseQuery.gte('invoice_date', account.start_date);
  }

  if (targetDate) {
    expenseQuery = expenseQuery.lte('invoice_date', targetDate);
  }

  const { data: expenses, error: expenseError } = await expenseQuery;

  if (expenseError) {
    console.error('Error fetching expenses:', expenseError);
    return { theoretical: null, startDate: account.start_date };
  }

  let revenueQuery = supabase
    .from('revenue_documents')
    .select('total_incl_vat')
    .eq('company_id', companyId)
    .eq('accounting_status', 'validated')
    .eq('payment_status', 'paid');

  if (account.start_date) {
    revenueQuery = revenueQuery.gte('invoice_date', account.start_date);
  }

  if (targetDate) {
    revenueQuery = revenueQuery.lte('invoice_date', targetDate);
  }

  const { data: revenues, error: revenueError } = await revenueQuery;

  if (revenueError) {
    console.error('Error fetching revenues:', revenueError);
    return { theoretical: null, startDate: account.start_date };
  }

  const totalExpensesTTC = (expenses || []).reduce((sum, exp) => {
    const amount = exp.total_incl_vat || 0;
    return sum + Number(amount);
  }, 0);

  const totalRevenuesTTC = (revenues || []).reduce((sum, rev) => {
    const amount = rev.total_incl_vat || 0;
    return sum + Number(amount);
  }, 0);

  const expensesCents = Math.round(totalExpensesTTC * 100);
  const revenuesCents = Math.round(totalRevenuesTTC * 100);

  const theoretical = account.opening_balance_cents + revenuesCents - expensesCents;

  return { theoretical, startDate: account.start_date };
}
