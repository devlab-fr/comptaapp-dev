import { supabase } from '../lib/supabase';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  buildPdfHeader,
  buildPdfFooter,
  buildPdfStyles,
  formatGeneratedDate,
  buildFiscalYearLabel,
  generateDocumentId,
} from './pdfTemplate';
import { savePdfToStorage } from './pdfArchive';

interface AccountBalance {
  code: string;
  name: string;
  debit: number;
  credit: number;
}

interface BilanDetailleData {
  actif: {
    immobilisations: {
      brut: number;
      amortissements: number;
      net: number;
    };
    actifCirculant: {
      stocks: number;
      creancesClients: number;
      autresCreances: number;
      tvaDeductible: number;
      total: number;
    };
    tresorerie: {
      banque: number;
      caisse: number;
      total: number;
    };
    chargesConstateesDavance: number;
    total: number;
  };
  passif: {
    capitauxPropres: {
      capital: number;
      reserves: number;
      resultat: number;
      total: number;
    };
    dettes: {
      emprunts: number;
      fournisseurs: number;
      fiscales: number;
      sociales: number;
      tvaCollectee: number;
      autresDettes: number;
      total: number;
    };
    produitsConstatesDavance: number;
    total: number;
  };
  ecart: number;
  equilibre: boolean;
}

async function loadAccountBalances(
  companyId: string,
  fiscalYear: number
): Promise<AccountBalance[]> {
  const { data: entries } = await supabase
    .from('accounting_entries')
    .select('id')
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .eq('locked', true);

  if (!entries || entries.length === 0) {
    return [];
  }

  const entryIds = entries.map((e) => e.id);

  const { data: lines } = await supabase
    .from('accounting_lines')
    .select(`
      debit,
      credit,
      chart_of_accounts!inner(code, name)
    `)
    .in('entry_id', entryIds);

  if (!lines || lines.length === 0) {
    return [];
  }

  const accountMap = new Map<string, AccountBalance>();

  lines.forEach((line: any) => {
    const account = line.chart_of_accounts;
    if (!account) return;

    if (!accountMap.has(account.code)) {
      accountMap.set(account.code, {
        code: account.code,
        name: account.name,
        debit: 0,
        credit: 0,
      });
    }

    const balance = accountMap.get(account.code)!;
    balance.debit += parseFloat(line.debit || '0');
    balance.credit += parseFloat(line.credit || '0');
  });

  return Array.from(accountMap.values());
}

