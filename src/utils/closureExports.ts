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

function toFECDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const datePart = dateStr.split('T')[0];
  const segments = datePart.split('-');
  if (segments.length !== 3) return '';
  return segments[0] + segments[1] + segments[2];
}

function toFECAmount(val: number | string | null | undefined): string {
  const n = parseFloat(String(val ?? '0'));
  if (isNaN(n)) return '0.00';
  return n.toFixed(2);
}

function sanitizeFEC(val: string | null | undefined): string {
  if (!val) return '';
  return val.replace(/\t/g, ' ').replace(/\r?\n/g, ' ').trim();
}

interface SourceDocInfo {
  pieceRef: string | null;
  pieceDate: string | null;
  compAuxNum: string;
  compAuxLib: string;
}

async function fetchSourceDocInfo(
  entryIds: string[]
): Promise<Map<string, SourceDocInfo>> {
  const result = new Map<string, SourceDocInfo>();

  const [expenseRes, revenueRes, expensePayRes, revenuePayRes] = await Promise.all([
    supabase
      .from('expense_documents')
      .select('linked_accounting_entry_id, invoice_date, document_number, third_party:third_parties(code, name)')
      .in('linked_accounting_entry_id', entryIds),
    supabase
      .from('revenue_documents')
      .select('linked_accounting_entry_id, invoice_date, document_number, source_type, source_invoice_id, third_party:third_parties(code, name), facture:factures(numero_facture, date_facture)')
      .in('linked_accounting_entry_id', entryIds),
    supabase
      .from('expense_documents')
      .select('payment_entry_id, paid_at, document_number, third_party:third_parties(code, name)')
      .in('payment_entry_id', entryIds),
    supabase
      .from('revenue_documents')
      .select('payment_entry_id, paid_at, document_number, source_type, third_party:third_parties(code, name), facture:factures(numero_facture)')
      .in('payment_entry_id', entryIds),
  ]);

  for (const ed of (expenseRes.data ?? [])) {
    const eid = ed.linked_accounting_entry_id;
    if (!eid) continue;
    const tp = (ed as any).third_party as any;
    result.set(eid, {
      pieceRef: (ed as any).document_number ?? null,
      pieceDate: (ed as any).invoice_date ?? null,
      compAuxNum: tp?.code ? sanitizeFEC(tp.code) : '',
      compAuxLib: tp?.name ? sanitizeFEC(tp.name) : '',
    });
  }

  for (const rd of (revenueRes.data ?? [])) {
    const eid = rd.linked_accounting_entry_id;
    if (!eid) continue;
    const facture = (rd as any).facture as any;
    const isFromInvoice = rd.source_type === 'invoice' && facture;
    const tp = (!isFromInvoice) ? ((rd as any).third_party as any) : null;
    result.set(eid, {
      pieceRef: isFromInvoice
        ? (facture.numero_facture ?? null)
        : ((rd as any).document_number ?? null),
      pieceDate: isFromInvoice
        ? (facture.date_facture ?? (rd as any).invoice_date ?? null)
        : ((rd as any).invoice_date ?? null),
      compAuxNum: tp?.code ? sanitizeFEC(tp.code) : '',
      compAuxLib: tp?.name ? sanitizeFEC(tp.name) : '',
    });
  }

  for (const edp of (expensePayRes.data ?? [])) {
    const eid = edp.payment_entry_id;
    if (!eid) continue;
    if (!result.has(eid)) {
      const tp = (edp as any).third_party as any;
      result.set(eid, {
        pieceRef: (edp as any).document_number ?? null,
        pieceDate: (edp as any).paid_at ?? null,
        compAuxNum: tp?.code ? sanitizeFEC(tp.code) : '',
        compAuxLib: tp?.name ? sanitizeFEC(tp.name) : '',
      });
    }
  }

  for (const rdp of (revenuePayRes.data ?? [])) {
    const eid = rdp.payment_entry_id;
    if (!eid) continue;
    if (!result.has(eid)) {
      const rdpFacure = (rdp as any).facture as any;
      const rdpIsInvoice = (rdp as any).source_type === 'invoice' && rdpFacure;
      const tp = (!rdpIsInvoice) ? ((rdp as any).third_party as any) : null;
      result.set(eid, {
        pieceRef: rdpIsInvoice
          ? (rdpFacure.numero_facture ?? null)
          : ((rdp as any).document_number ?? null),
        pieceDate: (rdp as any).paid_at ?? null,
        compAuxNum: tp?.code ? sanitizeFEC(tp.code) : '',
        compAuxLib: tp?.name ? sanitizeFEC(tp.name) : '',
      });
    }
  }

  return result;
}

