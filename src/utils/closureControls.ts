import { supabase } from '../lib/supabase';
import { compareVat } from './accountingVat';

export type ControlStatus = 'ok' | 'warning' | 'error';

export interface ClosureControl {
  id: string;
  label: string;
  status: ControlStatus;
  count?: number;
  details?: string;
}

export interface ClosureStatus {
  overall: ControlStatus;
  controls: ClosureControl[];
}

export interface AccountingStatement {
  totalProduits: number;
  totalCharges: number;
  resultat: number;
  totalActif: number;
  totalPassif: number;
  balanceDebit: number;
  balanceCredit: number;
  balanceEquilibree: boolean;
}

export interface AccountDetail {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  solde: number;
}

export async function checkClosureStatus(
  companyId: string,
  fiscalYear: number
): Promise<ClosureStatus> {
  const controls: ClosureControl[] = [];

  const { data: lockedEntries } = await supabase
    .from('accounting_entries')
    .select('id')
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .eq('locked', true);

  const lockedCount = lockedEntries?.length || 0;

  if (lockedCount === 0) {
    controls.push({
      id: 'locked_entries',
      label: 'Écritures verrouillées',
      status: 'error',
      count: 0,
      details: 'Aucune écriture verrouillée pour cet exercice'
    });
  } else {
    controls.push({
      id: 'locked_entries',
      label: 'Écritures verrouillées',
      status: 'ok',
      count: lockedCount,
      details: `${lockedCount} écriture(s) verrouillée(s)`
    });
  }

  const { data: unlockedEntries } = await supabase
    .from('accounting_entries')
    .select('id')
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .eq('locked', false);

  const unlockedCount = unlockedEntries?.length || 0;

  if (unlockedCount > 0) {
    controls.push({
      id: 'unlocked_entries',
      label: 'Écritures en brouillon',
      status: 'warning',
      count: unlockedCount,
      details: `${unlockedCount} écriture(s) non verrouillée(s)`
    });
  } else {
    controls.push({
      id: 'unlocked_entries',
      label: 'Écritures en brouillon',
      status: 'ok',
      count: 0,
      details: 'Toutes les écritures sont verrouillées'
    });
  }

  const balanceCheck = await checkBalanceEquilibree(companyId, fiscalYear);
  controls.push({
    id: 'balance',
    label: 'Balance équilibrée',
    status: balanceCheck.equilibree ? 'ok' : 'error',
    details: balanceCheck.equilibree
      ? `Débit = Crédit (${balanceCheck.totalDebit.toFixed(2)} €)`
      : `Débit (${balanceCheck.totalDebit.toFixed(2)} €) ≠ Crédit (${balanceCheck.totalCredit.toFixed(2)} €)`
  });

  try {
    const vatComparison = await compareVat(companyId, fiscalYear);
    const vatCoherent = vatComparison.coherent;

    controls.push({
      id: 'vat_coherence',
      label: 'Cohérence TVA gestion ↔ comptabilité',
      status: vatCoherent ? 'ok' : 'warning',
      details: vatCoherent
        ? 'TVA gestion et comptable cohérentes'
        : `Écarts détectés (Collectée: ${vatComparison.ecartCollectee.toFixed(2)} €, Déductible: ${vatComparison.ecartDeductible.toFixed(2)} €)`
    });
  } catch (error) {
    controls.push({
      id: 'vat_coherence',
      label: 'Cohérence TVA gestion ↔ comptabilité',
      status: 'warning',
      details: 'Impossible de vérifier la cohérence TVA'
    });
  }

  const journalCheck = await checkJournalsUsage(companyId, fiscalYear);
  controls.push(journalCheck);

  const hasError = controls.some(c => c.status === 'error');
  const hasWarning = controls.some(c => c.status === 'warning');
  const overall: ControlStatus = hasError ? 'error' : hasWarning ? 'warning' : 'ok';

  return {
    overall,
    controls
  };
}

async function checkBalanceEquilibree(
  companyId: string,
  fiscalYear: number
): Promise<{ equilibree: boolean; totalDebit: number; totalCredit: number }> {
  const { data: entries } = await supabase
    .from('accounting_entries')
    .select('id')
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .eq('locked', true);

  if (!entries || entries.length === 0) {
    return { equilibree: true, totalDebit: 0, totalCredit: 0 };
  }

  const entryIds = entries.map(e => e.id);

  const { data: lines } = await supabase
    .from('accounting_lines')
    .select('debit, credit')
    .in('entry_id', entryIds);

  if (!lines || lines.length === 0) {
    return { equilibree: true, totalDebit: 0, totalCredit: 0 };
  }

  const totalDebit = lines.reduce((sum, line) => sum + parseFloat(line.debit || '0'), 0);
  const totalCredit = lines.reduce((sum, line) => sum + parseFloat(line.credit || '0'), 0);

  const diff = Math.abs(totalDebit - totalCredit);
  const equilibree = diff < 0.01;

  return {
    equilibree,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100
  };
}