function calculateBilanDetaille(balances: AccountBalance[]): BilanDetailleData {
  let immoBrut = 0;
  let immoAmort = 0;
  let stocks = 0;
  let creancesClients = 0;
  let autresCreances = 0;
  let tvaDeductible = 0;
  let banque = 0;
  let caisse = 0;
  let chargesConstateesDavance = 0;

  let capital = 0;
  let reserves = 0;
  let resultat = 0;
  let emprunts = 0;
  let fournisseurs = 0;
  let fiscales = 0;
  let sociales = 0;
  let tvaCollectee = 0;
  let autresDettes = 0;
  let produitsConstatesDavance = 0;

  balances.forEach((acc) => {
    const code = acc.code;
    const solde = acc.debit - acc.credit;

    if (code >= '20' && code < '28') {
      immoBrut += acc.debit;
    } else if (code >= '28' && code < '29') {
      immoAmort += acc.credit;
    } else if (code >= '30' && code < '40') {
      stocks += solde > 0 ? solde : 0;
    } else if (code === '411' || code.startsWith('411')) {
      creancesClients += solde > 0 ? solde : 0;
    } else if (
      (code >= '40' && code < '41') ||
      (code >= '42' && code < '43') ||
      (code >= '44' && code < '45' && !code.startsWith('445')) ||
      (code >= '46' && code < '47') ||
      (code >= '47' && code < '48')
    ) {
      if (solde > 0) {
        autresCreances += solde;
      }
    } else if (code.startsWith('445')) {
      if (solde > 0) {
        tvaDeductible += solde;
      } else if (solde < 0) {
        tvaCollectee += Math.abs(solde);
      }
    } else if (code === '512' || code.startsWith('512')) {
      banque += solde > 0 ? solde : 0;
    } else if (code >= '53' && code < '54') {
      caisse += solde > 0 ? solde : 0;
    } else if (code === '486' || code.startsWith('486')) {
      chargesConstateesDavance += solde > 0 ? solde : 0;
    } else if (code === '101' || code.startsWith('101')) {
      capital += acc.credit - acc.debit;
    } else if (code === '106' || code.startsWith('106')) {
      reserves += acc.credit - acc.debit;
    } else if (code >= '12' && code < '13') {
      resultat += acc.credit - acc.debit;
    } else if (code >= '16' && code < '17') {
      emprunts += acc.credit - acc.debit;
    } else if (code === '401' || code.startsWith('401')) {
      fournisseurs += acc.credit > acc.debit ? acc.credit - acc.debit : 0;
    } else if (code >= '43' && code < '44') {
      sociales += acc.credit > acc.debit ? acc.credit - acc.debit : 0;
    } else if (code >= '44' && code < '45' && !code.startsWith('445')) {
      fiscales += acc.credit > acc.debit ? acc.credit - acc.debit : 0;
    } else if (code >= '40' && code < '50' && code !== '401' && !code.startsWith('411')) {
      if (acc.credit > acc.debit) {
        autresDettes += acc.credit - acc.debit;
      }
    } else if (code === '487' || code.startsWith('487')) {
      produitsConstatesDavance += acc.credit > acc.debit ? acc.credit - acc.debit : 0;
    }
  });

  const immoNet = immoBrut - immoAmort;
  const actifCirculantTotal = stocks + creancesClients + autresCreances + tvaDeductible;
  const tresorerieTotal = banque + caisse;
  const actifTotal = immoNet + actifCirculantTotal + tresorerieTotal + chargesConstateesDavance;

  const capitauxPropresTotal = capital + reserves + resultat;
  const dettesTotal = emprunts + fournisseurs + fiscales + sociales + tvaCollectee + autresDettes;
  const passifTotal = capitauxPropresTotal + dettesTotal + produitsConstatesDavance;

  const ecart = actifTotal - passifTotal;
  const equilibre = Math.abs(ecart) < 0.01;

  return {
    actif: {
      immobilisations: {
        brut: Math.round(immoBrut * 100) / 100,
        amortissements: Math.round(immoAmort * 100) / 100,
        net: Math.round(immoNet * 100) / 100,
      },
      actifCirculant: {
        stocks: Math.round(stocks * 100) / 100,
        creancesClients: Math.round(creancesClients * 100) / 100,
        autresCreances: Math.round(autresCreances * 100) / 100,
        tvaDeductible: Math.round(tvaDeductible * 100) / 100,
        total: Math.round(actifCirculantTotal * 100) / 100,
      },
      tresorerie: {
        banque: Math.round(banque * 100) / 100,
        caisse: Math.round(caisse * 100) / 100,
        total: Math.round(tresorerieTotal * 100) / 100,
      },
      chargesConstateesDavance: Math.round(chargesConstateesDavance * 100) / 100,
      total: Math.round(actifTotal * 100) / 100,
    },
    passif: {
      capitauxPropres: {
        capital: Math.round(capital * 100) / 100,
        reserves: Math.round(reserves * 100) / 100,
        resultat: Math.round(resultat * 100) / 100,
        total: Math.round(capitauxPropresTotal * 100) / 100,
      },
      dettes: {
        emprunts: Math.round(emprunts * 100) / 100,
        fournisseurs: Math.round(fournisseurs * 100) / 100,
        fiscales: Math.round(fiscales * 100) / 100,
        sociales: Math.round(sociales * 100) / 100,
        tvaCollectee: Math.round(tvaCollectee * 100) / 100,
        autresDettes: Math.round(autresDettes * 100) / 100,
        total: Math.round(dettesTotal * 100) / 100,
      },
      produitsConstatesDavance: Math.round(produitsConstatesDavance * 100) / 100,
      total: Math.round(passifTotal * 100) / 100,
    },
    ecart: Math.round(ecart * 100) / 100,
    equilibre,
  };
}

