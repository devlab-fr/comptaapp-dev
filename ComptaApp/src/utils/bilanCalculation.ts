import { supabase } from '../lib/supabase';

export interface BilanCalculation {
  actif: {
    tresorerie: number;
    creancesClients: number;
    autresActifs: number;
    total: number;
  };
  passif: {
    resultatExercice: number;
    dettesFiscales: number;
    dettesFournisseurs: number;
    total: number;
  };
  equilibre: boolean;
}

export async function calculateBilan(
  companyId: string,
  selectedYear: number
): Promise<BilanCalculation> {
  const { data: expenseDocs } = await supabase
    .from('expense_documents')
    .select('id, invoice_date, total_incl_vat, total_vat')
    .eq('company_id', companyId)
    .eq('accounting_status', 'validated')
    .eq('payment_status', 'paid')
    .eq('is_test', false);

  const { data: revenueDocs } = await supabase
    .from('revenue_documents')
    .select('id, invoice_date, total_incl_vat, total_vat')
    .eq('company_id', companyId)
    .eq('accounting_status', 'validated')
    .eq('payment_status', 'paid')
    .eq('is_test', false);

  const expenseDocsInYear = expenseDocs?.filter((doc) => {
    const year = new Date(doc.invoice_date).getFullYear();
    return year === selectedYear;
  }) || [];

  const revenueDocsInYear = revenueDocs?.filter((doc) => {
    const year = new Date(doc.invoice_date).getFullYear();
    return year === selectedYear;
  }) || [];

  let totalEncaissementsTTC = 0;
  let totalDecaissementsTTC = 0;
  let tvaCollectee = 0;
  let tvaDeductible = 0;
  let produitsHT = 0;
  let chargesHT = 0;

  revenueDocsInYear.forEach((doc) => {
    totalEncaissementsTTC += Number(doc.total_incl_vat);
    tvaCollectee += Number(doc.total_vat);
  });

  expenseDocsInYear.forEach((doc) => {
    totalDecaissementsTTC += Number(doc.total_incl_vat);
    tvaDeductible += Number(doc.total_vat);
  });

  if (revenueDocsInYear.length > 0) {
    const { data: revenueLines } = await supabase
      .from('revenue_lines')
      .select('amount_excl_vat')
      .in('document_id', revenueDocsInYear.map(d => d.id));

    if (revenueLines) {
      produitsHT = revenueLines.reduce((sum, line) => sum + Number(line.amount_excl_vat), 0);
    }
  }

  if (expenseDocsInYear.length > 0) {
    const { data: expenseLines } = await supabase
      .from('expense_lines')
      .select('amount_excl_vat')
      .in('document_id', expenseDocsInYear.map(d => d.id));

    if (expenseLines) {
      chargesHT = expenseLines.reduce((sum, line) => sum + Number(line.amount_excl_vat), 0);
    }
  }

  const { data: openingData } = await supabase
    .from('opening_entries')
    .select('*')
    .eq('company_id', companyId)
    .eq('year', selectedYear)
    .maybeSingle();

  let openingTresorerie = 0;
  let openingCreances = 0;
  let openingDettes = 0;
  let openingTVA = 0;

  if (openingData) {
    openingTresorerie = Number(openingData.tresorerie) || 0;
    openingCreances = Number(openingData.creances_clients) || 0;
    openingDettes = Number(openingData.dettes_fournisseurs) || 0;
    const tvaSolde = Number(openingData.tva_solde) || 0;
    openingTVA = openingData.tva_sens === 'payer' ? tvaSolde : -tvaSolde;
  }

  const { data: catchupData } = await supabase
    .from('catchup_totals')
    .select('*')
    .eq('company_id', companyId)
    .eq('year', selectedYear);

  let catchupProduitsHT = 0;
  let catchupChargesHT = 0;
  let catchupTVACollectee = 0;
  let catchupTVADeductible = 0;

  if (catchupData) {
    catchupData.forEach((row) => {
      const ht = Number(row.total_ht) || 0;
      const tva = Number(row.total_tva) || 0;

      if (row.category_type === 'revenue') {
        catchupProduitsHT += ht;
        catchupTVACollectee += tva;
      } else if (row.category_type === 'expense') {
        catchupChargesHT += ht;
        catchupTVADeductible += tva;
      }
    });
  }

  const tresorerie = totalEncaissementsTTC - totalDecaissementsTTC + openingTresorerie;
  const resultatHT = (produitsHT + catchupProduitsHT) - (chargesHT + catchupChargesHT);
  const tvaNette = (tvaCollectee + catchupTVACollectee) - (tvaDeductible + catchupTVADeductible) + openingTVA;

  const actifTotal = tresorerie + openingCreances;
  const passifTotal = resultatHT + tvaNette + openingDettes;

  const equilibre = Math.abs(actifTotal - passifTotal) < 0.01;

  return {
    actif: {
      tresorerie: Math.round(tresorerie * 100) / 100,
      creancesClients: Math.round(openingCreances * 100) / 100,
      autresActifs: 0,
      total: Math.round(actifTotal * 100) / 100,
    },
    passif: {
      resultatExercice: Math.round(resultatHT * 100) / 100,
      dettesFiscales: Math.round(tvaNette * 100) / 100,
      dettesFournisseurs: Math.round(openingDettes * 100) / 100,
      total: Math.round(passifTotal * 100) / 100,
    },
    equilibre,
  };
}
