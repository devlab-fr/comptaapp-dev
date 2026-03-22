import { supabase } from '../lib/supabase';

export interface AiScanResult {
  suggested_type: 'expense' | 'revenue' | null;
  date: string | null;
  vendor_or_client: string | null;
  amount_ttc: number | null;
  amount_ht: number | null;
  amount_tva: number | null;
  tva_rate: number | null;
  currency: string | null;
  description: string | null;
  suggested_category_label: string | null;
  confidence: number;
}

export interface ScanReceiptResponse {
  result: AiScanResult;
  requestId: string;
}

export async function scanReceipt(file: File, pdfConvertedImage?: { base64: string; mimeType: string }, companyId?: string): Promise<ScanReceiptResponse> {
  let base64: string;
  let mimeType: string;

  if (pdfConvertedImage) {
    base64 = pdfConvertedImage.base64;
    mimeType = pdfConvertedImage.mimeType;
  } else {
    base64 = await fileToBase64(file);
    mimeType = file.type;
  }

  const requestId = crypto.randomUUID();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Session expirée. Veuillez vous reconnecter.');
  }

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-scan-receipt`;
  const headers = {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    cache: 'no-store',
    body: JSON.stringify({
      image: base64,
      mimeType,
      requestId,
      fileName: file.name,
      fileSize: file.size,
      lastModified: file.lastModified,
      companyId
    })
  });

  if (!response.ok) {
    let errorMessage = 'Erreur réseau';
    try {
      const errorData = await response.json();
      if (errorData.error === 'PDF_NOT_SUPPORTED_UPLOAD_IMAGE') {
        errorMessage = 'Les fichiers PDF ne sont pas supportés. Veuillez utiliser une image (JPG, PNG, WEBP).';
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.error) {
        errorMessage = `Erreur: ${errorData.error}`;
      }
    } catch {
      errorMessage = await response.text().catch(() => `HTTP ${response.status}`);
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();

  return {
    result,
    requestId
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function formatConfidence(confidence: number): string {
  if (confidence >= 0.8) return 'Élevée';
  if (confidence >= 0.5) return 'Moyenne';
  return 'Faible';
}

export function formatSuggestedType(type: string | null): string {
  const map: Record<string, string> = {
    'expense': 'Dépense',
    'revenue': 'Revenu'
  };
  return type ? map[type] || type : 'Indéterminé';
}

export interface Category {
  id: string;
  name: string;
}

export function findMatchingCategory(
  suggestedLabel: string | null,
  categories: Category[]
): Category | null {
  if (!suggestedLabel) return null;

  const normalized = suggestedLabel.toLowerCase().trim();

  const exactMatch = categories.find(
    cat => cat.name.toLowerCase().trim() === normalized
  );
  if (exactMatch) return exactMatch;

  const partialMatch = categories.find(cat =>
    cat.name.toLowerCase().includes(normalized) ||
    normalized.includes(cat.name.toLowerCase())
  );

  return partialMatch || null;
}
