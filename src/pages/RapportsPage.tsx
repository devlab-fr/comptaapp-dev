import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import BackButton from '../components/BackButton';
import Toast from '../components/Toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  buildPdfHeader,
  buildPdfFooter,
  buildPdfStyles,
  formatGeneratedDate,
  buildFiscalYearLabel,
  generateDocumentId,
} from '../utils/pdfTemplate';
import { savePdfToStorage } from '../utils/pdfArchive';
import { useEntitlements } from '../billing/useEntitlements';
import { hasFeature, getFeatureBlockedMessage, convertEntitlementsPlanToTier } from '../billing/planRules';
import { exportBilanDetaille as exportBilanDetailleUtil } from '../utils/bilanDetaille';

interface CompanyData {
  name: string;
  legal_form: string;
  siren: string;
  siret: string;
  address: string;
  country: string;
  vat_regime?: string;
  fiscal_year_start?: string;
  fiscal_year_end?: string;
}

interface Director {
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
}

interface Shareholder {
  name: string;
  type: 'person' | 'entity';
  ownership_percentage: number;
  capital_amount: number;
}

interface ResultatData {
  produitsHT: number;
  chargesHT: number;
  resultatHT: number;
}

interface TVAData {
  tvaCollectee: number;
  tvaDeductible: number;
  soldeTVA: number;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

export default function RapportsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const entitlements = useEntitlements();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [directors, setDirectors] = useState<Director[]>([]);
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [resultatData, setResultatData] = useState<ResultatData>({
    produitsHT: 0,
    chargesHT: 0,
    resultatHT: 0,
  });
  const [tvaData, setTvaData] = useState<TVAData>({
    tvaCollectee: 0,
    tvaDeductible: 0,
    soldeTVA: 0,
  });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

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

