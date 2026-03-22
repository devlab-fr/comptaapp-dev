import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import BackButton from '../components/BackButton';
import Toast from '../components/Toast';
import AIAssistant from '../components/AIAssistant';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { downloadCSV, generateCSVContentExcelFR, formatCurrencyExcelFR } from '../utils/csvExport';
import { buildPdfHeader, buildPdfFooter, buildPdfStyles, formatGeneratedDate, buildFiscalYearLabel, generateDocumentId } from '../utils/pdfTemplate';
import { savePdfToStorage } from '../utils/pdfArchive';
import { useEntitlements } from '../billing/useEntitlements';
import { convertEntitlementsPlanToTier, hasFeature } from '../billing/planRules';

interface ResultatData {
  produitsHT: number;
  chargesHT: number;
  resultatHT: number;
}

interface CategoryDetail {
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  totalHT: number;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

export default function CompteDeResultatPage() {
  const { companyId } = useParams<{ companyId: string }>();
  useAuth();
  const navigate = useNavigate();
  const entitlements = useEntitlements();
  const planTier = convertEntitlementsPlanToTier(entitlements.plan);
  const hasProAccess = hasFeature(planTier, 'transactions_unlimited');

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [resultatData, setResultatData] = useState<ResultatData>({
    produitsHT: 0,
    chargesHT: 0,
    resultatHT: 0,
  });
  const [produitsDetails, setProduitsDetails] = useState<CategoryDetail[]>([]);
  const [chargesDetails, setChargesDetails] = useState<CategoryDetail[]>([]);
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
  const [showDetails, setShowDetails] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type });
  };

  const closeToast = () => {
    setToast({ show: false, message: '', type: 'success' });
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
    const loadResultatData = async () => {
      if (!companyId) return;

      if (!hasProAccess) {
        return;
      }

      setLoading(true);

      const { data: expenseDocs } = await supabase
        .from('expense_documents')
        .select('id, invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid')
        .eq('is_test', false);

      const { data: revenueDocs } = await supabase
        .from('revenue_documents')
        .select('id, invoice_date')
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

      let chargesHT = 0;
      let produitsHT = 0;

      const chargesMap: Map<string, CategoryDetail> = new Map();
      const produitsMap: Map<string, CategoryDetail> = new Map();

      if (expenseDocsInYear.length > 0) {
        const { data: expenseLines } = await supabase
          .from('expense_lines')
          .select('document_id, amount_excl_vat, category_id, subcategory_id')
          .in('document_id', expenseDocsInYear.map(d => d.id));

        if (expenseLines) {
          const categoryIds = [...new Set(expenseLines.map(l => l.category_id).filter(Boolean))];
          const subcategoryIds = [...new Set(expenseLines.map(l => l.subcategory_id).filter(Boolean))];

          const { data: categories } = await supabase
            .from('expense_categories')
            .select('id, name')
            .in('id', categoryIds);

          const { data: subcategories } = await supabase
            .from('expense_subcategories')
            .select('id, name')
            .in('id', subcategoryIds);

          const catMap = new Map(categories?.map(c => [c.id, c.name]) || []);
          const subCatMap = new Map(subcategories?.map(s => [s.id, s.name]) || []);

          expenseLines.forEach(line => {
            const amount = Number(line.amount_excl_vat);
            chargesHT += amount;

            const key = `${line.category_id}_${line.subcategory_id}`;
            const existing = chargesMap.get(key);

            if (existing) {
              existing.totalHT += amount;
            } else {
              chargesMap.set(key, {
                categoryId: line.category_id,
                categoryName: catMap.get(line.category_id) || 'Sans catégorie',
                subcategoryId: line.subcategory_id,
                subcategoryName: subCatMap.get(line.subcategory_id) || 'Sans sous-catégorie',
                totalHT: amount,
              });
            }
          });
        }
      }

      if (revenueDocsInYear.length > 0) {
        const { data: revenueLines } = await supabase
          .from('revenue_lines')
          .select('document_id, amount_excl_vat, category_id, subcategory_id')
          .in('document_id', revenueDocsInYear.map(d => d.id));

        if (revenueLines) {
          const categoryIds = [...new Set(revenueLines.map(l => l.category_id).filter(Boolean))];
          const subcategoryIds = [...new Set(revenueLines.map(l => l.subcategory_id).filter(Boolean))];

          const { data: categories } = await supabase
            .from('revenue_categories')
            .select('id, name')
            .in('id', categoryIds);

          const { data: subcategories } = await supabase
            .from('revenue_subcategories')
            .select('id, name')
            .in('id', subcategoryIds);

          const catMap = new Map(categories?.map(c => [c.id, c.name]) || []);
          const subCatMap = new Map(subcategories?.map(s => [s.id, s.name]) || []);

          revenueLines.forEach(line => {
            const amount = Number(line.amount_excl_vat);
            produitsHT += amount;

            const key = `${line.category_id}_${line.subcategory_id}`;
            const existing = produitsMap.get(key);

            if (existing) {
              existing.totalHT += amount;
            } else {
              produitsMap.set(key, {
                categoryId: line.category_id,
                categoryName: catMap.get(line.category_id) || 'Sans catégorie',
                subcategoryId: line.subcategory_id,
                subcategoryName: subCatMap.get(line.subcategory_id) || 'Sans sous-catégorie',
                totalHT: amount,
              });
            }
          });
        }
      }

      // Load catchup totals (rattrapage par totaux)
      const { data: catchupData } = await supabase
        .from('catchup_totals')
        .select('*')
        .eq('company_id', companyId)
        .eq('year', selectedYear);

      let catchupProduitsHT = 0;
      let catchupChargesHT = 0;

      if (catchupData) {
        for (const row of catchupData) {
          const ht = Number(row.total_ht) || 0;

          if (row.category_type === 'revenue') {
            catchupProduitsHT += ht;

            // Load category name
            const { data: revCat } = await supabase
              .from('revenue_categories')
              .select('name')
              .eq('id', row.category_id)
              .maybeSingle();

            const key = `catchup_${row.category_id}`;
            const existing = produitsMap.get(key);

            if (existing) {
              existing.totalHT += ht;
            } else {
              produitsMap.set(key, {
                categoryId: row.category_id,
                categoryName: revCat?.name || 'Rattrapage',
                subcategoryId: '',
                subcategoryName: 'Reprise historique',
                totalHT: ht,
              });
            }
          } else if (row.category_type === 'expense') {
            catchupChargesHT += ht;

            // Load category name
            const { data: expCat } = await supabase
              .from('expense_categories')
              .select('name')
              .eq('id', row.category_id)
              .maybeSingle();

            const key = `catchup_${row.category_id}`;
            const existing = chargesMap.get(key);

            if (existing) {
              existing.totalHT += ht;
            } else {
              chargesMap.set(key, {
                categoryId: row.category_id,
                categoryName: expCat?.name || 'Rattrapage',
                subcategoryId: '',
                subcategoryName: 'Reprise historique',
                totalHT: ht,
              });
            }
          }
        }
      }

      produitsHT += catchupProduitsHT;
      chargesHT += catchupChargesHT;

      const chargesArray = Array.from(chargesMap.values()).sort((a, b) => b.totalHT - a.totalHT);
      const produitsArray = Array.from(produitsMap.values()).sort((a, b) => b.totalHT - a.totalHT);

      chargesArray.forEach(item => {
        item.totalHT = Math.round(item.totalHT * 100) / 100;
      });

      produitsArray.forEach(item => {
        item.totalHT = Math.round(item.totalHT * 100) / 100;
      });

      setChargesDetails(chargesArray);
      setProduitsDetails(produitsArray);

      setResultatData({
        produitsHT: Math.round(produitsHT * 100) / 100,
        chargesHT: Math.round(chargesHT * 100) / 100,
        resultatHT: Math.round((produitsHT - chargesHT) * 100) / 100,
      });

      setLoading(false);
    };

    loadResultatData();
  }, [companyId, selectedYear, hasProAccess]);

  const exportSimpleCSV = async () => {
    if (!hasProAccess) {
      showToast('Fonction disponible en version Pro', 'error');
      return;
    }

    try {
      const headers = ['Entreprise', 'Année', 'Type', 'Montant HT (EUR)'];
      const rows = [
        [companyName, String(selectedYear), 'Total Produits HT', `="${formatCurrencyExcelFR(resultatData.produitsHT)}"`],
        [companyName, String(selectedYear), 'Total Charges HT', `="${formatCurrencyExcelFR(resultatData.chargesHT)}"`],
        [companyName, String(selectedYear), 'Résultat HT', `="${formatCurrencyExcelFR(resultatData.resultatHT)}"`],
      ];

      const csvContent = generateCSVContentExcelFR(headers, rows);
      const filename = `Compte_Resultat_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedYear}_Simple.csv`;

      downloadCSV(filename, csvContent);
      showToast('Export CSV simplifié généré', 'success');
    } catch (error) {
      showToast('Erreur lors de l\'export CSV', 'error');
    }
  };

  const exportDetailedCSV = async () => {
    if (!hasProAccess) {
      showToast('Fonction disponible en version Pro', 'error');
      return;
    }

    try {
      const headers = ['Entreprise', 'Année', 'Section', 'Catégorie', 'Sous-catégorie', 'Montant HT (EUR)'];
      const rows: string[][] = [];

      rows.push([companyName, String(selectedYear), 'PRODUITS', '', '', '']);
      produitsDetails.forEach(item => {
        rows.push([companyName, String(selectedYear), 'Produits', item.categoryName, item.subcategoryName, `="${formatCurrencyExcelFR(item.totalHT)}"`]);
      });
      rows.push([companyName, String(selectedYear), '', '', 'Total Produits HT', `="${formatCurrencyExcelFR(resultatData.produitsHT)}"`]);
      rows.push([companyName, String(selectedYear), '', '', '', '']);

      rows.push([companyName, String(selectedYear), 'CHARGES', '', '', '']);
      chargesDetails.forEach(item => {
        rows.push([companyName, String(selectedYear), 'Charges', item.categoryName, item.subcategoryName, `="${formatCurrencyExcelFR(item.totalHT)}"`]);
      });
      rows.push([companyName, String(selectedYear), '', '', 'Total Charges HT', `="${formatCurrencyExcelFR(resultatData.chargesHT)}"`]);
      rows.push([companyName, String(selectedYear), '', '', '', '']);

      rows.push([companyName, String(selectedYear), 'RÉSULTAT', '', '', '']);
      rows.push([companyName, String(selectedYear), '', '', 'Résultat HT', `="${formatCurrencyExcelFR(resultatData.resultatHT)}"`]);

      const csvContent = generateCSVContentExcelFR(headers, rows);
      const filename = `Compte_Resultat_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedYear}_Detail.csv`;

      downloadCSV(filename, csvContent);
      showToast('Export CSV détaillé généré', 'success');
    } catch (error) {
      showToast('Erreur lors de l\'export CSV détaillé', 'error');
    }
  };

  const exportPDF = async () => {
    if (!hasProAccess) {
      showToast('Fonction disponible en version Pro', 'error');
      return;
    }

    try {
      if (!companyData) {
        showToast('Données entreprise non chargées', 'error');
        return;
      }

      showToast('Génération du PDF en cours...', 'success');

      const fiscalYearLabel = buildFiscalYearLabel(selectedYear, companyData.fiscal_year_start, companyData.fiscal_year_end);
      const generatedAt = formatGeneratedDate();
      const documentId = generateDocumentId(companyId!, selectedYear, 'RESULTAT');

      const header = buildPdfHeader({
        companyName: companyData.name,
        legalForm: companyData.legal_form,
        siren: companyData.siren,
        siret: companyData.siret,
        address: companyData.address,
        fiscalYearLabel,
        reportTitle: 'Compte de Résultat',
      });

      const footer = buildPdfFooter({
        generatedAt,
        pageNumber: 1,
        documentId,
        version: 'V1',
      });

      const resultatLabel = resultatData.resultatHT >= 0 ? 'Résultat bénéficiaire' : 'Résultat déficitaire';
      const resultatColor = resultatData.resultatHT >= 0 ? '#059669' : '#dc2626';
      const resultatBgColor = resultatData.resultatHT >= 0 ? '#d1fae5' : '#fee2e2';

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Compte de Résultat - ${companyData.name} - ${selectedYear}</title>
  ${buildPdfStyles()}
</head>
<body>
  ${header}

  <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
    <p style="margin: 0; font-size: 13px; color: #1e40af; font-weight: 500;">
      <strong>Document de gestion interne</strong> — Ce document ne constitue pas un document fiscal officiel.
    </p>
  </div>

  <div class="section-title">Produits d'exploitation</div>
  <table>
    <thead>
      <tr>
        <th>Catégorie</th>
        <th class="text-right">Montant HT (EUR)</th>
      </tr>
    </thead>
    <tbody>
      ${produitsDetails.length > 0 ? produitsDetails.map(detail => `
        <tr>
          <td>${detail.categoryName} - ${detail.subcategoryName}</td>
          <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(detail.totalHT)}</td>
        </tr>
      `).join('') : `
        <tr>
          <td>Ventes et prestations</td>
          <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(resultatData.produitsHT)}</td>
        </tr>
      `}
      <tr style="background-color: #f9fafb; font-weight: 600;">
        <td class="font-bold">Total des produits</td>
        <td class="text-right highlight-positive">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(resultatData.produitsHT)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">Charges d'exploitation</div>
  <table>
    <thead>
      <tr>
        <th>Catégorie</th>
        <th class="text-right">Montant HT (EUR)</th>
      </tr>
    </thead>
    <tbody>
      ${chargesDetails.length > 0 ? chargesDetails.map(detail => `
        <tr>
          <td>${detail.categoryName} - ${detail.subcategoryName}</td>
          <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(detail.totalHT)}</td>
        </tr>
      `).join('') : `
        <tr>
          <td>Achats et charges externes</td>
          <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(resultatData.chargesHT)}</td>
        </tr>
      `}
      <tr style="background-color: #f9fafb; font-weight: 600;">
        <td class="font-bold">Total des charges</td>
        <td class="text-right">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(resultatData.chargesHT)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">Résultat d'exploitation</div>
  <table>
    <tbody>
      <tr style="background-color: #f9fafb; font-weight: 600;">
        <td class="font-bold" style="font-size: 16px;">Résultat de l'exercice ${selectedYear}</td>
        <td class="text-right" style="font-size: 16px; color: ${resultatColor}; font-weight: 700;">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(resultatData.resultatHT)}</td>
      </tr>
    </tbody>
  </table>

  <div style="margin: 32px 0;">
    <div style="background-color: ${resultatBgColor}; border-left: 4px solid ${resultatColor}; padding: 20px; border-radius: 4px;">
      <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: #1a1a1a;">${resultatLabel}</p>
      <p style="margin: 0; font-size: 14px; color: #374151;">
        ${resultatData.resultatHT >= 0 ? 'L\'entreprise a dégagé un bénéfice sur l\'exercice.' : 'L\'entreprise présente une perte sur l\'exercice.'}
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

      const pdfBlob = pdf.output('blob');
      const fileName = `Compte_Resultat_${companyData.name.replace(/[^a-z0-9]/gi, '_')}_${selectedYear}.pdf`;

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
          reportType: 'income_statement',
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
      showToast('Erreur lors de la génération du PDF', 'error');
    }
  };

  const hasData = resultatData.produitsHT !== 0 || resultatData.chargesHT !== 0;

  if (!hasProAccess) {
    return (
      <>
        <div style={{ backgroundColor: '#f8f9fa', minHeight: '100%' }}>
          <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
          <BackButton to={`/app/company/${companyId}`} />

          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: '700', color: '#1a1a1a' }}>
              Compte de Résultat
            </h2>
            <p style={{ margin: 0, fontSize: '16px', color: '#6b7280' }}>
              Résultat d'exploitation de l'exercice
            </p>
          </div>

          <div
            style={{
              backgroundColor: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '8px',
              padding: '24px',
              marginTop: '24px',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: '600', color: '#92400e' }}>
              Fonction disponible en version PRO
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#92400e' }}>
              Cette fonctionnalité est disponible à partir de la version Pro.
            </p>
            <button
              onClick={() => navigate(`/app/company/${companyId}/subscription`)}
              style={{
                backgroundColor: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Passer à la version PRO
            </button>
          </div>
        </main>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ backgroundColor: '#f8f9fa', minHeight: '100%' }}>
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
            Compte de Résultat
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
              Montants en Hors Taxes uniquement
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: '#1e3a8a',
                lineHeight: '1.5',
              }}
            >
              Ce compte de résultat affiche uniquement les montants HT des documents validés et payés.
              La TVA est totalement exclue de ces calculs.
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
              border: '2px solid #d1fae5',
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
                  backgroundColor: '#d1fae5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                }}
              >
                💰
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
                  Total Produits
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '12px',
                    color: '#9ca3af',
                  }}
                >
                  Hors Taxes
                </p>
              </div>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '36px',
                fontWeight: '700',
                color: loading ? '#9ca3af' : '#059669',
              }}
            >
              {loading
                ? '...'
                : new Intl.NumberFormat('fr-FR', {
                    style: 'currency',
                    currency: 'EUR',
                  }).format(resultatData.produitsHT)}
            </p>
          </div>

          <div
            style={{
              padding: '24px',
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
              border: '2px solid #fee2e2',
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
                📊
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
                  Total Charges
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '12px',
                    color: '#9ca3af',
                  }}
                >
                  Hors Taxes
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
                  }).format(resultatData.chargesHT)}
            </p>
          </div>

          <div
            style={{
              padding: '24px',
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
              border: `2px solid ${resultatData.resultatHT >= 0 ? '#dbeafe' : '#fef3c7'}`,
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
                  backgroundColor: resultatData.resultatHT >= 0 ? '#dbeafe' : '#fef3c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                }}
              >
                {resultatData.resultatHT >= 0 ? '✓' : '⚠️'}
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
                  Résultat
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '12px',
                    color: '#9ca3af',
                  }}
                >
                  {resultatData.resultatHT >= 0 ? 'Bénéfice' : 'Perte'}
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
                  : resultatData.resultatHT >= 0
                  ? '#3b82f6'
                  : '#f59e0b',
              }}
            >
              {loading
                ? '...'
                : new Intl.NumberFormat('fr-FR', {
                    style: 'currency',
                    currency: 'EUR',
                  }).format(Math.abs(resultatData.resultatHT))}
            </p>
          </div>
        </div>

        {!hasData && !loading && (
          <div
            style={{
              padding: '80px 32px',
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
              textAlign: 'center',
              marginBottom: '32px',
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
              <span style={{ fontSize: '40px' }}>📄</span>
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
        )}

        {hasData && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '24px',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <button
                onClick={() => setShowDetails(!showDetails)}
                style={{
                  padding: '12px 24px',
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
                {showDetails ? 'Masquer le détail' : 'Voir le détail'}
              </button>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  onClick={exportSimpleCSV}
                  style={{
                    padding: '12px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#3b82f6',
                    backgroundColor: 'white',
                    border: '1px solid #3b82f6',
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
                  Export CSV Simple
                </button>

                <button
                  onClick={exportDetailedCSV}
                  style={{
                    padding: '12px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#3b82f6',
                    backgroundColor: 'white',
                    border: '1px solid #3b82f6',
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
                  Export CSV Détaillé
                </button>

                <button
                  onClick={exportPDF}
                  style={{
                    padding: '12px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'white',
                    backgroundColor: '#059669',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#047857';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#059669';
                  }}
                >
                  Export PDF
                </button>
              </div>
            </div>

            {showDetails && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                {produitsDetails.length > 0 && (
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
                      Détail des Produits (HT)
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
                              Catégorie
                            </th>
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
                              Sous-catégorie
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
                              Total HT
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {produitsDetails.map((item, index) => (
                            <tr
                              key={index}
                              style={{
                                borderBottom: '1px solid #e5e7eb',
                              }}
                            >
                              <td
                                style={{
                                  padding: '12px 16px',
                                  fontSize: '14px',
                                  color: '#374151',
                                }}
                              >
                                {item.categoryName}
                              </td>
                              <td
                                style={{
                                  padding: '12px 16px',
                                  fontSize: '14px',
                                  color: '#374151',
                                }}
                              >
                                {item.subcategoryName}
                              </td>
                              <td
                                style={{
                                  padding: '12px 16px',
                                  fontSize: '14px',
                                  color: '#059669',
                                  textAlign: 'right',
                                  fontWeight: '600',
                                }}
                              >
                                {new Intl.NumberFormat('fr-FR', {
                                  style: 'currency',
                                  currency: 'EUR',
                                }).format(item.totalHT)}
                              </td>
                            </tr>
                          ))}
                          <tr
                            style={{
                              backgroundColor: '#f9fafb',
                              borderTop: '2px solid #1a1a1a',
                            }}
                          >
                            <td
                              colSpan={2}
                              style={{
                                padding: '12px 16px',
                                fontSize: '16px',
                                fontWeight: '700',
                                color: '#1a1a1a',
                              }}
                            >
                              Total Produits HT
                            </td>
                            <td
                              style={{
                                padding: '12px 16px',
                                fontSize: '16px',
                                color: '#059669',
                                textAlign: 'right',
                                fontWeight: '700',
                              }}
                            >
                              {new Intl.NumberFormat('fr-FR', {
                                style: 'currency',
                                currency: 'EUR',
                              }).format(resultatData.produitsHT)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {chargesDetails.length > 0 && (
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
                      Détail des Charges (HT)
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
                              Catégorie
                            </th>
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
                              Sous-catégorie
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
                              Total HT
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {chargesDetails.map((item, index) => (
                            <tr
                              key={index}
                              style={{
                                borderBottom: '1px solid #e5e7eb',
                              }}
                            >
                              <td
                                style={{
                                  padding: '12px 16px',
                                  fontSize: '14px',
                                  color: '#374151',
                                }}
                              >
                                {item.categoryName}
                              </td>
                              <td
                                style={{
                                  padding: '12px 16px',
                                  fontSize: '14px',
                                  color: '#374151',
                                }}
                              >
                                {item.subcategoryName}
                              </td>
                              <td
                                style={{
                                  padding: '12px 16px',
                                  fontSize: '14px',
                                  color: '#dc2626',
                                  textAlign: 'right',
                                  fontWeight: '600',
                                }}
                              >
                                {new Intl.NumberFormat('fr-FR', {
                                  style: 'currency',
                                  currency: 'EUR',
                                }).format(item.totalHT)}
                              </td>
                            </tr>
                          ))}
                          <tr
                            style={{
                              backgroundColor: '#f9fafb',
                              borderTop: '2px solid #1a1a1a',
                            }}
                          >
                            <td
                              colSpan={2}
                              style={{
                                padding: '12px 16px',
                                fontSize: '16px',
                                fontWeight: '700',
                                color: '#1a1a1a',
                              }}
                            >
                              Total Charges HT
                            </td>
                            <td
                              style={{
                                padding: '12px 16px',
                                fontSize: '16px',
                                color: '#dc2626',
                                textAlign: 'right',
                                fontWeight: '700',
                              }}
                            >
                              {new Intl.NumberFormat('fr-FR', {
                                style: 'currency',
                                currency: 'EUR',
                              }).format(resultatData.chargesHT)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <AIAssistant
        context="compte-resultat"
        data={{
          produitsHT: resultatData.produitsHT,
          chargesHT: resultatData.chargesHT,
          resultatHT: resultatData.resultatHT,
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
      </div>
    </>
  );
}