export async function exportBilanDetaille(
  companyId: string,
  fiscalYear: number,
  companyData: {
    name: string;
    legal_form?: string;
    siren?: string;
    siret?: string;
    address?: string;
    vat_regime?: string;
    fiscal_year_start?: string;
    fiscal_year_end?: string;
  }
): Promise<void> {
  const balances = await loadAccountBalances(companyId, fiscalYear);

  if (balances.length === 0) {
    throw new Error('Aucune écriture verrouillée pour cet exercice');
  }

  const bilanData = calculateBilanDetaille(balances);

  const fiscalYearLabel = buildFiscalYearLabel(
    fiscalYear,
    companyData.fiscal_year_start,
    companyData.fiscal_year_end
  );
  const generatedAt = formatGeneratedDate();
  const documentId = generateDocumentId(companyId, fiscalYear, 'BILAN_DETAILLE');

  const header = buildPdfHeader({
    companyName: companyData.name,
    legalForm: companyData.legal_form,
    siren: companyData.siren,
    siret: companyData.siret,
    address: companyData.address,
    fiscalYearLabel,
    reportTitle: 'Bilan détaillé',
  });

  const footer = buildPdfFooter({
    generatedAt,
    pageNumber: 1,
    documentId,
    version: 'V1',
  });

  const fmt = (val: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(val);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bilan détaillé - ${companyData.name} - ${fiscalYear}</title>
  ${buildPdfStyles()}
  <style>
    .disclaimer {
      margin: 20px 0;
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
      margin: 0;
    }
    .bilan-table {
      width: 100%;
      margin: 30px 0;
      border-collapse: collapse;
    }
    .bilan-table th,
    .bilan-table td {
      padding: 10px 12px;
      text-align: left;
      border: 1px solid #d1d5db;
    }
    .bilan-table th {
      background: #3b82f6;
      color: white;
      font-weight: 700;
      font-size: 14px;
    }
    .section-header {
      background: #e0e7ff;
      font-weight: 700;
      font-size: 13px;
      color: #1e3a8a;
    }
    .subsection-header {
      background: #f3f4f6;
      font-weight: 600;
      font-size: 12px;
      padding-left: 20px !important;
    }
    .line-item {
      font-size: 12px;
      padding-left: 30px !important;
    }
    .line-item.indent-2 {
      padding-left: 40px !important;
      color: #6b7280;
    }
    .total-row {
      font-weight: 700;
      background: #f9fafb;
      font-size: 13px;
      border-top: 2px solid #1a1a1a;
    }
    .grand-total {
      font-weight: 700;
      background: #dbeafe;
      font-size: 14px;
      border-top: 3px solid #1a1a1a;
    }
    .amount {
      text-align: right;
      font-weight: 600;
    }
    .balance-check {
      margin-top: 30px;
      padding: 20px;
      text-align: center;
      border-radius: 12px;
      font-weight: 700;
      font-size: 16px;
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
  </style>
</head>
<body>
  ${header}

  <div class="disclaimer">
    <p>⚠️ Document informatif – Ne remplace pas un expert-comptable</p>
  </div>

  <table class="bilan-table">
    <thead>
      <tr>
        <th style="width: 70%;">ACTIF</th>
        <th style="width: 30%;" class="amount">Montant (EUR)</th>
      </tr>
    </thead>
    <tbody>
      <tr class="section-header">
        <td colspan="2">IMMOBILISATIONS</td>
      </tr>
      <tr class="line-item">
        <td>Brut</td>
        <td class="amount">${fmt(bilanData.actif.immobilisations.brut)}</td>
      </tr>
      <tr class="line-item">
        <td>Amortissements</td>
        <td class="amount">${fmt(bilanData.actif.immobilisations.amortissements)}</td>
      </tr>
      <tr class="subsection-header">
        <td>Net</td>
        <td class="amount">${fmt(bilanData.actif.immobilisations.net)}</td>
      </tr>

      <tr class="section-header">
        <td colspan="2">ACTIF CIRCULANT</td>
      </tr>
      <tr class="line-item">
        <td>Stocks</td>
        <td class="amount">${fmt(bilanData.actif.actifCirculant.stocks)}</td>
      </tr>
      <tr class="line-item">
        <td>Créances clients</td>
        <td class="amount">${fmt(bilanData.actif.actifCirculant.creancesClients)}</td>
      </tr>
      <tr class="line-item">
        <td>Autres créances</td>
        <td class="amount">${fmt(bilanData.actif.actifCirculant.autresCreances)}</td>
      </tr>
      <tr class="line-item">
        <td>TVA déductible</td>
        <td class="amount">${fmt(bilanData.actif.actifCirculant.tvaDeductible)}</td>
      </tr>
      <tr class="subsection-header">
        <td>Total actif circulant</td>
        <td class="amount">${fmt(bilanData.actif.actifCirculant.total)}</td>
      </tr>

      <tr class="section-header">
        <td colspan="2">TRÉSORERIE</td>
      </tr>
      <tr class="line-item">
        <td>Banque</td>
        <td class="amount">${fmt(bilanData.actif.tresorerie.banque)}</td>
      </tr>
      <tr class="line-item">
        <td>Caisse</td>
        <td class="amount">${fmt(bilanData.actif.tresorerie.caisse)}</td>
      </tr>
      <tr class="subsection-header">
        <td>Total trésorerie</td>
        <td class="amount">${fmt(bilanData.actif.tresorerie.total)}</td>
      </tr>

      <tr class="line-item">
        <td>Charges constatées d'avance</td>
        <td class="amount">${fmt(bilanData.actif.chargesConstateesDavance)}</td>
      </tr>

      <tr class="grand-total">
        <td>TOTAL ACTIF</td>
        <td class="amount">${fmt(bilanData.actif.total)}</td>
      </tr>
    </tbody>
  </table>

  <table class="bilan-table">
    <thead>
      <tr>
        <th style="width: 70%;">PASSIF</th>
        <th style="width: 30%;" class="amount">Montant (EUR)</th>
      </tr>
    </thead>
    <tbody>
      <tr class="section-header">
        <td colspan="2">CAPITAUX PROPRES</td>
      </tr>
      <tr class="line-item">
        <td>Capital</td>
        <td class="amount">${fmt(bilanData.passif.capitauxPropres.capital)}</td>
      </tr>
      <tr class="line-item">
        <td>Réserves</td>
        <td class="amount">${fmt(bilanData.passif.capitauxPropres.reserves)}</td>
      </tr>
      <tr class="line-item">
        <td>Résultat</td>
        <td class="amount">${fmt(bilanData.passif.capitauxPropres.resultat)}</td>
      </tr>
      <tr class="subsection-header">
        <td>Total capitaux propres</td>
        <td class="amount">${fmt(bilanData.passif.capitauxPropres.total)}</td>
      </tr>

      <tr class="section-header">
        <td colspan="2">DETTES</td>
      </tr>
      <tr class="line-item">
        <td>Emprunts</td>
        <td class="amount">${fmt(bilanData.passif.dettes.emprunts)}</td>
      </tr>
      <tr class="line-item">
        <td>Dettes fournisseurs</td>
        <td class="amount">${fmt(bilanData.passif.dettes.fournisseurs)}</td>
      </tr>
      <tr class="line-item">
        <td>Dettes fiscales</td>
        <td class="amount">${fmt(bilanData.passif.dettes.fiscales)}</td>
      </tr>
      <tr class="line-item">
        <td>Dettes sociales</td>
        <td class="amount">${fmt(bilanData.passif.dettes.sociales)}</td>
      </tr>
      <tr class="line-item">
        <td>TVA collectée</td>
        <td class="amount">${fmt(bilanData.passif.dettes.tvaCollectee)}</td>
      </tr>
      <tr class="line-item">
        <td>Autres dettes</td>
        <td class="amount">${fmt(bilanData.passif.dettes.autresDettes)}</td>
      </tr>
      <tr class="subsection-header">
        <td>Total dettes</td>
        <td class="amount">${fmt(bilanData.passif.dettes.total)}</td>
      </tr>

      <tr class="line-item">
        <td>Produits constatés d'avance</td>
        <td class="amount">${fmt(bilanData.passif.produitsConstatesDavance)}</td>
      </tr>

      <tr class="grand-total">
        <td>TOTAL PASSIF</td>
        <td class="amount">${fmt(bilanData.passif.total)}</td>
      </tr>
    </tbody>
  </table>

  <div class="balance-check ${bilanData.equilibre ? 'ok' : 'error'}">
    ${
      bilanData.equilibre
        ? '✓ Bilan équilibré (Actif = Passif)'
        : `⚠️ Écart détecté : ${fmt(bilanData.ecart)}`
    }
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
  const imgWidth = pdfWidth - 2 * margin;
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
  const fileName = `Bilan_Detaille_${companyData.name.replace(/[^a-z0-9]/gi, '_')}_${fiscalYear}.pdf`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(pdfBlob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);

  try {
    await savePdfToStorage({
      companyId,
      fiscalYear,
      reportType: 'balance_sheet_detailed',
      periodKey: String(fiscalYear),
      documentId,
      blob: pdfBlob,
      fileName,
    });
  } catch (archiveError) {
    console.warn('ARCHIVE_STORAGE_FAILED', {
      reportType: 'balance_sheet_detailed',
      companyId,
      fiscalYear,
      error: archiveError instanceof Error ? archiveError.message : String(archiveError),
    });
  }
}