  useEffect(() => {
    const loadData = async () => {
      if (!companyId) return;

      setLoading(true);

      const { data: company } = await supabase
        .from('companies')
        .select('name, legal_form, siren, siret, address, country, vat_regime, fiscal_year_start, fiscal_year_end')
        .eq('id', companyId)
        .maybeSingle();

      if (company) {
        setCompanyData(company);
      }

      const { data: directorsData } = await supabase
        .from('company_directors')
        .select('first_name, last_name, role, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true);

      if (directorsData) {
        setDirectors(directorsData);
      }

      const { data: shareholdersData } = await supabase
        .from('company_shareholders')
        .select('name, type, ownership_percentage, capital_amount')
        .eq('company_id', companyId)
        .order('ownership_percentage', { ascending: false });

      if (shareholdersData) {
        setShareholders(shareholdersData);
      }

      const { data: expenseDocs } = await supabase
        .from('expense_documents')
        .select('invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid');

      const { data: revenueDocs } = await supabase
        .from('revenue_documents')
        .select('invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid');

      const years = new Set<number>();
      expenseDocs?.forEach((doc) => years.add(new Date(doc.invoice_date).getFullYear()));
      revenueDocs?.forEach((doc) => years.add(new Date(doc.invoice_date).getFullYear()));

      if (years.size === 0) {
        years.add(new Date().getFullYear());
      }

      const sortedYears = Array.from(years).sort((a, b) => b - a);
      setAvailableYears(sortedYears);

      setLoading(false);
    };

    loadData();
  }, [companyId]);

  useEffect(() => {
    const loadResultatData = async () => {
      if (!companyId) return;

      const { data: expenseDocs } = await supabase
        .from('expense_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid');

      const { data: revenueDocs } = await supabase
        .from('revenue_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid');

      const expenseDocsInYear = expenseDocs?.filter((doc) => {
        const year = new Date(doc.invoice_date).getFullYear();
        return year === selectedYear;
      }) || [];

      const revenueDocsInYear = revenueDocs?.filter((doc) => {
        const year = new Date(doc.invoice_date).getFullYear();
        return year === selectedYear;
      }) || [];

      let chargesHT = 0;
      let produitsHT = 0;

      if (expenseDocsInYear.length > 0) {
        const { data: expenseLines } = await supabase
          .from('expense_lines')
          .select('amount_excl_vat')
          .in('document_id', expenseDocsInYear.map(d => d.id));

        if (expenseLines) {
          chargesHT = expenseLines.reduce((sum, line) => sum + Number(line.amount_excl_vat), 0);
        }
      }

      if (revenueDocsInYear.length > 0) {
        const { data: revenueLines } = await supabase
          .from('revenue_lines')
          .select('amount_excl_vat')
          .in('document_id', revenueDocsInYear.map(d => d.id));

        if (revenueLines) {
          produitsHT = revenueLines.reduce((sum, line) => sum + Number(line.amount_excl_vat), 0);
        }
      }

      setResultatData({
        produitsHT: Math.round(produitsHT * 100) / 100,
        chargesHT: Math.round(chargesHT * 100) / 100,
        resultatHT: Math.round((produitsHT - chargesHT) * 100) / 100,
      });
    };

    loadResultatData();
  }, [companyId, selectedYear]);

  useEffect(() => {
    const loadTVAData = async () => {
      if (!companyId) return;

      const { data: expenseDocs } = await supabase
        .from('expense_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid');

      const { data: revenueDocs } = await supabase
        .from('revenue_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid');

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

      if (expenseDocsInYear.length > 0) {
        const { data: expenseLines } = await supabase
          .from('expense_lines')
          .select('vat_amount')
          .in('document_id', expenseDocsInYear.map(d => d.id));

        if (expenseLines) {
          tvaDeductible = expenseLines.reduce((sum, line) => sum + Number(line.vat_amount), 0);
        }
      }

      if (revenueDocsInYear.length > 0) {
        const { data: revenueLines } = await supabase
          .from('revenue_lines')
          .select('vat_amount')
          .in('document_id', revenueDocsInYear.map(d => d.id));

        if (revenueLines) {
          tvaCollectee = revenueLines.reduce((sum, line) => sum + Number(line.vat_amount), 0);
        }
      }

      setTvaData({
        tvaCollectee: Math.round(tvaCollectee * 100) / 100,
        tvaDeductible: Math.round(tvaDeductible * 100) / 100,
        soldeTVA: Math.round((tvaCollectee - tvaDeductible) * 100) / 100,
      });
    };

    loadTVAData();
  }, [companyId, selectedYear]);


  const exportBilanSimplifie = async () => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'exports_pdf')) {
      console.log('GATING_EXPORT_BLOCKED', { file: 'RapportsPage.tsx', feature: 'exports_pdf', name: 'BilanSimplifie', plan: entitlements.plan });
      showToast(getFeatureBlockedMessage('exports_pdf'), 'error');
      return;
    }

    try {
      if (!companyData) {
        showToast('Données entreprise introuvables', 'error');
        return;
      }

      showToast('Génération du PDF en cours...', 'success');

      const { data: expenseDocs } = await supabase
        .from('expense_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid');

      const { data: revenueDocs } = await supabase
        .from('revenue_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid');

      const expenseDocsInYear = expenseDocs?.filter((doc) => {
        const year = new Date(doc.invoice_date).getFullYear();
        return year === selectedYear;
      }) || [];

      const revenueDocsInYear = revenueDocs?.filter((doc) => {
        const year = new Date(doc.invoice_date).getFullYear();
        return year === selectedYear;
      }) || [];

      let totalExpenses = 0;
      let totalRevenues = 0;

      if (expenseDocsInYear.length > 0) {
        const { data: expenseLines } = await supabase
          .from('expense_lines')
          .select('amount_incl_vat')
          .in('document_id', expenseDocsInYear.map(d => d.id));

        if (expenseLines) {
          totalExpenses = expenseLines.reduce((sum, line) => sum + Number(line.amount_incl_vat), 0);
        }
      }

      if (revenueDocsInYear.length > 0) {
        const { data: revenueLines } = await supabase
          .from('revenue_lines')
          .select('amount_incl_vat')
          .in('document_id', revenueDocsInYear.map(d => d.id));

        if (revenueLines) {
          totalRevenues = revenueLines.reduce((sum, line) => sum + Number(line.amount_incl_vat), 0);
        }
      }

      const tresorerie = totalRevenues - totalExpenses;
      const actifImmobilise = 0;
      const actifCirculant = 0;
      const totalActif = actifImmobilise + actifCirculant + tresorerie;

      const capitauxPropres = 0;
      const dettes = 0;
      const totalPassif = capitauxPropres + dettes;

      const equilibre = Math.abs(totalActif - totalPassif) < 0.01;

      const fiscalYearLabel = buildFiscalYearLabel(
        selectedYear,
        companyData.fiscal_year_start,
        companyData.fiscal_year_end
      );
      const generatedAt = formatGeneratedDate();
      const documentId = generateDocumentId(companyId!, selectedYear, 'BILAN_SIMPLIFIE');

      const header = buildPdfHeader({
        companyName: companyData.name,
        legalForm: companyData.legal_form,
        siren: companyData.siren,
        siret: companyData.siret,
        address: companyData.address,
        vatRegime: companyData.vat_regime,
        fiscalYearLabel,
        reportTitle: "Bilan simplifié",
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
  <title>Bilan simplifié - ${companyData.name} - ${selectedYear}</title>
  ${buildPdfStyles()}
</head>
<body>
  ${header}

  <div class="section-title">ACTIF</div>
  <div style="max-width: 700px; margin: 0 auto;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 14px 16px; text-align: left; font-size: 15px; font-weight: 600; color: #374151;">Libellé</th>
          <th style="padding: 14px 16px; text-align: right; font-size: 15px; font-weight: 600; color: #374151;">Montant (€)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Total Actif Immobilisé</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500; color: #1f2937;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(actifImmobilise)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Total Actif Circulant</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500; color: #1f2937;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(actifCirculant)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Trésorerie</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500; color: ${tresorerie >= 0 ? '#059669' : '#dc2626'};">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tresorerie)}</td>
        </tr>
        <tr style="background-color: #f0f9ff; border-top: 2px solid #0284c7;">
          <td style="padding: 16px; font-size: 16px; font-weight: 700; color: #1a1a1a;">TOTAL ACTIF</td>
          <td style="padding: 16px; text-align: right; font-size: 16px; font-weight: 700; color: #0284c7;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalActif)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section-title">PASSIF</div>
  <div style="max-width: 700px; margin: 0 auto;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 14px 16px; text-align: left; font-size: 15px; font-weight: 600; color: #374151;">Libellé</th>
          <th style="padding: 14px 16px; text-align: right; font-size: 15px; font-weight: 600; color: #374151;">Montant (€)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Capitaux propres</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500; color: #1f2937;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(capitauxPropres)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Dettes</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500; color: #1f2937;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(dettes)}</td>
        </tr>
        <tr style="background-color: #f0f9ff; border-top: 2px solid #0284c7;">
          <td style="padding: 16px; font-size: 16px; font-weight: 700; color: #1a1a1a;">TOTAL PASSIF</td>
          <td style="padding: 16px; text-align: right; font-size: 16px; font-weight: 700; color: #0284c7;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalPassif)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section-title">CONTRÔLE DE COHÉRENCE</div>
  <div style="max-width: 700px; margin: 0 auto;">
    <div style="padding: 16px; background-color: ${equilibre ? '#f0fdf4' : '#fef2f2'}; border-radius: 8px; border: 2px solid ${equilibre ? '#059669' : '#dc2626'};">
      <p style="margin: 0; font-size: 15px; font-weight: 600; color: ${equilibre ? '#059669' : '#dc2626'};">
        ${equilibre ? '✓ Équilibre : TOTAL ACTIF = TOTAL PASSIF' : '⚠ Attention : bilan non équilibré'}
      </p>
    </div>
  </div>

  ${footer}
</body>
</html>
      `;

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

      const fileName = `Bilan_Simplifie_${companyData.name.replace(/[^a-z0-9]/gi, '_')}_${selectedYear}.pdf`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdf.output('blob'));
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);

      showToast('PDF téléchargé', 'success');
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      showToast('Erreur lors de la génération du rapport', 'error');
    }
  };

  const exportBilanDetaille = async () => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'exports_pdf')) {
      console.log('GATING_EXPORT_BLOCKED', { file: 'RapportsPage.tsx', feature: 'exports_pdf', name: 'BilanDetaille', plan: entitlements.plan });
      showToast(getFeatureBlockedMessage('exports_pdf'), 'error');
      return;
    }

    try {
      if (!companyData) {
        showToast('Données entreprise introuvables', 'error');
        return;
      }

      showToast('Génération du PDF en cours...', 'success');

      await exportBilanDetailleUtil(companyId!, selectedYear, companyData);

      showToast('PDF téléchargé', 'success');
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      showToast(
        error instanceof Error ? error.message : 'Erreur lors de la génération du rapport',
        'error'
      );
    }
  };

  const exportTVAAnnuelle = async () => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'exports_pdf')) {
      console.log('GATING_EXPORT_BLOCKED', { file: 'RapportsPage.tsx', feature: 'exports_pdf', name: 'TVAAnnuelle', plan: entitlements.plan });
      showToast(getFeatureBlockedMessage('exports_pdf'), 'error');
      return;
    }

    try {
      if (!companyData) {
        showToast('Données entreprise introuvables', 'error');
        return;
      }

      showToast('Génération du PDF en cours...', 'success');

      const fiscalYearLabel = buildFiscalYearLabel(
        selectedYear,
        companyData.fiscal_year_start,
        companyData.fiscal_year_end
      );
      const generatedAt = formatGeneratedDate();
      const documentId = generateDocumentId(companyId!, selectedYear, 'TVA_ANNUELLE');

      const header = buildPdfHeader({
        companyName: companyData.name,
        legalForm: companyData.legal_form,
        siren: companyData.siren,
        siret: companyData.siret,
        address: companyData.address,
        vatRegime: companyData.vat_regime,
        fiscalYearLabel,
        reportTitle: "Synthèse TVA annuelle",
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
  <title>Synthèse TVA annuelle - ${companyData.name} - ${selectedYear}</title>
  ${buildPdfStyles()}
</head>
<body>
  ${header}

  <div class="section-title">SYNTHÈSE TVA ${selectedYear}</div>
  <div style="max-width: 700px; margin: 0 auto;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 14px 16px; text-align: left; font-size: 15px; font-weight: 600; color: #374151;">Libellé</th>
          <th style="padding: 14px 16px; text-align: right; font-size: 15px; font-weight: 600; color: #374151;">Montant (€)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Total TVA collectée (ventes)</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500; color: ${tvaData.tvaCollectee > 0 ? '#059669' : '#1f2937'};">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tvaData.tvaCollectee)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Total TVA déductible (achats)</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500; color: ${tvaData.tvaDeductible > 0 ? '#f59e0b' : '#1f2937'};">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tvaData.tvaDeductible)}</td>
        </tr>
        <tr style="background-color: #f0f9ff; border-top: 2px solid #0284c7;">
          <td style="padding: 16px; font-size: 16px; font-weight: 700; color: #1a1a1a;">Solde TVA ${tvaData.soldeTVA >= 0 ? '(à payer)' : '(crédit de TVA)'}</td>
          <td style="padding: 16px; text-align: right; font-size: 16px; font-weight: 700; color: ${tvaData.soldeTVA >= 0 ? '#dc2626' : '#059669'};">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tvaData.soldeTVA)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div style="max-width: 700px; margin: 20px auto; padding: 16px; background-color: #fef9e7; border-radius: 8px; border-left: 4px solid #f59e0b;">
    <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.6;">
      <strong>Note :</strong> Ce document est fourni à titre informatif. Il présente une synthèse annuelle de la TVA collectée et déductible pour l'exercice ${selectedYear}. Outil d'aide à la gestion uniquement. Consultez votre expert-comptable pour tout usage fiscal.
    </p>
  </div>

  ${footer}
</body>
</html>
      `;

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

      const fileName = `TVA_Annuelle_${companyData.name.replace(/[^a-z0-9]/gi, '_')}_${selectedYear}.pdf`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdf.output('blob'));
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);

      showToast('PDF téléchargé', 'success');
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      showToast('Erreur lors de la génération du rapport', 'error');
    }
  };

  const exportLiasseFiscale = async () => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'liasse_fiscale')) {
      console.log('GATING_EXPORT_BLOCKED', { file: 'RapportsPage.tsx', feature: 'liasse_fiscale', name: 'LiasseFiscale', plan: entitlements.plan });
      showToast(getFeatureBlockedMessage('liasse_fiscale'), 'error');
      return;
    }

    try {
      if (!companyData) {
        showToast('Données entreprise introuvables', 'error');
        return;
      }

      showToast('Génération du PDF en cours...', 'success');

      const { data: expenseDocs } = await supabase
        .from('expense_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid');

      const { data: revenueDocs } = await supabase
        .from('revenue_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid');

      const expenseDocsInYear = expenseDocs?.filter((doc) => {
        const year = new Date(doc.invoice_date).getFullYear();
        return year === selectedYear;
      }) || [];

      const revenueDocsInYear = revenueDocs?.filter((doc) => {
        const year = new Date(doc.invoice_date).getFullYear();
        return year === selectedYear;
      }) || [];

      let totalExpenses = 0;
      let totalRevenues = 0;

      if (expenseDocsInYear.length > 0) {
        const { data: expenseLines } = await supabase
          .from('expense_lines')
          .select('amount_incl_vat')
          .in('document_id', expenseDocsInYear.map(d => d.id));

        if (expenseLines) {
          totalExpenses = expenseLines.reduce((sum, line) => sum + Number(line.amount_incl_vat), 0);
        }
      }

      if (revenueDocsInYear.length > 0) {
        const { data: revenueLines } = await supabase
          .from('revenue_lines')
          .select('amount_incl_vat')
          .in('document_id', revenueDocsInYear.map(d => d.id));

        if (revenueLines) {
          totalRevenues = revenueLines.reduce((sum, line) => sum + Number(line.amount_incl_vat), 0);
        }
      }

      const tresorerie = totalRevenues - totalExpenses;
      const actifImmobilise = 0;
      const actifCirculant = 0;
      const totalActif = actifImmobilise + actifCirculant + tresorerie;

      const capitauxPropres = 0;
      const dettes = 0;
      const totalPassif = capitauxPropres + dettes;

      const equilibre = Math.abs(totalActif - totalPassif) < 0.01;

      const fiscalYearLabel = buildFiscalYearLabel(
        selectedYear,
        companyData.fiscal_year_start,
        companyData.fiscal_year_end
      );
      const generatedAt = formatGeneratedDate();
      const documentId = generateDocumentId(companyId!, selectedYear, 'LIASSE_FISCALE');

      const header = buildPdfHeader({
        companyName: companyData.name,
        legalForm: companyData.legal_form,
        siren: companyData.siren,
        siret: companyData.siret,
        address: companyData.address,
        vatRegime: companyData.vat_regime,
        fiscalYearLabel,
        reportTitle: "Liasse fiscale simplifiée",
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
  <title>Liasse fiscale simplifiée - ${companyData.name} - ${selectedYear}</title>
  ${buildPdfStyles()}
</head>
<body>
  ${header}

  <div style="text-align: center; margin: 40px 0; padding: 30px; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 12px; max-width: 700px; margin-left: auto; margin-right: auto;">
    <h2 style="margin: 0 0 10px 0; font-size: 28px; font-weight: 700; color: #0c4a6e;">Liasse fiscale simplifiée</h2>
    <p style="margin: 0; font-size: 16px; color: #475569;">Document informatif — V1</p>
  </div>

  <div class="section-title">COMPTE DE RÉSULTAT — SYNTHÈSE</div>
  <div style="max-width: 700px; margin: 0 auto;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
      <thead>
        <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 14px 16px; text-align: left; font-size: 15px; font-weight: 600; color: #374151;">Libellé</th>
          <th style="padding: 14px 16px; text-align: right; font-size: 15px; font-weight: 600; color: #374151;">Montant HT (€)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Total Produits</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500; color: ${resultatData.produitsHT >= 0 ? '#059669' : '#dc2626'};">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(resultatData.produitsHT)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Total Charges</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500; color: #f59e0b;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(resultatData.chargesHT)}</td>
        </tr>
        <tr style="background-color: #f0f9ff; border-top: 2px solid #0284c7;">
          <td style="padding: 16px; font-size: 16px; font-weight: 700; color: #1a1a1a;">Résultat de l'exercice</td>
          <td style="padding: 16px; text-align: right; font-size: 16px; font-weight: 700; color: ${resultatData.resultatHT >= 0 ? '#059669' : '#dc2626'};">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(resultatData.resultatHT)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section-title">BILAN — SYNTHÈSE</div>
  <div style="max-width: 700px; margin: 0 auto;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
      <thead>
        <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 14px 16px; text-align: left; font-size: 15px; font-weight: 600; color: #374151;">ACTIF</th>
          <th style="padding: 14px 16px; text-align: right; font-size: 15px; font-weight: 600; color: #374151;">Montant (€)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Actif Immobilisé</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(actifImmobilise)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Actif Circulant</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(actifCirculant)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Trésorerie</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500; color: ${tresorerie >= 0 ? '#059669' : '#dc2626'};">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tresorerie)}</td>
        </tr>
        <tr style="background-color: #f0f9ff; border-top: 2px solid #0284c7;">
          <td style="padding: 16px; font-size: 16px; font-weight: 700; color: #1a1a1a;">TOTAL ACTIF</td>
          <td style="padding: 16px; text-align: right; font-size: 16px; font-weight: 700;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalActif)}</td>
        </tr>
      </tbody>
    </table>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
      <thead>
        <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 14px 16px; text-align: left; font-size: 15px; font-weight: 600; color: #374151;">PASSIF</th>
          <th style="padding: 14px 16px; text-align: right; font-size: 15px; font-weight: 600; color: #374151;">Montant (€)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Capitaux propres</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(capitauxPropres)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">Dettes</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(dettes)}</td>
        </tr>
        <tr style="background-color: #f0f9ff; border-top: 2px solid #0284c7;">
          <td style="padding: 16px; font-size: 16px; font-weight: 700; color: #1a1a1a;">TOTAL PASSIF</td>
          <td style="padding: 16px; text-align: right; font-size: 16px; font-weight: 700;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalPassif)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section-title">CONTRÔLES DE COHÉRENCE</div>
  <div style="max-width: 700px; margin: 0 auto 30px auto;">
    <div style="padding: 20px; background-color: ${equilibre ? '#f0fdf4' : '#fef2f2'}; border-radius: 8px; border-left: 4px solid ${equilibre ? '#059669' : '#dc2626'};">
      <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: 600; color: ${equilibre ? '#065f46' : '#991b1b'};">
        ${equilibre ? '✓ Équilibre du bilan vérifié' : '⚠ Alerte : Déséquilibre détecté'}
      </p>
      <p style="margin: 0; font-size: 14px; color: ${equilibre ? '#065f46' : '#991b1b'}; line-height: 1.6;">
        Actif = ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totalActif)} | Passif = ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totalPassif)}
      </p>
    </div>
  </div>

  <div style="max-width: 700px; margin: 20px auto; padding: 16px; background-color: #fef9e7; border-radius: 8px; border-left: 4px solid #f59e0b;">
    <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.6;">
      <strong>Note :</strong> Ce document est fourni à titre informatif. Il présente une synthèse simplifiée pour l'exercice ${selectedYear}. Outil d'aide à la gestion uniquement. Consultez votre expert-comptable pour tout usage fiscal ou juridique.
    </p>
  </div>

  ${footer}
