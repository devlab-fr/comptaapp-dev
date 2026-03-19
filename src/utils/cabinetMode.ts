import { supabase } from '../lib/supabase';

export type FiscalYearStatusType = 'en_cours' | 'a_corriger' | 'pret_cabinet' | 'cloture';

export interface FiscalYearStatus {
  id: string;
  company_id: string;
  fiscal_year: number;
  status: FiscalYearStatusType;
  updated_at: string;
  updated_by: string;
}

export interface AccountingEntryComment {
  id: string;
  entry_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  user?: {
    email: string;
  };
}

export interface AccountingEntryHistory {
  id: string;
  entry_id: string;
  user_id: string;
  action: string;
  created_at: string;
  user?: {
    email: string;
  };
}

export async function getFiscalYearStatus(
  companyId: string,
  fiscalYear: number
): Promise<FiscalYearStatus | null> {
  const { data, error } = await supabase
    .from('fiscal_year_status')
    .select('*')
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateFiscalYearStatus(
  companyId: string,
  fiscalYear: number,
  status: FiscalYearStatusType
): Promise<void> {
  const { data: existing } = await supabase
    .from('fiscal_year_status')
    .select('id')
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .maybeSingle();

  const { data: { user } } = await supabase.auth.getUser();

  if (existing) {
    const { error } = await supabase
      .from('fiscal_year_status')
      .update({
        status,
        updated_at: new Date().toISOString(),
        updated_by: user?.id
      })
      .eq('id', existing.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('fiscal_year_status')
      .insert({
        company_id: companyId,
        fiscal_year: fiscalYear,
        status,
        updated_by: user?.id
      });

    if (error) throw error;
  }
}

export async function canModifyEntry(
  entryId: string,
  companyId: string
): Promise<boolean> {
  const { data: entry } = await supabase
    .from('accounting_entries')
    .select('fiscal_year, locked')
    .eq('id', entryId)
    .maybeSingle();

  if (!entry) return false;

  const { data: status } = await supabase
    .from('fiscal_year_status')
    .select('status')
    .eq('company_id', companyId)
    .eq('fiscal_year', entry.fiscal_year)
    .maybeSingle();

  if (status?.status === 'cloture') {
    return false;
  }

  return true;
}

export async function getEntryComments(entryId: string): Promise<AccountingEntryComment[]> {
  const { data, error } = await supabase
    .from('accounting_entry_comments')
    .select(`
      id,
      entry_id,
      user_id,
      comment,
      created_at
    `)
    .eq('entry_id', entryId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function addEntryComment(
  entryId: string,
  comment: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('accounting_entry_comments')
    .insert({
      entry_id: entryId,
      user_id: user?.id,
      comment
    });

  if (error) throw error;
}

export async function deleteEntryComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('accounting_entry_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw error;
}

export async function getEntryHistory(entryId: string): Promise<AccountingEntryHistory[]> {
  const { data, error } = await supabase
    .from('accounting_entry_history')
    .select(`
      id,
      entry_id,
      user_id,
      action,
      created_at
    `)
    .eq('entry_id', entryId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getUserRole(companyId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('memberships')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle();

  return data?.role || null;
}

export function getStatusLabel(status: FiscalYearStatusType): string {
  const labels: Record<FiscalYearStatusType, string> = {
    'en_cours': 'En cours',
    'a_corriger': 'À corriger',
    'pret_cabinet': 'Prêt cabinet',
    'cloture': 'Clôturé'
  };
  return labels[status] || status;
}

export function getStatusColor(status: FiscalYearStatusType): string {
  const colors: Record<FiscalYearStatusType, string> = {
    'en_cours': '#3b82f6',
    'a_corriger': '#ef4444',
    'pret_cabinet': '#10b981',
    'cloture': '#6b7280'
  };
  return colors[status] || '#6b7280';
}

export function getStatusBgColor(status: FiscalYearStatusType): string {
  const colors: Record<FiscalYearStatusType, string> = {
    'en_cours': '#dbeafe',
    'a_corriger': '#fee2e2',
    'pret_cabinet': '#d1fae5',
    'cloture': '#f3f4f6'
  };
  return colors[status] || '#f3f4f6';
}