async function checkJournalsUsage(
  companyId: string,
  fiscalYear: number
): Promise<ClosureControl> {
  const { data: journals } = await supabase
    .from('journals')
    .select('id, code, name')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (!journals || journals.length === 0) {
    return {
      id: 'journals',
      label: 'Journaux utilisés',
      status: 'warning',
      details: 'Aucun journal défini'
    };
  }

  const { data: entries } = await supabase
    .from('accounting_entries')
    .select('journal_id')
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .eq('locked', true);

  const usedJournalIds = new Set((entries || []).map(e => e.journal_id));
  const usedJournals = journals.filter(j => usedJournalIds.has(j.id));

  return {
    id: 'journals',
    label: 'Journaux utilisés',
    status: usedJournals.length > 0 ? 'ok' : 'warning',
    count: usedJournals.length,
    details: `${usedJournals.length} journal(aux) utilisé(s): ${usedJournals.map(j => j.code).join(', ')}`
  };
}

export async function getAccountingStatements(
  companyId: string,
  fiscalYear: number
): Promise<AccountingStatement> {
  const { data: entries } = await supabase
    .from('accounting_entries')
    .select('id')
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .eq('locked', true);

  if (!entries || entries.length === 0) {
    return {
      totalProduits: 0,
      totalCharges: 0,
      resultat: 0,
      totalActif: 0,
      totalPassif: 0,
      balanceDebit: 0,
      balanceCredit: 0,
      balanceEquilibree: true
    };
  }

  const entryIds = entries.map(e => e.id);

  const { data: lines } = await supabase
    .from('accounting_lines')
    .select(`
      debit,
      credit,
      chart_of_accounts!inner(code, name, type)
    `)
    .in('entry_id', entryIds);

  if (!lines || lines.length === 0) {
    return {
      totalProduits: 0,
      totalCharges: 0,
      resultat: 0,
      totalActif: 0,
      totalPassif: 0,
      balanceDebit: 0,
      balanceCredit: 0,
      balanceEquilibree: true
    };
  }

  const accountMap = new Map<string, AccountDetail>();

  lines.forEach((line: any) => {
    const account = line.chart_of_accounts;
    if (!account) return;

    const debit = parseFloat(line.debit || '0');
    const credit = parseFloat(line.credit || '0');

    if (!accountMap.has(account.code)) {
      accountMap.set(account.code, {
        code: account.code,
        name: account.name,
        type: account.type,
        debit: 0,
        credit: 0,
        solde: 0
      });
    }

    const detail = accountMap.get(account.code)!;
    detail.debit += debit;
    detail.credit += credit;
  });

  let totalProduits = 0;
  let totalCharges = 0;
  let totalActif = 0;
  let totalPassif = 0;
  let balanceDebit = 0;
  let balanceCredit = 0;

  accountMap.forEach(detail => {
    detail.solde = detail.debit - detail.credit;

    balanceDebit += detail.debit;
    balanceCredit += detail.credit;

    if (detail.type === 'produit') {
      totalProduits += detail.credit;
    } else if (detail.type === 'charge') {
      totalCharges += detail.debit;
    } else if (detail.type === 'actif') {
      if (detail.solde > 0) {
        totalActif += detail.solde;
      }
    } else if (detail.type === 'passif') {
      if (detail.solde < 0) {
        totalPassif += Math.abs(detail.solde);
      }
    }
  });

  const resultat = totalProduits - totalCharges;
  const balanceEquilibree = Math.abs(balanceDebit - balanceCredit) < 0.01;

  return {
    totalProduits: Math.round(totalProduits * 100) / 100,
    totalCharges: Math.round(totalCharges * 100) / 100,
    resultat: Math.round(resultat * 100) / 100,
    totalActif: Math.round(totalActif * 100) / 100,
    totalPassif: Math.round(totalPassif * 100) / 100,
    balanceDebit: Math.round(balanceDebit * 100) / 100,
    balanceCredit: Math.round(balanceCredit * 100) / 100,
    balanceEquilibree
  };
}

export async function getAccountDetailsForStatements(
  companyId: string,
  fiscalYear: number,
  accountType?: 'produit' | 'charge' | 'actif' | 'passif'
): Promise<AccountDetail[]> {
  const { data: entries } = await supabase
    .from('accounting_entries')
    .select('id')
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .eq('locked', true);

  if (!entries || entries.length === 0) {
    return [];
  }

  const entryIds = entries.map(e => e.id);

  const { data: lines } = await supabase
    .from('accounting_lines')
    .select(`
      debit,
      credit,
      chart_of_accounts!inner(code, name, type)
    `)
    .in('entry_id', entryIds);

  if (!lines || lines.length === 0) {
    return [];
  }

  const accountMap = new Map<string, AccountDetail>();

  lines.forEach((line: any) => {
    const account = line.chart_of_accounts;
    if (!account) return;

    if (accountType && account.type !== accountType) return;

    const debit = parseFloat(line.debit || '0');
    const credit = parseFloat(line.credit || '0');

    if (!accountMap.has(account.code)) {
      accountMap.set(account.code, {
        code: account.code,
        name: account.name,
        type: account.type,
        debit: 0,
        credit: 0,
        solde: 0
      });
    }

    const detail = accountMap.get(account.code)!;
    detail.debit += debit;
    detail.credit += credit;
  });

  const details = Array.from(accountMap.values());
  details.forEach(detail => {
    detail.debit = Math.round(detail.debit * 100) / 100;
    detail.credit = Math.round(detail.credit * 100) / 100;
    detail.solde = Math.round((detail.debit - detail.credit) * 100) / 100;
  });

  return details.sort((a, b) => a.code.localeCompare(b.code));
}
