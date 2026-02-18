import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import BackButton from '../components/BackButton';
import Toast from '../components/Toast';
import AIAssistant from '../components/AIAssistant';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { downloadCSV, generateCSVContentExcelFR, formatCurrencyExcelFR, formatTodayDate } from '../utils/csvExport';
import { buildPdfHeader, buildPdfFooter, buildPdfStyles, formatGeneratedDate, buildFiscalYearLabel, generateDocumentId, buildVatBalanceSection, buildVatRegime } from '../utils/pdfTemplate';
import { savePdfToStorage } from '../utils/pdfArchive';
import { useEntitlements } from '../billing/useEntitlements';
import { hasFeature, getFeatureBlockedMessage, convertEntitlementsPlanToTier } from '../billing/planRules';

interface TVAData {
  tvaCollectee: number;
  tvaDeductible: number;
  soldeTVA: number;
}

interface MonthlyTVA {
  month: number;
  tvaCollectee: number;
  tvaDeductible: number;
  soldeTVA: number;
  status: 'open' | 'declared';
  periodId?: string;
  declaredAt?: string | null;
  declaredBy?: string | null;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

export default function ViewTVAPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const entitlements = useEntitlements();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [tvaData, setTvaData] = useState<TVAData>({
    tvaCollectee: 0,
    tvaDeductible: 0,
    soldeTVA: 0,
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyTVA[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyData, setCompanyData] = useState<{
    name: string;
    legal_form?: string;
    siren?: string;
    siret?: string;
    address?: string;
    vat_regime?: string;
    fiscal_year_start?: string;
    fiscal_year_end?: string;
  } | null>(null);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type });
  };

  const closeToast = () => {
    setToast({ show: false, message: '', type: 'success' });
  };

  const getYearFromPeriod = (period: any): number | null => {
    if (period.year !== undefined && period.year !== null) {
      return period.year;
    }
    if (period.period_year !== undefined && period.period_year !== null) {
      return period.period_year;
    }

    const dateFields = ['period_start', 'start_date', 'from_date', 'date', 'created_at'];
    for (const field of dateFields) {
      if (period[field]) {
        try {
          const year = new Date(period[field]).getFullYear();
          if (year >= 1900 && year <= 2100) {
            return year;
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  };

  const getMonthFromPeriod = (period: any): number | null => {
    if (period.month !== undefined && period.month !== null) {
      return period.month;
    }
    if (period.period_month !== undefined && period.period_month !== null) {
      return period.period_month;
    }

    const dateFields = ['period_start', 'start_date', 'from_date', 'date', 'created_at'];
    for (const field of dateFields) {
      if (period[field]) {
        try {
          const month = new Date(period[field]).getMonth() + 1;
          if (month >= 1 && month <= 12) {
            return month;
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  };

  useEffect(() => {
    const loadCompanyData = async () => {
      if (!companyId) return;

      const { data } = await supabase
        .from('companies')
        .select('name, legal_form, siren, siret, address, vat_regime, fiscal_year_start, fiscal_year_end')
        .eq('id', companyId)
        .maybeSingle();

      if (data) {
        setCompanyName(data.name);
        setCompanyData(data);
      }
    };

    loadCompanyData();
  }, [companyId]);

  useEffect(() => {
    const loadAvailableYears = async () => {
      if (!companyId) return;

      const { data: expenseDocs } = await supabase
        .from('expense_documents')
        .select('invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('is_test', false);

      const { data: revenueDocs } = await supabase
        .from('revenue_documents')
        .select('invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('is_test', false);

      const years = new Set<number>();

      expenseDocs?.forEach((doc) => {
        const year = new Date(doc.invoice_date).getFullYear();
        years.add(year);
      });

      revenueDocs?.forEach((doc) => {
        const year = new Date(doc.invoice_date).getFullYear();
        years.add(year);
      });

      if (years.size === 0) {
        years.add(new Date().getFullYear());
      }

      const sortedYears = Array.from(years).sort((a, b) => b - a);
      setAvailableYears(sortedYears);

      const currentYear = new Date().getFullYear();
      if (sortedYears.length > 0 && !sortedYears.includes(currentYear)) {
        setSelectedYear(sortedYears[0]);
      } else if (sortedYears.includes(currentYear)) {
        setSelectedYear(currentYear);
      }
    };

    loadAvailableYears();
  }, [companyId]);

  useEffect(() => {
    const loadTVAData = async () => {
      if (!companyId) return;

      setLoading(true);

      const { data: expenseDocs } = await supabase
        .from('expense_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('is_test', false);

      const { data: revenueDocs } = await supabase
        .from('revenue_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('is_test', false);

      const expenseDocsInYear = expenseDocs?.filter((doc) => {
        const year = new Date(doc.invoice_date).getFullYear();
        return year === selectedYear;
      }) || [];

      const revenueDocsInYear = revenueDocs?.filter((doc) => {
        const year = new Date(doc.invoice_date).getFullYear();
        return year === selectedYear;
      }) || [];

      let tvaDeductible = 0;
      let tvaCollectee = 0;

      // Load opening entries (reprise d'ouverture)
      const { data: openingData } = await supabase
        .from('opening_entries')
        .select('*')
        .eq('company_id', companyId)
        .eq('year', selectedYear)
        .maybeSingle();

      let openingTVA = 0;
      if (openingData) {
        const tvaSolde = Number(openingData.tva_solde) || 0;
        // If payer: add to debt (positive), if credit: add to deductible (negative)
        openingTVA = openingData.tva_sens === 'payer' ? tvaSolde : -tvaSolde;
      }

      // Load catchup totals (rattrapage par totaux)
      const { data: catchupData } = await supabase
        .from('catchup_totals')
        .select('*')
        .eq('company_id', companyId)
        .eq('year', selectedYear);

      let catchupTVACollectee = 0;
      let catchupTVADeductible = 0;

      if (catchupData) {
        catchupData.forEach((row) => {
          const tva = Number(row.total_tva) || 0;
          if (row.category_type === 'revenue') {
            catchupTVACollectee += tva;
          } else if (row.category_type === 'expense') {
            catchupTVADeductible += tva;
          }
        });
      }

      const monthlyTVA: Record<number, MonthlyTVA> = {};
      for (let i = 1; i <= 12; i++) {
        monthlyTVA[i] = {
          month: i,
          tvaCollectee: 0,
          tvaDeductible: 0,
          soldeTVA: 0,
          status: 'open',
        };
      }

      if (expenseDocsInYear.length > 0) {
        const { data: expenseLines } = await supabase
          .from('expense_lines')
          .select('document_id, vat_amount')
          .in('document_id', expenseDocsInYear.map(d => d.id));

        expenseLines?.forEach(line => {
          const doc = expenseDocsInYear.find(d => d.id === line.document_id);
          if (doc) {
            const month = new Date(doc.invoice_date).getMonth() + 1;
            monthlyTVA[month].tvaDeductible += Number(line.vat_amount);
          }
          tvaDeductible += Number(line.vat_amount);
        });
      }

      if (revenueDocsInYear.length > 0) {
        const { data: revenueLines } = await supabase
          .from('revenue_lines')
          .select('document_id, vat_amount')
          .in('document_id', revenueDocsInYear.map(d => d.id));

        revenueLines?.forEach(line => {
          const doc = revenueDocsInYear.find(d => d.id === line.document_id);
          if (doc) {
            const month = new Date(doc.invoice_date).getMonth() + 1;
            monthlyTVA[month].tvaCollectee += Number(line.vat_amount);
          }
          tvaCollectee += Number(line.vat_amount);
        });
      }

      const { data: periodsIntrospect, error: introError } = await supabase
        .from('vat_periods')
        .select('*')
        .limit(1);

      const sample = periodsIntrospect?.[0];
      const keys = Object.keys(sample || {});

      if (introError) {
        console.error('VAT_PERIODS_INTROSPECTION_ERROR', introError);
        console.error('VAT_PERIODS_42703_TRACE', {
          error: introError,
          code: introError.code,
          message: introError.message,
          details: introError.details,
          hint: introError.hint,
          file: 'src/pages/ViewTVAPage.tsx',
          line: 'loadTVAData introspection',
        });
        showToast('Impossible de charger les périodes TVA', 'error');
        setLoading(false);
        return;
      }

      let periods: any[] = [];

      if (!sample) {
      } else {
        let q = supabase.from('vat_periods').select('*');

        if (keys.includes('company_id')) {
          q = q.eq('company_id', companyId);
        }
        if (keys.includes('period_type')) {
          q = q.eq('period_type', 'monthly');
        }

        const { data: periodsData, error: periodsError } = await q;

        if (periodsError) {
          console.error('VAT_PERIODS_LOAD_ERROR', periodsError);
          showToast('Impossible de charger les périodes TVA', 'error');
          setLoading(false);
          return;
        }

        periods = periodsData || [];
      }

      periods?.forEach(period => {
        const year = getYearFromPeriod(period);
        const month = getMonthFromPeriod(period);

        if (year === selectedYear && month && monthlyTVA[month]) {
          monthlyTVA[month].status = period.status as 'open' | 'declared';
          monthlyTVA[month].periodId = period.id;
          monthlyTVA[month].declaredAt = period.declared_at || null;
          monthlyTVA[month].declaredBy = period.declared_by || null;
        }
      });

      Object.values(monthlyTVA).forEach(month => {
        month.tvaCollectee = Math.round(month.tvaCollectee * 100) / 100;
        month.tvaDeductible = Math.round(month.tvaDeductible * 100) / 100;
        month.soldeTVA = Math.round((month.tvaCollectee - month.tvaDeductible) * 100) / 100;
      });

      setMonthlyData(Object.values(monthlyTVA));

      const totalTVACollectee = tvaCollectee + catchupTVACollectee;
      const totalTVADeductible = tvaDeductible + catchupTVADeductible;
      const totalSoldeTVA = totalTVACollectee - totalTVADeductible + openingTVA;

      setTvaData({
        tvaCollectee: Math.round(totalTVACollectee * 100) / 100,
        tvaDeductible: Math.round(totalTVADeductible * 100) / 100,
        soldeTVA: Math.round(totalSoldeTVA * 100) / 100,
      });

      setLoading(false);
    };

    loadTVAData();
  }, [companyId, selectedYear]);

  const markPeriodAsDeclared = async (month: number) => {
    if (!companyId) return;

    const monthNum = Number(month);
    const yearNum = Number(selectedYear);

    const today = new Date().toISOString().split('T')[0];
    const declaredDateInput = prompt(
      `Date de déclaration (format: YYYY-MM-DD)`,
      today
    );

    if (!declaredDateInput) {
      return;
    }

    let declaredAt: string;
    try {
      declaredAt = new Date(declaredDateInput).toISOString();
    } catch {
      showToast('Format de date invalide', 'error');
      return;
    }

    const existingPeriod = monthlyData.find(m => m.month === monthNum);

    if (existingPeriod?.periodId) {
      await supabase
        .from('vat_periods')
        .update({
          status: 'declared',
          declared_at: declaredAt,
          declared_by: (await supabase.auth.getUser()).data.user?.id || null,
        })
        .eq('id', existingPeriod.periodId);
    } else {
      if (!yearNum || !monthNum || isNaN(yearNum) || isNaN(monthNum)) {
        console.error('VAT_INSERT_VALIDATION_FAILED', 'year ou month manquants', {
          selectedYear,
          month,
          yearNum,
          monthNum,
          existingPeriod
        });
        showToast('Période invalide (year/month manquants)', 'error');
        return;
      }

      const currentUserId = (await supabase.auth.getUser()).data.user?.id || null;

      const candidate1 = {
        company_id: companyId,
        period_year: yearNum,
        period_month: monthNum,
        status: 'declared' as const,
        declared_at: declaredAt,
        declared_by: currentUserId,
      };

      const candidate2 = {
        period_year: yearNum,
        period_month: monthNum,
        status: 'declared' as const,
        declared_at: declaredAt,
        declared_by: currentUserId,
      };

      const { error: error1 } = await supabase
        .from('vat_periods')
        .insert(candidate1);

      if (error1) {
        const isColumnError = error1.code === '42703' ||
                             (error1.message && error1.message.toLowerCase().includes('does not exist'));

        if (isColumnError && error1.message.includes('company_id')) {
          const { error: error2 } = await supabase
            .from('vat_periods')
            .insert(candidate2);

          if (error2) {
            console.error('VAT_INSERT_FAILED', error2);
            showToast('Impossible de créer la période', 'error');
            return;
          }
        } else {
          console.error('VAT_INSERT_FAILED', error1);
          showToast('Impossible de créer la période', 'error');
          return;
        }
      }
    }

    const updatedMonthly = monthlyData.map(m =>
      m.month === monthNum
        ? { ...m, status: 'declared' as const, declaredAt }
        : m
    );
    setMonthlyData(updatedMonthly);
    showToast(`Période déclarée le ${new Date(declaredAt).toLocaleDateString('fr-FR')}`, 'success');
  };

  const markPeriodAsOpen = async (month: number) => {
    if (!companyId) return;

    const existingPeriod = monthlyData.find(m => m.month === month);

    if (existingPeriod?.periodId) {
      await supabase
        .from('vat_periods')
        .update({
          status: 'open',
        })
        .eq('id', existingPeriod.periodId);

      const updatedMonthly = monthlyData.map(m =>
        m.month === month
          ? { ...m, status: 'open' as const }
          : m
      );
      setMonthlyData(updatedMonthly);
    }
  };

  const exportMonthlyCSV = async (month: number) => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'exports_csv')) {
      showToast(getFeatureBlockedMessage('exports_csv'), 'error');
      return;
    }

    try {
      const monthData = monthlyData.find(m => m.month === month);
      if (!monthData) {
        showToast('Données mensuelles introuvables', 'error');
        return;
      }

      const headers = [
        'Entreprise',
        'Année',
        'Type Période',
        'Période',
        'TVA Collectée (EUR)',
        'TVA Déductible (EUR)',
        'Solde TVA (EUR)',
        'Statut',
        'Date de calcul',
      ];

      const rows = [[
        companyName,
        selectedYear.toString(),
        'Mensuelle',
        monthNames[month - 1],
        formatCurrencyExcelFR(monthData.tvaCollectee),
        formatCurrencyExcelFR(monthData.tvaDeductible),
        formatCurrencyExcelFR(monthData.soldeTVA),
        monthData.status === 'declared' ? 'Déclarée' : 'Ouverte',
        formatTodayDate(),
      ]];

      const csvContent = generateCSVContentExcelFR(headers, rows);
      const filename = `TVA_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedYear}_${String(month).padStart(2, '0')}.csv`;

      downloadCSV(filename, csvContent);
      showToast(`Export mensuel généré : ${monthNames[month - 1]} ${selectedYear}`, 'success');
    } catch (error) {
      showToast('Erreur lors de l\'export mensuel', 'error');
    }
  };

  const exportQuarterlyCSV = async (quarter: number) => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'exports_csv')) {
      showToast(getFeatureBlockedMessage('exports_csv'), 'error');
      return;
    }

    try {
      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;

      const quarterMonths = monthlyData.filter(m => m.month >= startMonth && m.month <= endMonth);

      const tvaCollectee = quarterMonths.reduce((sum, m) => sum + m.tvaCollectee, 0);
      const tvaDeductible = quarterMonths.reduce((sum, m) => sum + m.tvaDeductible, 0);
      const soldeTVA = tvaCollectee - tvaDeductible;

      const allDeclared = quarterMonths.every(m => m.status === 'declared');
      const status = allDeclared ? 'Déclarée' : 'Ouverte';

      const headers = [
        'Entreprise',
        'Année',
        'Type Période',
        'Période',
        'TVA Collectée (EUR)',
        'TVA Déductible (EUR)',
        'Solde TVA (EUR)',
        'Statut',
        'Date de calcul',
      ];

      const rows = [[
        companyName,
        selectedYear.toString(),
        'Trimestrielle',
        `T${quarter}`,
        formatCurrencyExcelFR(Math.round(tvaCollectee * 100) / 100),
        formatCurrencyExcelFR(Math.round(tvaDeductible * 100) / 100),
        formatCurrencyExcelFR(Math.round(soldeTVA * 100) / 100),
        status,
        formatTodayDate(),
      ]];

      const csvContent = generateCSVContentExcelFR(headers, rows);
      const filename = `TVA_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedYear}_Q${quarter}.csv`;

      downloadCSV(filename, csvContent);
      showToast(`Export trimestriel généré : T${quarter} ${selectedYear}`, 'success');
    } catch (error) {
      showToast('Erreur lors de l\'export trimestriel', 'error');
    }
  };

  const exportAnnualCSV = async () => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'exports_csv')) {
      showToast(getFeatureBlockedMessage('exports_csv'), 'error');
      return;
    }

    try {
      const allDeclared = monthlyData.every(m => m.status === 'declared');
      const status = allDeclared ? 'Déclarée' : 'Ouverte';

      const headers = [
        'Entreprise',
        'Année',
        'Type Période',
        'Période',
        'TVA Collectée (EUR)',
        'TVA Déductible (EUR)',
        'Solde TVA (EUR)',
        'Statut',
        'Date de calcul',
      ];

      const rows: string[][] = [];

      const exportDate = formatTodayDate();

      rows.push([
        companyName,
        selectedYear.toString(),
        'Annuelle',
        'Total',
        formatCurrencyExcelFR(tvaData.tvaCollectee),
        formatCurrencyExcelFR(tvaData.tvaDeductible),
        formatCurrencyExcelFR(tvaData.soldeTVA),
        status,
        exportDate,
      ]);

      rows.push(['', '', '', '', '', '', '', '', '']);

      monthlyData.forEach(month => {
        rows.push([
          companyName,
          selectedYear.toString(),
          'Mensuelle',
          monthNames[month.month - 1],
          formatCurrencyExcelFR(month.tvaCollectee),
          formatCurrencyExcelFR(month.tvaDeductible),
          formatCurrencyExcelFR(month.soldeTVA),
          month.status === 'declared' ? 'Déclarée' : 'Ouverte',
          exportDate,
        ]);
      });

      const csvContent = generateCSVContentExcelFR(headers, rows);
      const filename = `TVA_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedYear}_ANNUEL.csv`;

      downloadCSV(filename, csvContent);
      showToast(`Export annuel généré : ${selectedYear}`, 'success');
    } catch (error) {
      showToast('Erreur lors de l\'export annuel', 'error');
    }
  };

  const exportMonthlyPDF = async (month: number) => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'exports_pdf')) {
      showToast(getFeatureBlockedMessage('exports_pdf'), 'error');
      return;
    }

    try {
      if (!companyData) {
        showToast('Données entreprise non chargées', 'error');
        return;
      }

      const monthData = monthlyData.find(m => m.month === month);
      if (!monthData) {
        showToast('Données mensuelles introuvables', 'error');
        return;
      }

      showToast('Génération du PDF en cours...', 'success');

      const fiscalYearLabel = buildFiscalYearLabel(selectedYear, companyData.fiscal_year_start, companyData.fiscal_year_end);
      const generatedAt = formatGeneratedDate();
      const documentId = generateDocumentId(companyId!, selectedYear, `TVA-M${month}`);

      const vatRegime = buildVatRegime(companyData.vat_regime || 'monthly');
      const fiscalPeriod = `${String(month).padStart(2, '0')}/${selectedYear}`;

      const header = buildPdfHeader({
        companyName: companyData.name,
        legalForm: companyData.legal_form,
        siren: companyData.siren,
        siret: companyData.siret,
        address: companyData.address,
        vatRegime,
        fiscalYearLabel,
        reportTitle: `Synthèse TVA - ${monthNames[month - 1]} ${selectedYear}`,
        fiscalPeriod,
        declaredAt: monthData.declaredAt,
      });

      const footer = buildPdfFooter({
        generatedAt,
        pageNumber: 1,
        documentId,
        version: 'V1',
      });

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>TVA ${monthNames[month - 1]} ${selectedYear} - ${companyData.name}</title>
  ${buildPdfStyles()}
</head>
<body>
  ${header}

  <div class="section-title">Synthèse TVA ${monthNames[month - 1]} ${selectedYear}</div>

  <table>
    <thead>
      <tr>
        <th>Indicateur</th>
        <th class="text-right">Montant (EUR)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="font-bold">TVA Collectée</td>
        <td class="text-right highlight-positive">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(monthData.tvaCollectee)}</td>
      </tr>
      <tr>
        <td class="font-bold">TVA Déductible</td>
        <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(monthData.tvaDeductible)}</td>
      </tr>
      <tr style="background-color: #f9fafb; font-weight: 600;">
        <td class="font-bold">Solde TVA</td>
        <td class="text-right ${monthData.soldeTVA >= 0 ? 'highlight-positive' : 'highlight-negative'}">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(monthData.soldeTVA)}</td>
      </tr>
    </tbody>
  </table>

  ${buildVatBalanceSection(monthData.soldeTVA, monthData.status === 'declared')}

  ${footer}
