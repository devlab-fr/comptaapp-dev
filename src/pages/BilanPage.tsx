import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import BackButton from '../components/BackButton';
import Toast from '../components/Toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { downloadCSV, generateCSVContentExcelFR, formatCurrencyExcelFR } from '../utils/csvExport';
import { buildPdfHeader, buildPdfFooter, buildPdfStyles, formatGeneratedDate, buildFiscalYearLabel, generateDocumentId } from '../utils/pdfTemplate';
import { savePdfToStorage } from '../utils/pdfArchive';
import { useEntitlements } from '../billing/useEntitlements';
import { hasFeature, getFeatureBlockedMessage, convertEntitlementsPlanToTier } from '../billing/planRules';

interface BilanData {
  actif: {
    tresorerie: number;
    creancesClients: number;
    autresActifs: number;
    total: number;
  };
  passif: {
    dettesFournisseurs: number;
    dettesFiscales: number;
    resultatExercice: number;
    total: number;
  };
  equilibre: boolean;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

export default function BilanPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const entitlements = useEntitlements();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [bilanData, setBilanData] = useState<BilanData>({
    actif: {
      tresorerie: 0,
      creancesClients: 0,
      autresActifs: 0,
      total: 0,
    },
    passif: {
      dettesFournisseurs: 0,
      dettesFiscales: 0,
      resultatExercice: 0,
      total: 0,
    },
    equilibre: true,
  });
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
        .eq('payment_status', 'paid')
        .eq('is_test', false);