</body>
</html>
      `;

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

      const fileName = `Liasse_Fiscale_${companyData.name.replace(/[^a-z0-9]/gi, '_')}_${selectedYear}.pdf`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdf.output('blob'));
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);

      showToast('PDF téléchargé', 'success');
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      showToast('Erreur lors de la génération du rapport', 'error');
    }
  };

  const exportCompteResultatDetaille = async () => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'exports_pdf')) {
      console.log('GATING_EXPORT_BLOCKED', { file: 'RapportsPage.tsx', feature: 'exports_pdf', name: 'CompteResultatDetaille', plan: entitlements.plan });
      showToast(getFeatureBlockedMessage('exports_pdf'), 'error');
      return;
    }

    try {
      if (!companyData) {
        showToast('Données entreprise introuvables', 'error');
        return;
      }

      showToast('Génération du PDF en cours...', 'success');

      const { data: expenseDocs } = await supabase
        .from('expense_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid');

      const { data: revenueDocs } = await supabase
        .from('revenue_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid');

      const expenseDocsInYear = expenseDocs?.filter((doc) => {
        const year = new Date(doc.invoice_date).getFullYear();
        return year === selectedYear;
      }) || [];

      const revenueDocsInYear = revenueDocs?.filter((doc) => {
        const year = new Date(doc.invoice_date).getFullYear();
        return year === selectedYear;
      }) || [];

      const chargesByCategory: Record<string, number> = {};
      const produitsByCategory: Record<string, number> = {};

      if (expenseDocsInYear.length > 0) {
        const { data: expenseLines } = await supabase
          .from('expense_lines')
          .select('amount_excl_vat, category_id, categories!expense_lines_category_id_fkey(name)')
          .in('document_id', expenseDocsInYear.map(d => d.id));

        if (expenseLines) {
          expenseLines.forEach((line: any) => {
            const categoryName = line.categories?.name || 'Non catégorisé';
            if (!chargesByCategory[categoryName]) {
              chargesByCategory[categoryName] = 0;
            }
            chargesByCategory[categoryName] += Number(line.amount_excl_vat);
          });
        }
      }

      if (revenueDocsInYear.length > 0) {
        const { data: revenueLines } = await supabase
          .from('revenue_lines')
          .select('amount_excl_vat, category_id, categories!revenue_lines_category_id_fkey(name)')
          .in('document_id', revenueDocsInYear.map(d => d.id));

        if (revenueLines) {
          revenueLines.forEach((line: any) => {
            const categoryName = line.categories?.name || 'Non catégorisé';
            if (!produitsByCategory[categoryName]) {
              produitsByCategory[categoryName] = 0;
            }
            produitsByCategory[categoryName] += Number(line.amount_excl_vat);
          });
        }
      }

      const totalProduits = Object.values(produitsByCategory).reduce((sum, val) => sum + val, 0);
      const totalCharges = Object.values(chargesByCategory).reduce((sum, val) => sum + val, 0);
      const resultat = totalProduits - totalCharges;

      const fiscalYearLabel = buildFiscalYearLabel(
        selectedYear,
        companyData.fiscal_year_start,
        companyData.fiscal_year_end
      );
      const generatedAt = formatGeneratedDate();
      const documentId = generateDocumentId(companyId!, selectedYear, 'CR_DETAILLE');

      const header = buildPdfHeader({
        companyName: companyData.name,
        legalForm: companyData.legal_form,
        siren: companyData.siren,
        siret: companyData.siret,
        address: companyData.address,
        vatRegime: companyData.vat_regime,
        fiscalYearLabel,
        reportTitle: "Compte de résultat détaillé",
      });

      const footer = buildPdfFooter({
        generatedAt,
        pageNumber: 1,
        documentId,
        version: 'V1',
      });

      const produitsRows = Object.entries(produitsByCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amount]) => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">${cat}</td>
            <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500; color: #059669;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}</td>
          </tr>
        `).join('');

      const chargesRows = Object.entries(chargesByCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amount]) => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px 16px; font-size: 14px; color: #1f2937;">${cat}</td>
            <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 500; color: #dc2626;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}</td>
          </tr>
        `).join('');

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Compte de résultat détaillé - ${companyData.name} - ${selectedYear}</title>
  ${buildPdfStyles()}
</head>
<body>
  ${header}

  <div class="section-title">PRODUITS</div>
  <div style="max-width: 700px; margin: 0 auto;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 14px 16px; text-align: left; font-size: 15px; font-weight: 600; color: #374151;">Catégorie</th>
          <th style="padding: 14px 16px; text-align: right; font-size: 15px; font-weight: 600; color: #374151;">Montant HT (€)</th>
        </tr>
      </thead>
      <tbody>
        ${produitsRows || '<tr><td colspan="2" style="padding: 16px; text-align: center; color: #6b7280;">Aucun produit</td></tr>'}
        <tr style="background-color: #f0fdf4; border-top: 2px solid #059669;">
          <td style="padding: 16px; font-size: 16px; font-weight: 700; color: #1a1a1a;">Sous-total Produits</td>
          <td style="padding: 16px; text-align: right; font-size: 16px; font-weight: 700; color: #059669;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalProduits)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section-title">CHARGES</div>
  <div style="max-width: 700px; margin: 0 auto;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 14px 16px; text-align: left; font-size: 15px; font-weight: 600; color: #374151;">Catégorie</th>
          <th style="padding: 14px 16px; text-align: right; font-size: 15px; font-weight: 600; color: #374151;">Montant HT (€)</th>
        </tr>
      </thead>
      <tbody>
        ${chargesRows || '<tr><td colspan="2" style="padding: 16px; text-align: center; color: #6b7280;">Aucune charge</td></tr>'}
        <tr style="background-color: #fef2f2; border-top: 2px solid #dc2626;">
          <td style="padding: 16px; font-size: 16px; font-weight: 700; color: #1a1a1a;">Sous-total Charges</td>
          <td style="padding: 16px; text-align: right; font-size: 16px; font-weight: 700; color: #dc2626;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalCharges)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section-title">RÉSULTAT</div>
  <div style="max-width: 700px; margin: 0 auto;">
    <table style="width: 100%; border-collapse: collapse;">
      <tbody>
        <tr style="background-color: #f9fafb; border: 2px solid #1a1a1a;">
          <td style="padding: 20px 16px; font-size: 18px; font-weight: 700; color: #1a1a1a;">Résultat de l'Exercice</td>
          <td style="padding: 20px 16px; text-align: right; font-size: 18px; font-weight: 700; color: ${resultat >= 0 ? '#059669' : '#dc2626'};">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(resultat)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${footer}
</body>
</html>
      `;

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

      const fileName = `Compte_Resultat_Detaille_${companyData.name.replace(/[^a-z0-9]/gi, '_')}_${selectedYear}.pdf`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdf.output('blob'));
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);

      showToast('PDF téléchargé', 'success');
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      showToast('Erreur lors de la génération du rapport', 'error');
    }
  };

  const exportCompteResultatSimplifie = async () => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'exports_pdf')) {
      console.log('GATING_EXPORT_BLOCKED', { file: 'RapportsPage.tsx', feature: 'exports_pdf', name: 'CompteResultatSimplifie', plan: entitlements.plan });
      showToast(getFeatureBlockedMessage('exports_pdf'), 'error');
      return;
    }

    try {
      if (!companyData) {
        showToast('Données entreprise introuvables', 'error');
        return;
      }

      showToast('Génération du PDF en cours...', 'success');

      const fiscalYearLabel = buildFiscalYearLabel(
        selectedYear,
        companyData.fiscal_year_start,
        companyData.fiscal_year_end
      );
      const generatedAt = formatGeneratedDate();
      const documentId = generateDocumentId(companyId!, selectedYear, 'CR_SIMPLIFIE');

      const header = buildPdfHeader({
        companyName: companyData.name,
        legalForm: companyData.legal_form,
        siren: companyData.siren,
        siret: companyData.siret,
        address: companyData.address,
        vatRegime: companyData.vat_regime,
        fiscalYearLabel,
        reportTitle: "Compte de résultat simplifié",
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
  <title>Compte de résultat simplifié - ${companyData.name} - ${selectedYear}</title>
  ${buildPdfStyles()}
</head>
<body>
  ${header}

  <div class="section-title">Résultats de l'Exercice ${selectedYear}</div>
  <div style="max-width: 600px; margin: 0 auto;">
    <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
      <thead>
        <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 16px; text-align: left; font-size: 16px; font-weight: 600; color: #374151;">Libellé</th>
          <th style="padding: 16px; text-align: right; font-size: 16px; font-weight: 600; color: #374151;">Montant (€)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 16px; font-size: 15px; color: #1f2937;">Total des Produits</td>
          <td style="padding: 16px; text-align: right; font-size: 15px; font-weight: 600; color: #059669;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(resultatData.produitsHT)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 16px; font-size: 15px; color: #1f2937;">Total des Charges</td>
          <td style="padding: 16px; text-align: right; font-size: 15px; font-weight: 600; color: #dc2626;">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(resultatData.chargesHT)}</td>
        </tr>
        <tr style="background-color: #f9fafb; border-top: 2px solid #1a1a1a;">
          <td style="padding: 20px 16px; font-size: 17px; font-weight: 700; color: #1a1a1a;">Résultat de l'Exercice</td>
          <td style="padding: 20px 16px; text-align: right; font-size: 17px; font-weight: 700; color: ${resultatData.resultatHT >= 0 ? '#059669' : '#dc2626'};">${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(resultatData.resultatHT)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${footer}
</body>
</html>
      `;

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

      const fileName = `Compte_Resultat_Simplifie_${companyData.name.replace(/[^a-z0-9]/gi, '_')}_${selectedYear}.pdf`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdf.output('blob'));
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);

      showToast('PDF téléchargé', 'success');
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      showToast('Erreur lors de la génération du rapport', 'error');
    }
  };

  const exportAGReport = async () => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'documents_ag')) {
      console.log('GATING_EXPORT_BLOCKED', { file: 'RapportsPage.tsx', feature: 'documents_ag', name: 'AGReport', plan: entitlements.plan });
      showToast(getFeatureBlockedMessage('documents_ag'), 'error');
      return;
    }

    try {
      if (!companyData) {
        showToast('Données entreprise introuvables', 'error');
        return;
      }

      showToast('Génération du PDF en cours...', 'success');

      const fiscalYearLabel = buildFiscalYearLabel(
        selectedYear,
        companyData.fiscal_year_start,
        companyData.fiscal_year_end
      );
      const generatedAt = formatGeneratedDate();
      const documentId = generateDocumentId(companyId!, selectedYear, 'AG');

      const header = buildPdfHeader({
        companyName: companyData.name,
        legalForm: companyData.legal_form,
        siren: companyData.siren,
        siret: companyData.siret,
        address: companyData.address,
        vatRegime: companyData.vat_regime,
        fiscalYearLabel,
        reportTitle: "Rapport d'Assemblée Générale",
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
  <title>Rapport d'Assemblée Générale - ${companyData.name} - ${selectedYear}</title>
  ${buildPdfStyles()}
</head>
<body>
  ${header}

  <div class="section-title">Identification de la Société</div>
  <div class="info-box">
    <div style="display: grid; grid-template-columns: 200px 1fr; gap: 12px; margin-bottom: 12px;">
      <div style="font-weight: 600; color: #6b7280;">Dénomination sociale :</div>
      <div>${companyData.name}</div>

      <div style="font-weight: 600; color: #6b7280;">Forme juridique :</div>
      <div>${companyData.legal_form || '-'}</div>

      <div style="font-weight: 600; color: #6b7280;">SIREN :</div>
      <div>${companyData.siren || '-'}</div>

      <div style="font-weight: 600; color: #6b7280;">SIRET :</div>
      <div>${companyData.siret || '-'}</div>

      <div style="font-weight: 600; color: #6b7280;">Adresse :</div>
      <div>${companyData.address || '-'}</div>

      <div style="font-weight: 600; color: #6b7280;">Pays :</div>
      <div>${companyData.country || '-'}</div>
    </div>
  </div>

  ${directors.length > 0 ? `
  <div class="section-title">Composition de la Direction</div>
  <table>
    <thead>
      <tr>
        <th>Nom</th>
        <th>Prénom</th>
        <th>Fonction</th>
      </tr>
    </thead>
    <tbody>
      ${directors.map(d => `
        <tr>
          <td>${d.last_name}</td>
          <td>${d.first_name}</td>
          <td>${d.role}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  ${shareholders.length > 0 ? `
  <div class="section-title">Répartition du Capital</div>
  <table>
    <thead>
      <tr>
        <th>Nom / Dénomination</th>
        <th>Type</th>
        <th class="text-right">Pourcentage</th>
        <th class="text-right">Montant</th>
      </tr>
    </thead>
    <tbody>
      ${shareholders.map(s => `
        <tr>
          <td>${s.name}</td>
          <td>${s.type === 'person' ? 'Personne physique' : 'Personne morale'}</td>
          <td class="text-right">${Number(s.ownership_percentage).toFixed(2)}%</td>
          <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(s.capital_amount)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  <div class="section-title">Résultats de l'Exercice ${selectedYear}</div>
  <div class="info-box">
    <div style="display: flex; justify-content: space-between; padding: 10px 0; font-size: 16px; border-bottom: 1px solid #e5e7eb;">
      <span>Total des Produits (HT)</span>
      <span class="font-bold">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(resultatData.produitsHT)}</span>
    </div>
    <div style="display: flex; justify-content: space-between; padding: 10px 0; font-size: 16px; border-bottom: 1px solid #e5e7eb;">
      <span>Total des Charges (HT)</span>
      <span class="font-bold">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(resultatData.chargesHT)}</span>
    </div>
    <div style="display: flex; justify-content: space-between; padding: 20px 0 10px 0; font-size: 18px; border-top: 2px solid #1a1a1a; margin-top: 10px;" class="${resultatData.resultatHT >= 0 ? 'highlight-positive' : 'highlight-negative'}">
      <span class="font-bold">Résultat de l'Exercice (HT)</span>
      <span class="font-bold">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(resultatData.resultatHT)}</span>
    </div>
  </div>

  <div class="section-title">Situation de la TVA ${selectedYear}</div>
  <div class="info-box">
    <div style="display: flex; justify-content: space-between; padding: 10px 0; font-size: 16px; border-bottom: 1px solid #e5e7eb;">
      <span>TVA Collectée</span>
      <span class="font-bold highlight-positive">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(tvaData.tvaCollectee)}</span>
    </div>
    <div style="display: flex; justify-content: space-between; padding: 10px 0; font-size: 16px; border-bottom: 1px solid #e5e7eb;">
      <span>TVA Déductible</span>
      <span class="font-bold highlight-negative">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(tvaData.tvaDeductible)}</span>
    </div>
    <div style="display: flex; justify-content: space-between; padding: 20px 0 10px 0; font-size: 18px; border-top: 2px solid #1a1a1a; margin-top: 10px;" class="${tvaData.soldeTVA >= 0 ? 'highlight-positive' : 'highlight-negative'}">
      <span class="font-bold">Solde TVA</span>
      <span class="font-bold">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(tvaData.soldeTVA)}</span>
    </div>
  </div>

  ${footer}
</body>
</html>
      `;

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
      const fileName = `Rapport_AG_${companyData.name.replace(/[^a-z0-9]/gi, '_')}_${selectedYear}.pdf`;

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
          reportType: 'ag_report',
          periodKey: String(selectedYear),
          documentId,
          blob: pdfBlob,
          fileName,
        });
        showToast('PDF archivé avec succès', 'success');
      } catch (archiveError) {
        console.warn('ARCHIVE_STORAGE_FAILED', {
          reportType: 'ag_report',
          companyId: companyId!,
          fiscalYear: selectedYear,
          periodKey: String(selectedYear),
          error: archiveError instanceof Error ? archiveError.message : String(archiveError),
        });
      }
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      showToast('Erreur lors de la génération du rapport', 'error');
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>Chargement...</p>
      </div>
    );
  }

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
            Rapports
          </h2>
          <p
            style={{
              margin: 0,
              color: '#6b7280',
              fontSize: '16px',
            }}
          >
            Documents comptables et juridiques générés automatiquement
          </p>
        </div>

        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#dbeafe',
            border: '1px solid #3b82f6',
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
                color: '#1e40af',
              }}
            >
              Documents générés à partir des écritures validées et payées
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: '#1e3a8a',
                lineHeight: '1.5',
              }}
            >
              Ces rapports sont fournis à titre informatif. Outil d'aide à la gestion uniquement.
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

        <div style={{ marginBottom: '32px' }}>
          <h3
            style={{
              margin: '0 0 20px 0',
              fontSize: '22px',
              fontWeight: '600',
              color: '#1a1a1a',
            }}
          >
            Rapports financiers
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '24px',
            }}
          >
            <div
              style={{
                padding: '24px',
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                border: '2px solid #d1fae5',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📈</div>
              <h4
                style={{
                  margin: '0 0 6px 0',
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#059669',
                }}
              >
                Compte de résultat
              </h4>
              <p
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                  minHeight: '20px',
                }}
              >
                Produits et charges de l'exercice
              </p>
              <button
                onClick={() => navigate(`/app/company/${companyId}/resultat`)}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: 'white',
                  backgroundColor: '#059669',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  marginBottom: '20px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#047857';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#059669';
                }}
              >
                Voir le rapport
              </button>
              <div
                style={{
                  borderTop: '1px solid #e5e7eb',
                  paddingTop: '16px',
                }}
              >
                <p
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Actions secondaires
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={exportCompteResultatSimplifie}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#059669',
                      backgroundColor: 'white',
                      border: '1px solid #059669',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f0fdf4';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                    }}
                  >
                    Générer Compte de Résultat (simplifié)
                  </button>
                  <button
                    onClick={exportCompteResultatDetaille}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#059669',
                      backgroundColor: 'white',
                      border: '1px solid #059669',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f0fdf4';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                    }}
                  >
                    Générer Compte de Résultat (détaillé)
                  </button>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '24px',
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                border: '2px solid #f3e8ff',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚖️</div>
              <h4
                style={{
                  margin: '0 0 6px 0',
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#7c3aed',
                }}
              >
                Bilan
              </h4>
              <p
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                  minHeight: '20px',
                }}
              >
                Actif et passif de l'exercice
              </p>
              <button
                onClick={() => navigate(`/app/company/${companyId}/bilan`)}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: 'white',
                  backgroundColor: '#7c3aed',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  marginBottom: '20px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#6d28d9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#7c3aed';
                }}
              >
                Voir le rapport
              </button>
              <div
                style={{
                  borderTop: '1px solid #e5e7eb',
                  paddingTop: '16px',
                }}
              >
                <p
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Actions secondaires
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={exportBilanSimplifie}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#7c3aed',
                      backgroundColor: 'white',
                      border: '1px solid #7c3aed',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#faf5ff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                    }}
                  >
                    Générer Bilan (simplifié)
                  </button>
                  <button
                    onClick={exportBilanDetaille}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#7c3aed',
                      backgroundColor: 'white',
                      border: '1px solid #7c3aed',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#faf5ff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                    }}
                  >
                    Générer Bilan (détaillé)
                  </button>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '24px',
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                border: '2px solid #fed7aa',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
              <h4
                style={{
                  margin: '0 0 6px 0',
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#ea580c',
                }}
              >
                Liasse fiscale
              </h4>
              <p
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                  minHeight: '20px',
                }}
              >
                Synthèse complète de l'exercice
              </p>
              <button
                onClick={exportLiasseFiscale}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: 'white',
                  backgroundColor: '#ea580c',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  marginBottom: '20px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#c2410c';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ea580c';
                }}
              >
                Générer Liasse fiscale (simplifiée)
              </button>
              <div
                style={{
                  borderTop: '1px solid #e5e7eb',
                  paddingTop: '16px',
                }}
              >
                <p
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Actions secondaires
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    disabled
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#9ca3af',
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      cursor: 'not-allowed',
                      textAlign: 'left',
                      opacity: 0.6,
                    }}
                    title="Disponible prochainement"
                  >
                    Liasse détaillée (prochainement)
                  </button>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '24px',
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                border: '2px solid #dbeafe',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📊</div>
              <h4
                style={{
                  margin: '0 0 6px 0',
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#3b82f6',
                }}
              >
                TVA
              </h4>
              <p
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                  minHeight: '20px',
                }}
              >
                Synthèse mensuelle et annuelle
              </p>
              <button
                onClick={() => navigate(`/app/company/${companyId}/tva`)}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: 'white',
                  backgroundColor: '#3b82f6',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  marginBottom: '20px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                }}
              >
                Voir les exports
              </button>
              <div
                style={{
                  borderTop: '1px solid #e5e7eb',
                  paddingTop: '16px',
                }}
              >
                <p
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Actions secondaires
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={exportTVAAnnuelle}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#3b82f6',
                      backgroundColor: 'white',
                      border: '1px solid #3b82f6',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#eff6ff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                    }}
                  >
                    Générer TVA (annuelle)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3
            style={{
              margin: '0 0 20px 0',
              fontSize: '22px',
              fontWeight: '600',
              color: '#1a1a1a',
            }}
          >
            Rapports Juridiques
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '20px',
            }}
          >
            <div
              style={{
                padding: '28px',
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                border: '2px solid #fef3c7',
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>📄</div>
              <h4
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#f59e0b',
                }}
              >
                Rapport d'Assemblée Générale
              </h4>
              <p
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  lineHeight: '1.5',
                }}
              >
                Synthèse annuelle avec identité, dirigeants, associés et résultats
              </p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={exportAGReport}
                  style={{
                    padding: '10px 16px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: 'white',
                    backgroundColor: '#f59e0b',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#d97706';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f59e0b';
                  }}
                >
                  Générer PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {toast.show && (
        <Toast message={toast.message} type={toast.type} onClose={closeToast} />
      )}
    </div>
  );
}