</body>
</html>`;

      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.width = '210mm';
      tempContainer.style.backgroundColor = 'white';
      tempContainer.innerHTML = html;
      document.body.appendChild(tempContainer);

      const canvas = await html2canvas(tempContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      document.body.removeChild(tempContainer);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgWidth = pdfWidth - (2 * margin);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 50) {
        position = heightLeft - imgHeight + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const pdfBlob = pdf.output('blob');
      const fileName = `TVA_Mensuel_${companyData.name.replace(/[^a-z0-9]/gi, '_')}_${selectedYear}_${String(month).padStart(2, '0')}.pdf`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);

      showToast('PDF téléchargé', 'success');

      try {
        await savePdfToStorage({
          companyId: companyId!,
          fiscalYear: selectedYear,
          reportType: 'vat_monthly',
          periodKey: `${selectedYear}-${String(month).padStart(2, '0')}`,
          documentId,
          blob: pdfBlob,
          fileName,
        });
        showToast('PDF archivé avec succès', 'success');
      } catch (archiveError) {
      }
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      showToast('Erreur lors de la génération du PDF mensuel', 'error');
    }
  };

  const exportQuarterlyPDF = async (quarter: number) => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'exports_pdf')) {
      showToast(getFeatureBlockedMessage('exports_pdf'), 'error');
      return;
    }

    try {
      if (!companyData) {
        showToast('Données entreprise non chargées', 'error');
        return;
      }

      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      const quarterMonths = monthlyData.filter(m => m.month >= startMonth && m.month <= endMonth);

      const tvaCollectee = quarterMonths.reduce((sum, m) => sum + m.tvaCollectee, 0);
      const tvaDeductible = quarterMonths.reduce((sum, m) => sum + m.tvaDeductible, 0);
      const soldeTVA = tvaCollectee - tvaDeductible;

      const allDeclared = quarterMonths.every(m => m.status === 'declared');

      showToast('Génération du PDF en cours...', 'success');

      const fiscalYearLabel = buildFiscalYearLabel(selectedYear, companyData.fiscal_year_start, companyData.fiscal_year_end);
      const generatedAt = formatGeneratedDate();
      const documentId = generateDocumentId(companyId!, selectedYear, `TVA-Q${quarter}`);

      const vatRegime = buildVatRegime(companyData.vat_regime || 'quarterly');
      const fiscalPeriod = `T${quarter} ${selectedYear}`;

      const header = buildPdfHeader({
        companyName: companyData.name,
        legalForm: companyData.legal_form,
        siren: companyData.siren,
        siret: companyData.siret,
        address: companyData.address,
        vatRegime,
        fiscalYearLabel,
        reportTitle: `Synthèse TVA - T${quarter} ${selectedYear}`,
        fiscalPeriod,
      });

      const footer = buildPdfFooter({
        generatedAt,
        pageNumber: 1,
        documentId,
        version: 'V1',
      });

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>TVA T${quarter} ${selectedYear} - ${companyData.name}</title>
  ${buildPdfStyles()}
</head>
<body>
  ${header}

  <div class="section-title">Synthèse TVA Trimestrielle - T${quarter} ${selectedYear}</div>

  <table>
    <thead>
      <tr>
        <th>Indicateur</th>
        <th class="text-right">Montant (EUR)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="font-bold">TVA Collectée</td>
        <td class="text-right highlight-positive">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(tvaCollectee)}</td>
      </tr>
      <tr>
        <td class="font-bold">TVA Déductible</td>
        <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(tvaDeductible)}</td>
      </tr>
      <tr style="background-color: #f9fafb; font-weight: 600;">
        <td class="font-bold">Solde TVA</td>
        <td class="text-right ${soldeTVA >= 0 ? 'highlight-positive' : 'highlight-negative'}">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(soldeTVA)}</td>
      </tr>
    </tbody>
  </table>

  <div class="subsection-title">Détail par mois</div>
  <table>
    <thead>
      <tr>
        <th>Mois</th>
        <th class="text-right">TVA Collectée</th>
        <th class="text-right">TVA Déductible</th>
        <th class="text-right">Solde TVA</th>
        <th class="text-center">Statut</th>
      </tr>
    </thead>
    <tbody>
      ${quarterMonths.map(m => `
        <tr>
          <td>${monthNames[m.month - 1]}</td>
          <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(m.tvaCollectee)}</td>
          <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(m.tvaDeductible)}</td>
          <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(m.soldeTVA)}</td>
          <td class="text-center">${m.status === 'declared' ? 'Déclarée' : 'Ouverte'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  ${buildVatBalanceSection(soldeTVA, allDeclared)}

  ${footer}
</body>
</html>`;

      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.width = '210mm';
      tempContainer.style.backgroundColor = 'white';
      tempContainer.innerHTML = html;
      document.body.appendChild(tempContainer);

      const canvas = await html2canvas(tempContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      document.body.removeChild(tempContainer);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgWidth = pdfWidth - (2 * margin);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 50) {
        position = heightLeft - imgHeight + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const pdfBlob = pdf.output('blob');
      const fileName = `TVA_Trimestriel_${companyData.name.replace(/[^a-z0-9]/gi, '_')}_${selectedYear}_Q${quarter}.pdf`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);

      showToast('PDF téléchargé', 'success');

      try {
        await savePdfToStorage({
          companyId: companyId!,
          fiscalYear: selectedYear,
          reportType: 'vat_quarterly',
          periodKey: `${selectedYear}-Q${quarter}`,
          documentId,
          blob: pdfBlob,
          fileName,
        });
        showToast('PDF archivé avec succès', 'success');
      } catch (archiveError) {
      }
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      showToast('Erreur lors de la génération du PDF trimestriel', 'error');
    }
  };

  const exportAnnualPDF = async () => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'exports_pdf')) {
      showToast(getFeatureBlockedMessage('exports_pdf'), 'error');
      return;
    }

    try {
      if (!companyData) {
        showToast('Données entreprise non chargées', 'error');
        return;
      }

      const allDeclared = monthlyData.every(m => m.status === 'declared');

      showToast('Génération du PDF en cours...', 'success');

      const fiscalYearLabel = buildFiscalYearLabel(selectedYear, companyData.fiscal_year_start, companyData.fiscal_year_end);
      const generatedAt = formatGeneratedDate();
      const documentId = generateDocumentId(companyId!, selectedYear, 'TVA-A');

      const vatRegime = buildVatRegime(companyData.vat_regime || 'monthly');
      const fiscalPeriod = `Année ${selectedYear}`;

      const header = buildPdfHeader({
        companyName: companyData.name,
        legalForm: companyData.legal_form,
        siren: companyData.siren,
        siret: companyData.siret,
        address: companyData.address,
        vatRegime,
        fiscalYearLabel,
        reportTitle: 'Récapitulatif TVA Annuel (Document interne non fiscal)',
        fiscalPeriod,
      });

      const footer = buildPdfFooter({
        generatedAt,
        pageNumber: 1,
        documentId,
        version: 'V1',
      });

      const quarters = [
        { q: 1, months: monthlyData.filter(m => m.month >= 1 && m.month <= 3) },
        { q: 2, months: monthlyData.filter(m => m.month >= 4 && m.month <= 6) },
        { q: 3, months: monthlyData.filter(m => m.month >= 7 && m.month <= 9) },
        { q: 4, months: monthlyData.filter(m => m.month >= 10 && m.month <= 12) },
      ];

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>TVA Annuelle ${selectedYear} - ${companyData.name}</title>
  ${buildPdfStyles()}
</head>
<body>
  ${header}

  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
    <p style="margin: 0; font-size: 13px; color: #92400e; font-weight: 500;">
      <strong>Note importante :</strong> Ce document ne constitue pas une déclaration fiscale officielle (CA3 / CA12). Il s'agit d'un récapitulatif interne à des fins de gestion.
    </p>
  </div>

  <div class="section-title">Synthèse TVA Annuelle ${selectedYear}</div>

  <table>
    <thead>
      <tr>
        <th>Indicateur</th>
        <th class="text-right">Montant (EUR)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="font-bold">TVA Collectée</td>
        <td class="text-right highlight-positive">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(tvaData.tvaCollectee)}</td>
      </tr>
      <tr>
        <td class="font-bold">TVA Déductible</td>
        <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(tvaData.tvaDeductible)}</td>
      </tr>
      <tr style="background-color: #f9fafb; font-weight: 600;">
        <td class="font-bold">Solde TVA</td>
        <td class="text-right ${tvaData.soldeTVA >= 0 ? 'highlight-positive' : 'highlight-negative'}">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(tvaData.soldeTVA)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">Détail trimestriel</div>
  ${quarters.map(({ q, months }) => {
    const tvaC = months.reduce((sum, m) => sum + m.tvaCollectee, 0);
    const tvaD = months.reduce((sum, m) => sum + m.tvaDeductible, 0);
    const solde = tvaC - tvaD;
    return `
      <div class="subsection-title">Trimestre ${q}</div>
      <table>
        <thead>
          <tr>
            <th>Mois</th>
            <th class="text-right">TVA Collectée</th>
            <th class="text-right">TVA Déductible</th>
            <th class="text-right">Solde TVA</th>
            <th class="text-center">Statut</th>
          </tr>
        </thead>
        <tbody>
          ${months.map(m => `
            <tr>
              <td>${monthNames[m.month - 1]}</td>
              <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(m.tvaCollectee)}</td>
              <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(m.tvaDeductible)}</td>
              <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(m.soldeTVA)}</td>
              <td class="text-center">${m.status === 'declared' ? 'Déclarée' : 'Ouverte'}</td>
            </tr>
          `).join('')}
          <tr style="background-color: #f9fafb; font-weight: 600;">
            <td class="font-bold">Total T${q}</td>
            <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(tvaC)}</td>
            <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(tvaD)}</td>
            <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(solde)}</td>
            <td class="text-center">-</td>
          </tr>
        </tbody>
      </table>
    `;
  }).join('')}

  ${buildVatBalanceSection(tvaData.soldeTVA, allDeclared)}

  ${footer}
</body>
</html>`;

      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.width = '210mm';
      tempContainer.style.backgroundColor = 'white';
      tempContainer.innerHTML = html;
      document.body.appendChild(tempContainer);

      const canvas = await html2canvas(tempContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      document.body.removeChild(tempContainer);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgWidth = pdfWidth - (2 * margin);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 50) {
        position = heightLeft - imgHeight + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const pdfBlob = pdf.output('blob');
      const fileName = `TVA_Annuel_${companyData.name.replace(/[^a-z0-9]/gi, '_')}_${selectedYear}.pdf`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);

      showToast('PDF téléchargé', 'success');

      try {
        await savePdfToStorage({
          companyId: companyId!,
          fiscalYear: selectedYear,
          reportType: 'vat_annual',
          periodKey: String(selectedYear),
          documentId,
          blob: pdfBlob,
          fileName,
        });
        showToast('PDF archivé avec succès', 'success');
      } catch (archiveError) {
      }
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      showToast('Erreur lors de la génération du PDF annuel', 'error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <AppHeader subtitle={user?.email} onSignOut={handleSignOut} />

      <main
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '32px 24px',
        }}
      >
        <BackButton to={`/app/company/${companyId}`} />

        <div style={{ marginBottom: '24px' }}>
          <h2
            style={{
              margin: '0 0 8px 0',
              fontSize: '32px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}
          >
            Synthèse TVA
          </h2>
          <p
            style={{
              margin: 0,
              color: '#6b7280',
              fontSize: '16px',
            }}
          >
            {companyName}
          </p>
        </div>

        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            marginBottom: '32px',
          }}
        >
          <span style={{ fontSize: '20px' }}>ℹ️</span>
          <div>
            <p
              style={{
                margin: '0 0 4px 0',
                fontSize: '14px',
                fontWeight: '600',
                color: '#92400e',
              }}
            >
              Module informatif uniquement
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: '#78350f',
                lineHeight: '1.5',
              }}
            >
              Ces calculs sont fournis à titre indicatif pour votre suivi interne. Document informatif uniquement.
              Seuls les documents validés ET payés sont comptabilisés. Consultez votre expert-comptable pour tout usage fiscal.
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <label
            style={{
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
            }}
          >
            Année :
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              outline: 'none',
              cursor: 'pointer',
              backgroundColor: 'white',
              transition: 'border-color 0.2s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#3b82f6';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {!loading && tvaData.tvaCollectee === 0 && tvaData.tvaDeductible === 0 ? (
          <div
            style={{
              padding: '80px 32px',
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: '#f3f4f6',
                marginBottom: '24px',
              }}
            >
              <span style={{ fontSize: '40px' }}>📊</span>
            </div>
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: '20px',
                fontWeight: '600',
                color: '#1a1a1a',
              }}
            >
              Aucune donnée disponible pour le moment
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: '16px',
                color: '#6b7280',
                lineHeight: '1.5',
              }}
            >
              Ajoutez vos premières opérations pour voir apparaître cette section.
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '24px',
                marginBottom: '32px',
              }}
            >
              <div
                style={{
                  padding: '24px',
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                  border: '2px solid #dbeafe',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: '#dbeafe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                    }}
                  >
                    📥
                  </div>
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      TVA Collectée
                    </p>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '12px',
                        color: '#9ca3af',
                      }}
                    >
                      Sur vos revenus
                    </p>
                  </div>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '36px',
                    fontWeight: '700',
                    color: loading ? '#9ca3af' : '#1e40af',
                  }}
                >
                  {loading
                    ? '...'
                    : new Intl.NumberFormat('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(tvaData.tvaCollectee)}
                </p>
              </div>

              <div
                style={{
                  padding: '24px',
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                  border: '2px solid #fecaca',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: '#fee2e2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                    }}
                  >
                    📤
                  </div>
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      TVA Déductible
                    </p>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '12px',
                        color: '#9ca3af',
                      }}
                    >
                      Sur vos dépenses
                    </p>
                  </div>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '36px',
                    fontWeight: '700',
                    color: loading ? '#9ca3af' : '#dc2626',
                  }}
                >
                  {loading
                    ? '...'
                    : new Intl.NumberFormat('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(tvaData.tvaDeductible)}
                </p>
              </div>

              <div
                style={{
                  padding: '24px',
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                  border: `2px solid ${tvaData.soldeTVA >= 0 ? '#d1fae5' : '#fee2e2'}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: tvaData.soldeTVA >= 0 ? '#d1fae5' : '#fee2e2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                    }}
                  >
                    {tvaData.soldeTVA >= 0 ? '💰' : '⚖️'}
                  </div>
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Solde TVA
                    </p>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '12px',
                        color: '#9ca3af',
                      }}
                    >
                      {tvaData.soldeTVA >= 0 ? 'À reverser' : 'Crédit de TVA'}
                    </p>
                  </div>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '36px',
                    fontWeight: '700',
                    color: loading
                      ? '#9ca3af'
                      : tvaData.soldeTVA >= 0
                      ? '#059669'
                      : '#dc2626',
                  }}
                >
                  {loading
                    ? '...'
                    : new Intl.NumberFormat('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(Math.abs(tvaData.soldeTVA))}
                </p>
              </div>
            </div>

            <div
              style={{
                padding: '32px',
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                marginBottom: '32px',
              }}
            >
              <h3
                style={{
                  margin: '0 0 16px 0',
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#1a1a1a',
                }}
              >
                Exports TVA
              </h3>
              <p
                style={{
                  margin: '0 0 24px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                }}
              >
                Téléchargez les données TVA au format CSV pour {selectedYear}
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    padding: '20px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    backgroundColor: '#f9fafb',
                  }}
                >
                  <h4
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#1a1a1a',
                    }}
                  >
                    Export Annuel
                  </h4>
                  <p
                    style={{
                      margin: '0 0 16px 0',
                      fontSize: '13px',
                      color: '#6b7280',
                      lineHeight: '1.5',
                    }}
                  >
                    Total annuel + détail des 12 mois
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      onClick={exportAnnualCSV}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: 'white',
                        backgroundColor: '#3b82f6',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#2563eb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#3b82f6';
                      }}
                    >
                      CSV {selectedYear}
                    </button>
                    <button
                      onClick={exportAnnualPDF}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#3b82f6',
                        backgroundColor: 'white',
                        border: '2px solid #3b82f6',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#eff6ff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                      }}
                    >
                      PDF {selectedYear}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    padding: '20px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    backgroundColor: '#f9fafb',
                  }}
                >
                  <h4
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#1a1a1a',
                    }}
                  >
                    Export Trimestriel
                  </h4>
                  <p
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '13px',
                      color: '#6b7280',
                      lineHeight: '1.5',
                    }}
                  >
                    Choisissez un trimestre
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Format CSV</p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[1, 2, 3, 4].map(q => (
                          <button
                            key={`csv-${q}`}
                            onClick={() => exportQuarterlyCSV(q)}
                            style={{
                              flex: '1 1 calc(50% - 4px)',
                              padding: '8px 12px',
                              fontSize: '13px',
                              fontWeight: '500',
                              color: 'white',
                              backgroundColor: '#3b82f6',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#2563eb';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#3b82f6';
                            }}
                          >
                            T{q}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Format PDF</p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[1, 2, 3, 4].map(q => (
                          <button
                            key={`pdf-${q}`}
                            onClick={() => exportQuarterlyPDF(q)}
                            style={{
                              flex: '1 1 calc(50% - 4px)',
                              padding: '8px 12px',
                              fontSize: '13px',
                              fontWeight: '500',
                              color: '#3b82f6',
                              backgroundColor: 'white',
                              border: '2px solid #3b82f6',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#eff6ff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'white';
                            }}
                          >
                            T{q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: '20px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    backgroundColor: '#f9fafb',
                  }}
                >
                  <h4
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#1a1a1a',
                    }}
                  >
                    Export Mensuel
                  </h4>
                  <p
                    style={{
                      margin: '0 0 16px 0',
                      fontSize: '13px',
                      color: '#6b7280',
                      lineHeight: '1.5',
                    }}
                  >
                    Voir tableau ci-dessous
                  </p>
                  <div
                    style={{
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: '#6b7280',
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      textAlign: 'center',
                    }}
                  >
                    Action dans le tableau
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '32px',
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
              }}
            >
              <h3
                style={{
                  margin: '0 0 24px 0',
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#1a1a1a',
                }}
              >
                Détail mensuel
              </h3>

              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        backgroundColor: '#f9fafb',
                        borderBottom: '2px solid #e5e7eb',
                      }}
                    >
                      <th
                        style={{
                          padding: '12px 16px',
                          textAlign: 'left',
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Mois
                      </th>
                      <th
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        TVA Collectée
                      </th>
                      <th
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        TVA Déductible
                      </th>
                      <th
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Solde
                      </th>
                      <th
                        style={{
                          padding: '12px 16px',
                          textAlign: 'center',
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Statut
                      </th>
                      <th
                        style={{
                          padding: '12px 16px',
                          textAlign: 'center',
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((month) => {
                      const hasActivity = month.tvaCollectee !== 0 || month.tvaDeductible !== 0;
                      const isDeclared = month.status === 'declared';

                      return (
                        <tr
                          key={month.month}
                          style={{
                            borderBottom: '1px solid #e5e7eb',
                            backgroundColor: isDeclared ? '#f9fafb' : 'white',
                            opacity: !hasActivity ? 0.5 : 1,
                          }}
                        >
                          <td
                            style={{
                              padding: '12px 16px',
                              fontSize: '14px',
                              fontWeight: '500',
                              color: '#374151',
                            }}
                          >
                            {monthNames[month.month - 1]}
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              fontSize: '14px',
                              color: '#1e40af',
                              textAlign: 'right',
                              fontWeight: '500',
                            }}
                          >
                            {new Intl.NumberFormat('fr-FR', {
                              style: 'currency',
                              currency: 'EUR',
                            }).format(month.tvaCollectee)}
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              fontSize: '14px',
                              color: '#dc2626',
                              textAlign: 'right',
                              fontWeight: '500',
                            }}
                          >
                            {new Intl.NumberFormat('fr-FR', {
                              style: 'currency',
                              currency: 'EUR',
                            }).format(month.tvaDeductible)}
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              fontSize: '14px',
                              color: month.soldeTVA >= 0 ? '#059669' : '#dc2626',
                              textAlign: 'right',
                              fontWeight: '600',
                            }}
                          >
                            {new Intl.NumberFormat('fr-FR', {
                              style: 'currency',
                              currency: 'EUR',
                            }).format(Math.abs(month.soldeTVA))}
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              textAlign: 'center',
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <span
                                style={{
                                  padding: '4px 12px',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  borderRadius: '12px',
                                  backgroundColor: isDeclared ? '#d1fae5' : '#f3f4f6',
                                  color: isDeclared ? '#065f46' : '#6b7280',
                                }}
                              >
                                {isDeclared ? 'Déclarée' : 'Ouverte'}
                              </span>
                              {isDeclared && month.declaredAt && (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    color: '#6b7280',
                                  }}
                                >
                                  le {new Date(month.declaredAt).toLocaleDateString('fr-FR')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              textAlign: 'center',
                            }}
                          >
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                              {hasActivity && (
                                <>
                                  <button
                                    onClick={() => exportMonthlyCSV(month.month)}
                                    style={{
                                      padding: '6px 12px',
                                      fontSize: '12px',
                                      fontWeight: '500',
                                      color: '#3b82f6',
                                      backgroundColor: 'white',
                                      border: '1px solid #bfdbfe',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    CSV
                                  </button>
                                  <button
                                    onClick={() => exportMonthlyPDF(month.month)}
                                    style={{
                                      padding: '6px 12px',
                                      fontSize: '12px',
                                      fontWeight: '500',
                                      color: '#3b82f6',
                                      backgroundColor: 'white',
                                      border: '1px solid #bfdbfe',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    PDF
                                  </button>
                                  {isDeclared ? (
                                    <button
                                      onClick={() => markPeriodAsOpen(month.month)}
                                      style={{
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        fontWeight: '500',
                                        color: '#dc2626',
                                        backgroundColor: 'white',
                                        border: '1px solid #fecaca',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Rouvrir
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => markPeriodAsDeclared(month.month)}
                                      style={{
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        fontWeight: '500',
                                        color: '#059669',
                                        backgroundColor: 'white',
                                        border: '1px solid #d1fae5',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Marquer déclarée
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      <AIAssistant
        context="tva"
        data={{
          tvaCollectee: tvaData.tvaCollectee,
          tvaDeductible: tvaData.tvaDeductible,
          soldeTVA: tvaData.soldeTVA,
        }}
        companyId={companyId!}
      />

      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}

      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  );
}