export async function exportFEC(
  companyId: string,
  fiscalYear: number
): Promise<void> {
  const { data: entries, error: entriesError } = await supabase
    .from('accounting_entries')
    .select(`
      id,
      entry_number,
      entry_date,
      description,
      is_locked,
      locked_at,
      journal:journals(code, name)
    `)
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .eq('is_locked', true)
    .not('locked_at', 'is', null)
    .order('entry_date', { ascending: true })
    .order('entry_number', { ascending: true });

  if (entriesError || !entries || entries.length === 0) {
    alert('Aucune écriture comptable pour cet exercice.');
    return;
  }

  const entryIds = entries.map((e: any) => e.id);

  const [linesResult, sourceDocMap] = await Promise.all([
    supabase
      .from('accounting_lines')
      .select(`
        id,
        entry_id,
        label,
        debit,
        credit,
        line_order,
        account:chart_of_accounts!inner(code, name)
      `)
      .in('entry_id', entryIds)
      .order('line_order', { ascending: true }),
    fetchSourceDocInfo(entryIds),
  ]);

  const { data: lines, error: linesError } = linesResult;

  if (linesError || !lines || lines.length === 0) {
    alert("Aucune ligne d'écriture à exporter.");
    return;
  }

  const linesByEntry = new Map<string, any[]>();
  for (const line of lines) {
    if (!linesByEntry.has(line.entry_id)) {
      linesByEntry.set(line.entry_id, []);
    }
    linesByEntry.get(line.entry_id)!.push(line);
  }

  const FEC_HEADER = [
    'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
    'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
    'PieceRef', 'PieceDate', 'EcritureLib',
    'Debit', 'Credit',
    'EcritureLet', 'DateLet', 'ValidDate',
    'Montantdevise', 'Idevise'
  ].join('\t');

  const sortedEntries = (entries as any[]).slice().sort((a, b) => {
    const jA = (a.journal?.code ?? '').localeCompare(b.journal?.code ?? '');
    if (jA !== 0) return jA;
    const dA = (a.entry_date ?? '').localeCompare(b.entry_date ?? '');
    if (dA !== 0) return dA;
    return (a.entry_number ?? '').localeCompare(b.entry_number ?? '');
  });

  const rows: string[] = [FEC_HEADER];

  for (const entry of sortedEntries) {
    const journal = entry.journal as any;
    const journalCode = sanitizeFEC(journal?.code ?? '');
    const journalLib = sanitizeFEC(journal?.name ?? '');
    const ecritureNum = sanitizeFEC(entry.entry_number ?? '');
    const ecritureDate = toFECDate(entry.entry_date);

    const sourceDoc = sourceDocMap.get(entry.id);
    const pieceRef = sanitizeFEC(sourceDoc?.pieceRef ?? ecritureNum);
    const pieceDate = sourceDoc?.pieceDate
      ? toFECDate(sourceDoc.pieceDate)
      : ecritureDate;

    const validDate = (entry.is_locked && entry.locked_at)
      ? toFECDate(entry.locked_at)
      : '';

    const entryLines = linesByEntry.get(entry.id) ?? [];
    for (const line of entryLines) {
      const account = line.account as any;

      const compteNum = sanitizeFEC(account?.code ?? '');
      const compteLib = sanitizeFEC(account?.name ?? '');
      const compAuxNum = sourceDoc?.compAuxNum ?? '';
      const compAuxLib = sourceDoc?.compAuxLib ?? '';
      const ecritureLib = sanitizeFEC(line.label ?? '');
      const debit = toFECAmount(line.debit);
      const credit = toFECAmount(line.credit);

      const row = [
        journalCode, journalLib, ecritureNum, ecritureDate,
        compteNum, compteLib, compAuxNum, compAuxLib,
        pieceRef, pieceDate, ecritureLib,
        debit, credit,
        '', '', validDate,
        '', 'EUR'
      ].join('\t');

      rows.push(row);
    }
  }

  const content = rows.join('\r\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });

  const { data: companyData } = await supabase
    .from('companies')
    .select('siren, siret, fiscal_year_end')
    .eq('id', companyId)
    .maybeSingle();

  const siren = companyData?.siren?.trim() ?? '';
  const siret = companyData?.siret?.trim() ?? '';
  const identifier =
    siren.length > 0
      ? siren
      : siret.length >= 9
      ? siret.slice(0, 9)
      : companyId.slice(0, 8);

  const fyEnd = companyData?.fiscal_year_end;
  const dateStr = fyEnd
    ? fyEnd.replace(/-/g, '').slice(0, 8)
    : `${fiscalYear}1231`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${identifier}FEC${dateStr}.txt`;
  link.click();
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
