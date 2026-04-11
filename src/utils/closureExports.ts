import { supabase } from '../lib/supabase';
import { getVatAccountDetails } from './accountingVat';

export interface ExportFilters {
  startDate?: string;
  endDate?: string;
  journalId?: string;
}

export async function exportFECLike(
  companyId: string,
  fiscalYear: number,
  filters?: ExportFilters
): Promise<void> {
  let query = supabase
    .from('accounting_entries')
    .select(`
      id,
      entry_number,
      entry_date,
      description,
      journal:journals(code, name)
    `)
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .eq('is_locked', true);

  if (filters?.startDate) {
    query = query.gte('entry_date', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('entry_date', filters.endDate);
  }
  if (filters?.journalId) {
    query = query.eq('journal_id', filters.journalId);
  }

  query = query.order('entry_date', { ascending: true });

  const { data: entries } = await query;

  if (!entries || entries.length === 0) {
    alert('Aucune écriture verrouillée à exporter pour cet exercice.');
    return;
  }

  const entryIds = entries.map(e => e.id);

  const { data: lines } = await supabase
    .from('accounting_lines')
    .select(`
      entry_id,
      label,
      debit,
      credit,
      chart_of_accounts!inner(code, name)
    `)
    .in('entry_id', entryIds);

  if (!lines || lines.length === 0) {
    alert('Aucune ligne d\'écriture à exporter.');
    return;
  }

  const csvLines = ['Date;Journal;Numéro;Libellé écriture;Compte;Libellé compte;Débit;Crédit'];

  entries.forEach((entry: any) => {
    const entryLines = lines.filter((line: any) => line.entry_id === entry.id);

    entryLines.forEach((line: any) => {
      const row = [
        entry.entry_date,
        entry.journal?.code || '',
        entry.entry_number,
        entry.description.replace(/;/g, ','),
        line.chart_of_accounts.code,
        line.chart_of_accounts.name.replace(/;/g, ','),
        parseFloat(line.debit || '0').toFixed(2),
        parseFloat(line.credit || '0').toFixed(2)
      ];
      csvLines.push(row.join(';'));
    });
  });

  const csv = csvLines.join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);

  let filename = `export_cabinet_${fiscalYear}`;
  if (filters?.journalId) {
    filename += '_filtered';
  }
  if (filters?.startDate || filters?.endDate) {
    filename += '_period';
  }
  filename += '.csv';

  link.download = filename;
  link.click();
}

export async function exportByPeriod(
  companyId: string,
  fiscalYear: number,
  startDate: string,
  endDate: string
): Promise<void> {
  await exportFECLike(companyId, fiscalYear, { startDate, endDate });
}

export async function exportByJournal(
  companyId: string,
  fiscalYear: number,
  journalId: string
): Promise<void> {
  await exportFECLike(companyId, fiscalYear, { journalId });
}

export async function exportBalance(companyId: string, fiscalYear: number): Promise<void> {
  const { data: entries } = await supabase
    .from('accounting_entries')
    .select('id')
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .eq('is_locked', true);

  if (!entries || entries.length === 0) {
    alert('Aucune écriture verrouillée à exporter pour cet exercice.');
    return;
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
    alert('Aucune ligne à exporter.');
    return;
  }

  const accountMap = new Map<string, any>();

  lines.forEach((line: any) => {
    const account = line.chart_of_accounts;
    if (!account) return;

    if (!accountMap.has(account.code)) {
      accountMap.set(account.code, {
        code: account.code,
        name: account.name,
        type: account.type,
        debit: 0,
        credit: 0
      });
    }

    const detail = accountMap.get(account.code)!;
    detail.debit += parseFloat(line.debit || '0');
    detail.credit += parseFloat(line.credit || '0');
  });

  const csvLines = ['Compte;Libellé;Type;Débit;Crédit;Solde Débiteur;Solde Créditeur'];

  const accounts = Array.from(accountMap.values()).sort((a, b) => a.code.localeCompare(b.code));

  accounts.forEach(account => {
    const solde = account.debit - account.credit;
    const soldeDebit = solde > 0 ? solde : 0;
    const soldeCredit = solde < 0 ? Math.abs(solde) : 0;

    const row = [
      account.code,
      account.name.replace(/;/g, ','),
      account.type,
      account.debit.toFixed(2),
      account.credit.toFixed(2),
      soldeDebit.toFixed(2),
      soldeCredit.toFixed(2)
    ];
    csvLines.push(row.join(';'));
  });

  const totalDebit = accounts.reduce((sum, a) => sum + a.debit, 0);
  const totalCredit = accounts.reduce((sum, a) => sum + a.credit, 0);

  csvLines.push('');
  csvLines.push(`Total;-;-;${totalDebit.toFixed(2)};${totalCredit.toFixed(2)};-;-`);

  const csv = csvLines.join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `balance_${fiscalYear}.csv`;
  link.click();
}

export async function exportVATComptable(companyId: string, fiscalYear: number): Promise<void> {
  const details = await getVatAccountDetails(companyId, fiscalYear);

  if (!details || details.length === 0) {
    alert('Aucun compte TVA à exporter pour cet exercice.');
    return;
  }

  const csvLines = ['Compte;Libellé;Débit;Crédit;Solde'];

  details.forEach(detail => {
    const row = [
      detail.code,
      detail.name.replace(/;/g, ','),
      detail.totalDebit.toFixed(2),
      detail.totalCredit.toFixed(2),
      detail.solde.toFixed(2)
    ];
    csvLines.push(row.join(';'));
  });

  const totalDebit = details.reduce((sum, d) => sum + d.totalDebit, 0);
  const totalCredit = details.reduce((sum, d) => sum + d.totalCredit, 0);
  const totalSolde = details.reduce((sum, d) => sum + d.solde, 0);

  csvLines.push('');
  csvLines.push(`Total;-;${totalDebit.toFixed(2)};${totalCredit.toFixed(2)};${totalSolde.toFixed(2)}`);

  const csv = csvLines.join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `tva_comptable_${fiscalYear}.csv`;
  link.click();
}