      const { data: revenueDocs } = await supabase
        .from('revenue_documents')
        .select('invoice_date')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid')
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
    };

    loadAvailableYears();
  }, [companyId]);

  useEffect(() => {
    const loadBilanData = async () => {
      if (!companyId) return;

      setLoading(true);

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

      // Load opening entries (reprise d'ouverture)
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

      // Load catchup totals (rattrapage par totaux)
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

      setBilanData({
        actif: {
          tresorerie: Math.round(tresorerie * 100) / 100,
          creancesClients: Math.round(openingCreances * 100) / 100,
          autresActifs: 0,
          total: Math.round(actifTotal * 100) / 100,
        },
        passif: {
          dettesFournisseurs: Math.round(openingDettes * 100) / 100,
          dettesFiscales: Math.round(tvaNette * 100) / 100,
          resultatExercice: Math.round(resultatHT * 100) / 100,
          total: Math.round(passifTotal * 100) / 100,
        },
        equilibre,
      });

      setLoading(false);
    };

    loadBilanData();
  }, [companyId, selectedYear]);

  const exportCSV = async () => {
    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'exports_csv')) {
      showToast(getFeatureBlockedMessage('exports_csv'), 'error');
      return;
    }

    try {
      const headers = ['Section', 'Libellé', 'Montant (EUR)'];
      const rows: string[][] = [];

      rows.push(['ACTIF', '', '']);
      rows.push(['Actif', 'Trésorerie', `="${formatCurrencyExcelFR(bilanData.actif.tresorerie)}"`]);
      rows.push(['Actif', 'Créances clients', `="${formatCurrencyExcelFR(bilanData.actif.creancesClients)}"`]);
      rows.push(['Actif', 'Autres actifs', `="${formatCurrencyExcelFR(bilanData.actif.autresActifs)}"`]);
      rows.push(['', 'Total Actif', `="${formatCurrencyExcelFR(bilanData.actif.total)}"`]);
      rows.push(['', '', '']);

      rows.push(['PASSIF', '', '']);
      rows.push(['Passif', 'Résultat de l\'exercice (HT)', `="${formatCurrencyExcelFR(bilanData.passif.resultatExercice)}"`]);
      rows.push(['Passif', 'TVA nette à payer/rembourser', `="${formatCurrencyExcelFR(bilanData.passif.dettesFiscales)}"`]);
      rows.push(['Passif', 'Dettes fournisseurs', `="${formatCurrencyExcelFR(bilanData.passif.dettesFournisseurs)}"`]);
      rows.push(['', 'Total Passif', `="${formatCurrencyExcelFR(bilanData.passif.total)}"`]);
      rows.push(['', '', '']);

      rows.push(['', 'Équilibre', bilanData.equilibre ? 'OK' : 'DÉSÉQUILIBRE']);

      const csvContent = generateCSVContentExcelFR(headers, rows);
      const filename = `Bilan_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedYear}.csv`;

      downloadCSV(filename, csvContent);
      showToast('Export CSV généré', 'success');
    } catch (error) {
      showToast('Erreur lors de l\'export CSV', 'error');
    }
  };

  const exportPDF = async () => {
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

      showToast('Génération du PDF en cours...', 'success');

      const fiscalYearLabel = buildFiscalYearLabel(selectedYear, companyData.fiscal_year_start, companyData.fiscal_year_end);
      const generatedAt = formatGeneratedDate();
      const documentId = generateDocumentId(companyId!, selectedYear, 'BILAN');

      const header = buildPdfHeader({
        companyName: companyData.name,
        legalForm: companyData.legal_form,
        siren: companyData.siren,
        siret: companyData.siret,
        address: companyData.address,
        fiscalYearLabel,
        reportTitle: 'Bilan',
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
  <title>Bilan - ${companyData.name} - ${selectedYear}</title>
  ${buildPdfStyles()}
  <style>
    .disclaimer {
      margin: 20px 0 40px;
      padding: 16px 20px;
      background: #fef3c7;
      border: 2px solid #f59e0b;
      border-radius: 8px;
      text-align: center;
    }
    .disclaimer p {
      font-size: 14px;
      color: #92400e;
      font-weight: 600;
    }
    .bilan-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin: 40px 0;
    }
    .bilan-section {
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 24px;
      background: #f9fafb;
    }
    .bilan-section-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 20px;
      color: #1a1a1a;
      padding-bottom: 10px;
      border-bottom: 2px solid #3b82f6;
    }
    .line-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 14px;
    }
    .line-item:last-of-type {
      border-bottom: none;
    }
    .line-item .label {
      color: #374151;
    }
    .line-item .amount {
      font-weight: 600;
      color: #1a1a1a;
    }
    .total {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 2px solid #1a1a1a;
      display: flex;
      justify-content: space-between;
      font-weight: 700;
      font-size: 16px;
    }
    .balance-check {
      margin-top: 40px;
      padding: 20px;
      text-align: center;
      border-radius: 12px;
      font-weight: 700;
      font-size: 18px;
    }
    .balance-check.ok {
      background: #d1fae5;
      color: #065f46;
      border: 2px solid #059669;
    }
    .balance-check.error {
      background: #fee2e2;
      color: #991b1b;
      border: 2px solid #dc2626;
    }
    @media print {
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  ${header}

  <div class="disclaimer">
    <p>⚠️ Document informatif – Ne remplace pas un expert-comptable</p>
  </div>

  <div class="bilan-container">
    <div class="bilan-section">
      <div class="bilan-section-title">ACTIF</div>

      <div class="line-item">
        <span class="label">Trésorerie</span>
        <span class="amount">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(bilanData.actif.tresorerie)}</span>
      </div>

      <div class="line-item">
        <span class="label">Créances clients</span>
        <span class="amount">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(bilanData.actif.creancesClients)}</span>
      </div>

      <div class="line-item">
        <span class="label">Autres actifs</span>
        <span class="amount">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(bilanData.actif.autresActifs)}</span>
      </div>

      <div class="total">
        <span>Total Actif</span>
        <span>${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(bilanData.actif.total)}</span>
      </div>
    </div>

    <div class="bilan-section">
      <div class="bilan-section-title">PASSIF</div>

      <div class="line-item">
        <span class="label">Résultat de l'exercice (HT)</span>
        <span class="amount">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(bilanData.passif.resultatExercice)}</span>
      </div>

      <div class="line-item">
        <span class="label">TVA nette à payer/rembourser</span>
        <span class="amount">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(bilanData.passif.dettesFiscales)}</span>
      </div>

      <div class="line-item">
        <span class="label">Dettes fournisseurs</span>
        <span class="amount">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(bilanData.passif.dettesFournisseurs)}</span>
      </div>

      <div class="total">
        <span>Total Passif</span>
        <span>${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(bilanData.passif.total)}</span>
      </div>
    </div>
  </div>

  <div class="balance-check ${bilanData.equilibre ? 'ok' : 'error'}">
    ${bilanData.equilibre ? '✓ Bilan équilibré (Actif = Passif)' : '⚠️ Déséquilibre détecté (Actif ≠ Passif)'}
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
      const fileName = `Bilan_${companyData.name.replace(/[^a-z0-9]/gi, '_')}_${selectedYear}.pdf`;

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
          reportType: 'balance_sheet',
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

  const hasData = bilanData.actif.total !== 0 || bilanData.passif.total !== 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', overflowX: 'hidden' }}>
      <AppHeader subtitle={user?.email} onSignOut={handleSignOut} />

      <main
        style={{
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          padding: '32px 16px',
          boxSizing: 'border-box',
          overflowX: 'hidden',
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
            Bilan
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
            padding: '16px',
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            marginBottom: '32px',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div>
            <p
              style={{
                margin: '0 0 4px 0',
                fontSize: '14px',
                fontWeight: '600',
                color: '#92400e',
              }}
            >
              Document informatif – Ne remplace pas un expert-comptable
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: '#78350f',
                lineHeight: '1.5',
              }}
            >
              Ce bilan est calculé automatiquement à partir des documents validés et payés.
              Outil d'aide à la gestion – Consultez un expert-comptable pour tout usage fiscal ou juridique.
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

        {!hasData && !loading && (
          <div
            style={{
              padding: '80px 32px',
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
              textAlign: 'center',
              marginBottom: '32px',
              maxWidth: '100%',
              boxSizing: 'border-box',
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
        )}

        {hasData && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
                gap: '16px',
                marginBottom: '32px',
                maxWidth: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                  border: '2px solid #e5e7eb',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <h3
                  style={{
                    margin: '0 0 24px 0',
                    fontSize: '20px',
                    fontWeight: '600',
                    color: '#1a1a1a',
                    paddingBottom: '12px',
                    borderBottom: '2px solid #3b82f6',
                  }}
                >
                  ACTIF
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <span style={{ color: '#374151', fontSize: '14px' }}>Trésorerie</span>
                    <span style={{ fontWeight: '600', color: '#1a1a1a', fontSize: '14px' }}>
                      {new Intl.NumberFormat('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(bilanData.actif.tresorerie)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <span style={{ color: '#374151', fontSize: '14px' }}>Créances clients</span>
                    <span style={{ fontWeight: '600', color: '#1a1a1a', fontSize: '14px' }}>
                      {new Intl.NumberFormat('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(bilanData.actif.creancesClients)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <span style={{ color: '#374151', fontSize: '14px' }}>Autres actifs</span>
                    <span style={{ fontWeight: '600', color: '#1a1a1a', fontSize: '14px' }}>
                      {new Intl.NumberFormat('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(bilanData.actif.autresActifs)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '16px 0',
                      borderTop: '2px solid #1a1a1a',
                      marginTop: '8px',
                    }}
                  >
                    <span style={{ fontWeight: '700', color: '#1a1a1a', fontSize: '16px' }}>
                      Total Actif
                    </span>
                    <span style={{ fontWeight: '700', color: '#1a1a1a', fontSize: '16px' }}>
                      {new Intl.NumberFormat('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(bilanData.actif.total)}
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                  border: '2px solid #e5e7eb',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <h3
                  style={{
                    margin: '0 0 24px 0',
                    fontSize: '20px',
                    fontWeight: '600',
                    color: '#1a1a1a',
                    paddingBottom: '12px',
                    borderBottom: '2px solid #3b82f6',
                  }}
                >
                  PASSIF
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <span style={{ color: '#374151', fontSize: '14px' }}>
                      Résultat de l'exercice (HT)
                    </span>
                    <span style={{ fontWeight: '600', color: '#1a1a1a', fontSize: '14px' }}>
                      {new Intl.NumberFormat('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(bilanData.passif.resultatExercice)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <span style={{ color: '#374151', fontSize: '14px' }}>
                      TVA nette à payer/rembourser
                    </span>
                    <span style={{ fontWeight: '600', color: '#1a1a1a', fontSize: '14px' }}>
                      {new Intl.NumberFormat('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(bilanData.passif.dettesFiscales)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <span style={{ color: '#374151', fontSize: '14px' }}>Dettes fournisseurs</span>
                    <span style={{ fontWeight: '600', color: '#1a1a1a', fontSize: '14px' }}>
                      {new Intl.NumberFormat('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(bilanData.passif.dettesFournisseurs)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '16px 0',
                      borderTop: '2px solid #1a1a1a',
                      marginTop: '8px',
                    }}
                  >
                    <span style={{ fontWeight: '700', color: '#1a1a1a', fontSize: '16px' }}>
                      Total Passif
                    </span>
                    <span style={{ fontWeight: '700', color: '#1a1a1a', fontSize: '16px' }}>
                      {new Intl.NumberFormat('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(bilanData.passif.total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '20px',
                backgroundColor: bilanData.equilibre ? '#d1fae5' : '#fee2e2',
                border: `2px solid ${bilanData.equilibre ? '#059669' : '#dc2626'}`,
                borderRadius: '12px',
                textAlign: 'center',
                marginBottom: '32px',
                maxWidth: '100%',
                boxSizing: 'border-box',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '700',
                  color: bilanData.equilibre ? '#065f46' : '#991b1b',
                }}
              >
                {bilanData.equilibre
                  ? '✓ Bilan équilibré (Actif = Passif)'
                  : '⚠️ Déséquilibre détecté (Actif ≠ Passif)'}
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                justifyContent: 'center',
                maxWidth: '100%',
                boxSizing: 'border-box',
              }}
            >
              <button
                onClick={exportCSV}
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
                Export CSV
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
          </>
        )}
      </main>

      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}
    </div>
  );
}
