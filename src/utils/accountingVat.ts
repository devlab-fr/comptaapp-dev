import { supabase } from '../lib/supabase';

export interface AccountingVatData {
  tvaCollectee: number;
  tvaDeductible: number;
  soldeTVA: number;
}

export interface ManagementVatData {
  tvaCollectee: number;
  tvaDeductible: number;
  soldeTVA: number;
}

export interface VatComparison {
  accounting: AccountingVatData;
  management: ManagementVatData;
  ecartCollectee: number;
  ecartDeductible: number;
  ecartSolde: number;
  coherent: boolean;
}

export interface VatAccountDetail {
  accountId: string;
  code: string;
  name: string;
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

async function getVatAccountCodes(companyId: string): Promise<{ collecteePrefix: string; deductiblePrefix: string }> {
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('code')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (!accounts || accounts.length === 0) {
    return { collecteePrefix: '4457', deductiblePrefix: '4456' };
  }

  const has44571 = accounts.some(a => a.code.startsWith('44571'));
  const has44566 = accounts.some(a => a.code.startsWith('44566'));

  return {
    collecteePrefix: has44571 ? '44571' : '4457',
    deductiblePrefix: has44566 ? '44566' : '4456'
  };
}

export async function calculateAccountingVat(
  companyId: string,
  fiscalYear: number
): Promise<AccountingVatData> {
  try {
    const { collecteePrefix, deductiblePrefix } = await getVatAccountCodes(companyId);

    const { data: entries } = await supabase
      .from('accounting_entries')
      .select('id')
      .eq('company_id', companyId)
      .eq('fiscal_year', fiscalYear)
      .eq('locked', true);

    if (!entries || entries.length === 0) {
      return {
        tvaCollectee: 0,
        tvaDeductible: 0,
        soldeTVA: 0
      };
    }

    const entryIds = entries.map(e => e.id);

    const { data: lines } = await supabase
      .from('accounting_lines')
      .select(`
        debit,
        credit,
        chart_of_accounts!inner(code)
      `)
      .in('entry_id', entryIds);

    if (!lines || lines.length === 0) {
      return {
        tvaCollectee: 0,
        tvaDeductible: 0,
        soldeTVA: 0
      };
    }

    let tvaCollectee = 0;
    let tvaDeductible = 0;

    lines.forEach((line: any) => {
      const code = line.chart_of_accounts?.code || '';
      const debit = parseFloat(line.debit || '0');
      const credit = parseFloat(line.credit || '0');

      if (code.startsWith(collecteePrefix)) {
        tvaCollectee += (credit - debit);
      } else if (code.startsWith(deductiblePrefix)) {
        tvaDeductible += (debit - credit);
      }
    });

    const soldeTVA = tvaCollectee - tvaDeductible;

    return {
      tvaCollectee: Math.round(tvaCollectee * 100) / 100,
      tvaDeductible: Math.round(tvaDeductible * 100) / 100,
      soldeTVA: Math.round(soldeTVA * 100) / 100
    };
  } catch (error) {
    console.error('Error calculating accounting VAT:', error);
    return {
      tvaCollectee: 0,
      tvaDeductible: 0,
      soldeTVA: 0
    };
  }
}

export async function calculateManagementVat(
  companyId: string,
  fiscalYear: number
): Promise<ManagementVatData> {
  try {
    const { data: expenseDocs } = await supabase
      .from('expense_documents')
      .select('total_vat')
      .eq('company_id', companyId)
      .eq('accounting_status', 'validated')
      .eq('payment_status', 'paid')
      .eq('is_test', false)
      .gte('invoice_date', `${fiscalYear}-01-01`)
      .lte('invoice_date', `${fiscalYear}-12-31`);

    const { data: revenueDocs } = await supabase
      .from('revenue_documents')
      .select('total_vat')
      .eq('company_id', companyId)
      .eq('accounting_status', 'validated')
      .eq('payment_status', 'paid')
      .eq('is_test', false)
      .gte('invoice_date', `${fiscalYear}-01-01`)
      .lte('invoice_date', `${fiscalYear}-12-31`);

    const tvaDeductible = (expenseDocs || []).reduce((sum, doc) => {
      return sum + parseFloat(doc.total_vat || '0');
    }, 0);

    const tvaCollectee = (revenueDocs || []).reduce((sum, doc) => {
      return sum + parseFloat(doc.total_vat || '0');
    }, 0);

    const soldeTVA = tvaCollectee - tvaDeductible;

    return {
      tvaCollectee: Math.round(tvaCollectee * 100) / 100,
      tvaDeductible: Math.round(tvaDeductible * 100) / 100,
      soldeTVA: Math.round(soldeTVA * 100) / 100
    };
  } catch (error) {
    console.error('Error calculating management VAT:', error);
    return {
      tvaCollectee: 0,
      tvaDeductible: 0,
      soldeTVA: 0
    };
  }
}

export async function compareVat(
  companyId: string,
  fiscalYear: number
): Promise<VatComparison> {
  const [accounting, management] = await Promise.all([
    calculateAccountingVat(companyId, fiscalYear),
    calculateManagementVat(companyId, fiscalYear)
  ]);

  const ecartCollectee = Math.round((accounting.tvaCollectee - management.tvaCollectee) * 100) / 100;
  const ecartDeductible = Math.round((accounting.tvaDeductible - management.tvaDeductible) * 100) / 100;
  const ecartSolde = Math.round((accounting.soldeTVA - management.soldeTVA) * 100) / 100;

  const coherent = Math.abs(ecartCollectee) < 0.01 && Math.abs(ecartDeductible) < 0.01;

  return {
    accounting,
    management,
    ecartCollectee,
    ecartDeductible,
    ecartSolde,
    coherent
  };
}

export async function getVatAccountDetails(
  companyId: string,
  fiscalYear: number
): Promise<VatAccountDetail[]> {
  try {
    const { collecteePrefix, deductiblePrefix } = await getVatAccountCodes(companyId);

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
        chart_of_accounts!inner(id, code, name)
      `)
      .in('entry_id', entryIds);

    if (!lines || lines.length === 0) {
      return [];
    }

    const accountMap = new Map<string, VatAccountDetail>();

    lines.forEach((line: any) => {
      const account = line.chart_of_accounts;
      if (!account) return;

      const code = account.code || '';
      if (!code.startsWith(collecteePrefix) && !code.startsWith(deductiblePrefix)) {
        return;
      }

      const debit = parseFloat(line.debit || '0');
      const credit = parseFloat(line.credit || '0');

      if (!accountMap.has(account.id)) {
        accountMap.set(account.id, {
          accountId: account.id,
          code: code,
          name: account.name,
          totalDebit: 0,
          totalCredit: 0,
          solde: 0
        });
      }

      const detail = accountMap.get(account.id)!;
      detail.totalDebit += debit;
      detail.totalCredit += credit;
    });

    const details = Array.from(accountMap.values());
    details.forEach(detail => {
      detail.totalDebit = Math.round(detail.totalDebit * 100) / 100;
      detail.totalCredit = Math.round(detail.totalCredit * 100) / 100;
      detail.solde = Math.round((detail.totalCredit - detail.totalDebit) * 100) / 100;
    });

    return details.sort((a, b) => a.code.localeCompare(b.code));
  } catch (error) {
    console.error('Error getting VAT account details:', error);
    return [];
  }
}
