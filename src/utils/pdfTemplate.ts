interface PdfHeaderParams {
  companyName: string;
  legalForm?: string;
  siren?: string;
  siret?: string;
  address?: string;
  vatRegime?: string;
  fiscalYearLabel: string;
  reportTitle: string;
  fiscalPeriod?: string;
  declaredAt?: string | null;
  paymentDate?: string | null;
}

interface PdfFooterParams {
  generatedAt: string;
  pageNumber?: number;
  totalPages?: number;
  documentId?: string;
  version?: string;
}

export function generateDocumentId(companyId: string, year: number, reportType: string): string {
  const input = `${companyId}-${year}-${reportType}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hashStr = Math.abs(hash).toString(36).toUpperCase();
  return `DOC-V1-${hashStr.padStart(8, '0')}`;
}

export function buildPdfHeader(params: PdfHeaderParams): string {
  const {
    companyName,
    legalForm,
    siren,
    siret,
    address,
    vatRegime,
    fiscalYearLabel,
    reportTitle,
    fiscalPeriod,
    declaredAt,
    paymentDate,
  } = params;

  const identifiers: string[] = [];
  if (siren) identifiers.push(`SIREN: ${siren}`);
  if (siret) identifiers.push(`SIRET: ${siret}`);
  const identifierLine = identifiers.length > 0 ? identifiers.join(' • ') : '';

  const companyFullName = legalForm ? `${companyName} (${legalForm})` : companyName;

  const fiscalInfoLines: string[] = [];
  if (vatRegime) fiscalInfoLines.push(`Régime TVA : ${vatRegime}`);
  if (fiscalPeriod) fiscalInfoLines.push(`Période fiscale : ${fiscalPeriod}`);
  if (declaredAt) fiscalInfoLines.push(`Date de déclaration : ${new Date(declaredAt).toLocaleDateString('fr-FR')}`);
  if (paymentDate) fiscalInfoLines.push(`Date de paiement : ${new Date(paymentDate).toLocaleDateString('fr-FR')}`);

  return `
    <div style="margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #e5e7eb;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div>
          <h1 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: #1a1a1a;">${reportTitle}</h1>
          <div style="display: inline-block; background-color: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px;">
            DOCUMENT INFORMATIF — V1
          </div>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; font-size: 18px; font-weight: 600; color: #374151;">${companyFullName}</p>
        </div>
      </div>
      <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #059669;">${fiscalYearLabel}</p>
      ${identifierLine ? `<p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;">${identifierLine}</p>` : ''}
      ${address ? `<p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">${address}</p>` : ''}
      ${fiscalInfoLines.length > 0 ? `
        <div style="margin-top: 12px; padding: 12px; background-color: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
          ${fiscalInfoLines.map(line => `<p style="margin: 0 0 4px 0; font-size: 13px; color: #1e40af; font-weight: 500;">${line}</p>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

export function buildPdfFooter(params: PdfFooterParams): string {
  const { generatedAt, pageNumber, totalPages, documentId, version } = params;

  const pageInfo = totalPages
    ? `Page ${pageNumber} / ${totalPages}`
    : pageNumber
    ? `Page ${pageNumber}`
    : '';

  const docVersion = version || 'V1';
  const docId = documentId || 'N/A';

  return `
    <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #6b7280; margin-bottom: 12px;">
        <div>Date d'édition : ${generatedAt}</div>
        <div style="font-style: italic;">ComptaApp — Document généré automatiquement</div>
        ${pageInfo ? `<div>${pageInfo}</div>` : ''}
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #9ca3af; margin-bottom: 12px;">
        <div>Version modèle PDF : <span style="font-weight: 600;">${docVersion}</span></div>
        <div>ID document unique : <span style="font-family: monospace; font-weight: 600;">${docId}</span></div>
      </div>
      <div style="background-color: #f0f9ff; border: 1px solid #3b82f6; border-radius: 6px; padding: 12px; margin-top: 16px;">
        <div style="text-align: center; font-size: 11px; color: #1e40af; margin-bottom: 6px;">
          <strong>Traçabilité professionnelle</strong>
        </div>
        <div style="text-align: center; font-size: 11px; color: #1e40af;">
          Montants calculés à partir des écritures enregistrées dans l'application à la date d'édition.
        </div>
      </div>
      <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px; margin-top: 12px;">
        <div style="text-align: center; font-size: 12px; color: #92400e; font-weight: 600;">
          ⚠ Document informatif — Ne remplace pas un expert-comptable
        </div>
        <div style="text-align: center; font-size: 11px; color: #92400e; margin-top: 4px;">
          Outil d'aide à la gestion — Consultez un professionnel pour tout usage fiscal ou juridique
        </div>
      </div>
    </div>
  `;
}

export function formatGeneratedDate(): string {
  const now = new Date();
  return now.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildFiscalYearLabel(
  year: number,
  fiscalYearStart?: string,
  fiscalYearEnd?: string
): string {
  if (fiscalYearStart && fiscalYearEnd) {
    const startDate = new Date(fiscalYearStart).toLocaleDateString('fr-FR');
    const endDate = new Date(fiscalYearEnd).toLocaleDateString('fr-FR');
    return `Exercice ${startDate} → ${endDate}`;
  }
  return `Exercice ${year}`;
}

export function buildVatBalanceSection(soldeTVA: number, isDeclared: boolean): string {
  const isPositive = soldeTVA >= 0;
  const balanceType = isPositive ? 'TVA à payer' : 'Crédit de TVA à reporter';
  const balanceMessage = isPositive
    ? 'Montant de TVA à régler à l\'administration fiscale'
    : 'Crédit de TVA à reporter sur la période suivante';

  const statusText = isDeclared
    ? (isPositive ? 'Déclarée – TVA à payer' : 'Déclarée – Crédit à reporter')
    : 'Ouverte';

  return `
    <div style="margin: 32px 0;">
      <div style="background-color: ${isPositive ? '#fef3c7' : '#dbeafe'}; border-left: 4px solid ${isPositive ? '#f59e0b' : '#3b82f6'}; padding: 20px; border-radius: 4px;">
        <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: #1a1a1a;">Nature du solde : ${balanceType}</p>
        <p style="margin: 0 0 12px 0; font-size: 14px; color: #374151;">${balanceMessage}</p>
        <p style="margin: 0; font-size: 13px; color: #6b7280;"><strong>Statut :</strong> ${statusText}</p>
      </div>
    </div>
  `;
}

export function buildVatRegime(vatRegimeType?: string): string {
  if (!vatRegimeType) {
    return 'Réel normal';
  }

  const regimes: { [key: string]: string } = {
    'franchise': 'Franchise en base de TVA',
    'reel_simplifie': 'Réel simplifié',
    'reel_normal': 'Réel normal',
  };

  return regimes[vatRegimeType] || 'Réel normal';
}

export function buildPdfStyles(): string {
  return `
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.6;
        color: #1a1a1a;
        padding: 50px 5%;
        max-width: 1200px;
        margin: 0 auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 32px 0;
      }
      th {
        background-color: #f9fafb;
        padding: 14px 12px;
        text-align: left;
        font-size: 13px;
        font-weight: 600;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 2px solid #e5e7eb;
      }
      td {
        padding: 14px 12px;
        border-bottom: 1px solid #e5e7eb;
        font-size: 14px;
      }
      .text-right {
        text-align: right;
      }
      .text-center {
        text-align: center;
      }
      .font-bold {
        font-weight: 600;
      }
      .section-title {
        font-size: 20px;
        font-weight: 600;
        color: #1a1a1a;
        margin: 40px 0 20px 0;
        padding-bottom: 10px;
        border-bottom: 2px solid #e5e7eb;
      }
      .subsection-title {
        font-size: 16px;
        font-weight: 600;
        color: #374151;
        margin: 28px 0 14px 0;
      }
      .highlight-positive {
        color: #059669;
        font-weight: 600;
      }
      .highlight-negative {
        color: #dc2626;
        font-weight: 600;
      }
      .info-box {
        background-color: #f0f9ff;
        border-left: 4px solid #3b82f6;
        padding: 20px;
        margin: 32px 0;
        font-size: 14px;
      }
      .page-break-inside-avoid {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .keep-with-next {
        break-after: avoid;
        page-break-after: avoid;
      }
      .page-break-before {
        page-break-before: always;
        break-before: page;
      }
      @media print {
        body {
          padding: 20px;
        }
        .no-print {
          display: none;
        }
        table { page-break-inside: auto; break-inside: auto; }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
        tr { page-break-inside: avoid; break-inside: avoid; }
        tbody { page-break-inside: auto; break-inside: auto; }
        .passif-new-page {
          break-before: page;
          page-break-before: always;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .pdf-page-break-before {
          break-before: page;
          page-break-before: always;
        }
        .pdf-allow-breaks {
          break-inside: auto;
          page-break-inside: auto;
        }
        .pdf-avoid-break-inside {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    </style>
  `;
}
