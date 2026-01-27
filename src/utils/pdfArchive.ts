import { supabase } from '../lib/supabase';

export type ReportType =
  | 'vat_monthly'
  | 'vat_quarterly'
  | 'vat_annual'
  | 'income_statement'
  | 'balance_sheet'
  | 'balance_sheet_detailed'
  | 'ag_report';

interface SavePdfParams {
  companyId: string;
  fiscalYear: number;
  reportType: ReportType;
  periodKey?: string;
  documentId: string;
  blob: Blob;
  fileName: string;
}

interface PdfDocument {
  id: string;
  company_id: string;
  fiscal_year: number;
  report_type: ReportType;
  period_key: string | null;
  document_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  generated_at: string;
  generated_by: string | null;
  version: string;
}

const PDF_BUCKET = 'pdf_reports';

export async function savePdfToStorage(params: SavePdfParams): Promise<string> {
  const {
    companyId,
    fiscalYear,
    reportType,
    periodKey,
    documentId,
    blob,
    fileName,
  } = params;

  const storagePath = `${companyId}/${fiscalYear}/${reportType}/${documentId}.pdf`;

  console.log('UPLOAD PDF - Storage Path:', storagePath);

  const { error: uploadError } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(storagePath, blob, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Échec upload: ${uploadError.message}`);
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || null;

  try {
    console.log('INSERT pdf_documents - company_id:', companyId, 'document_id:', documentId, 'user_id:', userId);

    const { data: insertData, error: insertError } = await supabase
      .from('pdf_documents')
      .insert({
        company_id: companyId,
        fiscal_year: fiscalYear,
        report_type: reportType,
        period_key: periodKey || null,
        document_id: documentId,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: 'application/pdf',
        file_size: blob.size,
        generated_by: userId,
        version: 'V1',
      })
      .select('id')
      .single();

    if (insertError) {
      console.warn('ARCHIVE_FAILED_RLS', {
        table: 'pdf_documents',
        error: insertError.message,
        code: insertError.code,
        userId: userId,
        companyId: companyId,
        reportType: reportType,
        fiscalYear: fiscalYear,
        periodKey: periodKey,
        documentId: documentId,
      });
    } else {
      console.log('PDF archivé avec succès:', storagePath, 'row_id:', insertData?.id);
    }
  } catch (archiveError: any) {
    console.warn('ARCHIVE_FAILED_RLS', {
      table: 'pdf_documents',
      error: archiveError?.message || 'Unknown error',
      userId: userId,
      companyId: companyId,
      reportType: reportType,
      fiscalYear: fiscalYear,
      periodKey: periodKey,
      documentId: documentId,
    });
  }

  return await getPdfDownloadUrl(storagePath);
}

export async function listPdfDocuments(params: {
  companyId: string;
  fiscalYear?: number;
}): Promise<PdfDocument[]> {
  let query = supabase
    .from('pdf_documents')
    .select('*')
    .eq('company_id', params.companyId)
    .order('generated_at', { ascending: false });

  if (params.fiscalYear) {
    query = query.eq('fiscal_year', params.fiscalYear);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Échec récupération PDFs: ${error.message}`);
  }

  return data || [];
}

export async function getPdfDownloadUrl(storagePath: string): Promise<string> {
  console.log('SIGNING PDF - Bucket:', PDF_BUCKET, 'Path:', storagePath);

  const { data, error } = await supabase.storage
    .from(PDF_BUCKET)
    .createSignedUrl(storagePath, 300);

  if (error) {
    throw new Error(`Échec génération URL: ${error.message}`);
  }

  console.log('SIGNING PDF - URL générée avec succès');
  return data.signedUrl;
}

export function formatReportType(reportType: ReportType): string {
  const labels: Record<ReportType, string> = {
    vat_monthly: 'TVA Mensuelle',
    vat_quarterly: 'TVA Trimestrielle',
    vat_annual: 'TVA Annuelle',
    income_statement: 'Compte de Résultat',
    balance_sheet: 'Bilan',
    balance_sheet_detailed: 'Bilan détaillé',
    ag_report: "Rapport d'AG",
  };
  return labels[reportType] || reportType;
}
