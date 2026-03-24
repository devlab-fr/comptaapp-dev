import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { scanReceipt, AiScanResult, formatConfidence, formatSuggestedType, Category } from '../utils/aiScanReceipt';
import BackButton from '../components/BackButton';
import Toast from '../components/Toast';
import { supabase } from '../lib/supabase';
import * as pdfjsLib from 'pdfjs-dist';
import { useEntitlements } from '../billing/useEntitlements';
import { hasFeature, getFeatureBlockedMessage, convertEntitlementsPlanToTier } from '../billing/planRules';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface Subcategory {
  id: string;
  name: string;
  category_id: string;
}

export function AiScanPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const entitlements = useEntitlements();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [editedResult, setEditedResult] = useState<AiScanResult | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);
  const [revenueCategories, setRevenueCategories] = useState<Category[]>([]);
  const [expenseSubcategories, setExpenseSubcategories] = useState<Subcategory[]>([]);
  const [revenueSubcategories, setRevenueSubcategories] = useState<Subcategory[]>([]);
  const [mappedCategory, setMappedCategory] = useState<Category | null>(null);
  const [mappedSubcategory, setMappedSubcategory] = useState<Subcategory | null>(null);
  const [scannedFileName, setScannedFileName] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pdfConvertedImage, setPdfConvertedImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [convertingPdf, setConvertingPdf] = useState(false);
  const [uploadedReceipt, setUploadedReceipt] = useState<{
    url: string;
    storagePath: string;
    filename: string;
  } | null>(null);

  useEffect(() => {
    if (companyId) {
      loadCategories();
    }
  }, [companyId]);

  const loadCategories = async () => {
    if (!companyId) return;

    const { data: expCats } = await supabase
      .from('categories')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('category_type', 'expense')
      .order('name');

    const { data: revCats } = await supabase
      .from('categories')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('category_type', 'revenue')
      .order('name');

    if (expCats && expCats.length > 0) {
      setExpenseCategories(expCats);
    } else {
      const defaultExpenseCategories = [
        'Achats & Marchandises',
        'Services & Prestations',
        'Loyer & Charges',
        'Déplacements',
        'Frais de repas',
        'Assurances',
        'Matériel',
        'Autres charges'
      ];

      const categoriesToInsert = defaultExpenseCategories.map((name) => ({
        company_id: companyId,
        name,
        category_type: 'expense'
      }));

      const { data: inserted } = await supabase
        .from('categories')
        .insert(categoriesToInsert)
        .select('id, name');

      if (inserted) setExpenseCategories(inserted);
    }

    if (revCats && revCats.length > 0) {
      setRevenueCategories(revCats);
    } else {
      const defaultRevenueCategories = [
        'Ventes de biens',
        'Prestations de services',
        'Production vendue',
        'Autres produits'
      ];

      const revCategoriesToInsert = defaultRevenueCategories.map((name) => ({
        company_id: companyId,
        name,
        category_type: 'revenue'
      }));

      const { data: insertedRev } = await supabase
        .from('categories')
        .insert(revCategoriesToInsert)
        .select('id, name');

      if (insertedRev) setRevenueCategories(insertedRev);
    }

    setExpenseSubcategories([]);
    setRevenueSubcategories([]);
  };

  const synonyms: Record<string, string[]> = {
    'carburant': ['carburant', 'fuel', 'gazole', 'essence', 'diesel', 'sp95', 'sp98'],
    'péage': ['peage', 'autoroute', 'toll'],
    'restaurant': ['restaurant', 'repas', 'restauration'],
    'fournitures': ['fournitures', 'bureau', 'papeterie'],
    'hébergement': ['hebergement', 'hotel', 'logement'],
    'transport': ['transport', 'taxi', 'uber', 'train', 'avion'],
    'téléphone': ['telephone', 'mobile', 'tel', 'telephonie'],
    'internet': ['internet', 'web', 'adsl', 'fibre']
  };

  const normalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  const findBestMatch = (
    suggestedLabel: string | null,
    categories: Category[],
    subcategories: Subcategory[]
  ): { category: Category | null; subcategory: Subcategory | null } => {
    if (!suggestedLabel) {
      const fallbackCat = categories.find(c => c.name.toLowerCase().includes('autres')) || categories[0] || null;
      return { category: fallbackCat, subcategory: null };
    }

    const normalized = normalizeText(suggestedLabel);

    for (const cat of categories) {
      const catNormalized = normalizeText(cat.name);
      if (catNormalized === normalized) {
        return { category: cat, subcategory: null };
      }
    }

    for (const subcat of subcategories) {
      const subcatNormalized = normalizeText(subcat.name);
      if (subcatNormalized === normalized) {
        const parentCat = categories.find(c => c.id === subcat.category_id);
        return { category: parentCat || null, subcategory: subcat };
      }
    }

    for (const [key, synonymList] of Object.entries(synonyms)) {
      if (synonymList.some(syn => normalized.includes(syn) || syn.includes(normalized))) {
        for (const cat of categories) {
          if (normalizeText(cat.name).includes(normalizeText(key))) {
            return { category: cat, subcategory: null };
          }
        }
        for (const subcat of subcategories) {
          if (normalizeText(subcat.name).includes(normalizeText(key))) {
            const parentCat = categories.find(c => c.id === subcat.category_id);
            return { category: parentCat || null, subcategory: subcat };
          }
        }
      }
    }

    for (const cat of categories) {
      const catNormalized = normalizeText(cat.name);
      if (catNormalized.includes(normalized) || normalized.includes(catNormalized)) {
        return { category: cat, subcategory: null };
      }
    }

    for (const subcat of subcategories) {
      const subcatNormalized = normalizeText(subcat.name);
      if (subcatNormalized.includes(normalized) || normalized.includes(subcatNormalized)) {
        const parentCat = categories.find(c => c.id === subcat.category_id);
        return { category: parentCat || null, subcategory: subcat };
      }
    }

    const fallbackCat = categories.find(c => c.name.toLowerCase().includes('autres')) || categories[0] || null;
    return { category: fallbackCat, subcategory: null };
  };

  const uploadReceiptToStorage = async (fileToUpload: File | Blob, originalFilename: string): Promise<{
    url: string;
    storagePath: string;
    filename: string;
  }> => {
    if (!companyId) {
      throw new Error('Company ID is required');
    }

    const timestamp = Date.now();
    const scanId = crypto.randomUUID().split('-')[0];
    const filename = `${timestamp}-${originalFilename}`;
    const storagePath = `${companyId}/${scanId}/${filename}`;

    const { error } = await supabase.storage
      .from('receipts')
      .upload(storagePath, fileToUpload, {
        contentType: fileToUpload.type || 'image/png',
        upsert: false
      });

    if (error) {
      console.error('UPLOAD_RECEIPT_ERROR', error);
      throw new Error(`Erreur upload: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('receipts')
      .getPublicUrl(storagePath);

    return {
      url: urlData.publicUrl,
      storagePath,
      filename: originalFilename
    };
  };

  const convertPdfToImage = async (file: File): Promise<{ base64: string; mimeType: string; previewUrl: string }> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get canvas context');
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas
    }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];

    return {
      base64,
      mimeType: 'image/png',
      previewUrl: dataUrl
    };
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setEditedResult(null);
    setMappedCategory(null);
    setMappedSubcategory(null);
    setScanning(false);
    setToast(null);
    setScannedFileName(null);
    setRequestId(null);
    setPdfConvertedImage(null);
    setUploadedReceipt(null);

    if (selectedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    } else if (selectedFile.type === 'application/pdf') {
      setConvertingPdf(true);
      setPreviewUrl(null);
      try {
        const converted = await convertPdfToImage(selectedFile);
        setPdfConvertedImage({ base64: converted.base64, mimeType: converted.mimeType });
        setPreviewUrl(converted.previewUrl);
      } catch (error) {
        console.error('PDF_CONVERSION_ERROR', error);
        setToast({ message: 'Erreur lors de la conversion du PDF', type: 'error' });
        setPdfConvertedImage(null);
        setPreviewUrl(null);
      } finally {
        setConvertingPdf(false);
      }
    }
  };

  const handleNewScan = () => {
    setFile(null);
    setPreviewUrl(null);
    setEditedResult(null);
    setMappedCategory(null);
    setMappedSubcategory(null);
    setScanning(false);
    setToast(null);
    setScannedFileName(null);
    setRequestId(null);
    setPdfConvertedImage(null);
    setConvertingPdf(false);
    setUploadedReceipt(null);
  };

  const handleScan = async () => {
    if (!file) return;

    const planTier = convertEntitlementsPlanToTier(entitlements.plan);

    if (!hasFeature(planTier, 'scan_ocr')) {
      setToast({ message: getFeatureBlockedMessage('scan_ocr'), type: 'error' });
      return;
    }

    setScanning(true);
    try {
      const { result, requestId: scanRequestId } = await scanReceipt(file, pdfConvertedImage || undefined, companyId);

      let normalizedResult = { ...result };
      if (normalizedResult.tva_rate !== null && normalizedResult.tva_rate !== undefined) {
        let rate = normalizedResult.tva_rate;
        if (rate > 100) {
          rate = rate / 100;
        } else if (rate > 0 && rate < 1) {
          rate = rate * 100;
        }
        normalizedResult.tva_rate = Math.round(rate * 100) / 10000;
      }

      setEditedResult(normalizedResult);
      setScannedFileName(file.name);
      setRequestId(scanRequestId);

      const categoriesToSearch = normalizedResult.suggested_type === 'expense'
        ? expenseCategories
        : normalizedResult.suggested_type === 'revenue'
        ? revenueCategories
        : [];

      const subcategoriesToSearch = normalizedResult.suggested_type === 'expense'
        ? expenseSubcategories
        : normalizedResult.suggested_type === 'revenue'
        ? revenueSubcategories
        : [];

      const { category: matchedCat, subcategory: matchedSubcat } = findBestMatch(
        normalizedResult.suggested_category_label,
        categoriesToSearch,
        subcategoriesToSearch
      );

      setMappedCategory(matchedCat);
      setMappedSubcategory(matchedSubcat);

      let fileToUpload: File | Blob = file;
      let filenameToUse = file.name;

      if (pdfConvertedImage && file.type === 'application/pdf') {
        const pngBlob = await fetch(`data:image/png;base64,${pdfConvertedImage.base64}`).then(r => r.blob());
        fileToUpload = new File([pngBlob], file.name.replace(/\.pdf$/i, '.png'), { type: 'image/png' });
        filenameToUse = file.name.replace(/\.pdf$/i, '.png');
      }

      const receiptData = await uploadReceiptToStorage(fileToUpload, filenameToUse);
      setUploadedReceipt(receiptData);

      setToast({ message: 'Scan terminé', type: 'success' });
    } catch (err: any) {
      console.error('SCAN_ERROR', err);
      setToast({ message: 'Scan impossible, saisie manuelle disponible', type: 'error' });
    } finally {
      setScanning(false);
    }
  };

  const handleCreateExpense = () => {
    if (!editedResult || !companyId) return;

    const params = new URLSearchParams();
    if (editedResult.date) params.set('date', editedResult.date);
    if (editedResult.amount_ht) params.set('amount_ht', editedResult.amount_ht.toString());
    if (editedResult.amount_tva) params.set('vat', editedResult.amount_tva.toString());
    if (editedResult.vendor_or_client) params.set('supplier', editedResult.vendor_or_client);
    if (editedResult.description) params.set('description', editedResult.description);
    if (mappedCategory) params.set('category_id', mappedCategory.id);
    if (mappedSubcategory) params.set('subcategory_id', mappedSubcategory.id);
    if (uploadedReceipt) {
      params.set('receipt_url', uploadedReceipt.url);
      params.set('receipt_storage_path', uploadedReceipt.storagePath);
      params.set('receipt_filename', uploadedReceipt.filename);
    }

    navigate(`/app/company/${companyId}/expenses/new?${params.toString()}`);
  };

  const handleCreateRevenue = () => {
    if (!editedResult || !companyId) return;

    const params = new URLSearchParams();
    if (editedResult.date) params.set('date', editedResult.date);
    if (editedResult.amount_ht) params.set('amount_ht', editedResult.amount_ht.toString());
    if (editedResult.amount_tva) params.set('vat', editedResult.amount_tva.toString());
    if (editedResult.vendor_or_client) params.set('client', editedResult.vendor_or_client);
    if (editedResult.description) params.set('description', editedResult.description);
    if (mappedCategory) params.set('category_id', mappedCategory.id);
    if (mappedSubcategory) params.set('subcategory_id', mappedSubcategory.id);
    if (uploadedReceipt) {
      params.set('receipt_url', uploadedReceipt.url);
      params.set('receipt_storage_path', uploadedReceipt.storagePath);
      params.set('receipt_filename', uploadedReceipt.filename);
    }

    navigate(`/app/company/${companyId}/revenues/new?${params.toString()}`);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <BackButton />

        <button
          onClick={handleNewScan}
          style={{
            padding: '10px 16px',
            backgroundColor: 'white',
            color: '#3b82f6',
            border: '1px solid #3b82f6',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#eff6ff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
          }}
        >
          🔄 Nouveau scan
        </button>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937', marginBottom: '8px' }}>
          🧠 Scanner un justificatif (IA)
        </h1>
        <p style={{ fontSize: '14px', color: '#6b7280' }}>
          Uploadez un justificatif (ticket, facture, reçu) et laissez l'IA extraire les informations automatiquement.
        </p>
      </div>

      <div style={{
        padding: '24px',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        marginBottom: '24px'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '16px' }}>
          1️⃣ Choisir un justificatif
        </h2>

        <input
          id="ai-file-input"
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileSelect(e.target.files[0]);
            }
          }}
          style={{ display: 'none' }}
        />

        {convertingPdf ? (
          <div style={{
            padding: '48px',
            border: '2px solid #3b82f6',
            borderRadius: '8px',
            textAlign: 'center',
            backgroundColor: '#eff6ff'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔄</div>
            <p style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
              Conversion du PDF en cours...
            </p>
            <p style={{ fontSize: '13px', color: '#6b7280' }}>
              Veuillez patienter
            </p>
          </div>
        ) : !file ? (
          <label
            htmlFor="ai-file-input"
            style={{
              display: 'block',
              padding: '48px',
              border: '2px dashed #d1d5db',
              borderRadius: '8px',
              textAlign: 'center',
              backgroundColor: '#f9fafb',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#3b82f6';
              e.currentTarget.style.backgroundColor = '#eff6ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
            <p style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
              Cliquer pour choisir un fichier
            </p>
            <p style={{ fontSize: '13px', color: '#6b7280' }}>
              JPG, PNG, WEBP ou PDF · Max 10 MB
            </p>
          </label>
        ) : (
          <div>
            <div style={{
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ fontSize: '32px' }}>
                  {file.type === 'application/pdf' ? '📄' : '🖼️'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                      {file.name}
                    </div>
                    {pdfConvertedImage && (
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: '#d1fae5',
                        color: '#065f46',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}>
                        PDF → PNG
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              </div>

              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Preview"
                  style={{
                    width: '100%',
                    maxHeight: '300px',
                    objectFit: 'contain',
                    borderRadius: '6px',
                    backgroundColor: 'white'
                  }}
                />
              )}
            </div>

            <label
              htmlFor="ai-file-input"
              style={{
                padding: '8px 16px',
                backgroundColor: 'white',
                color: '#3b82f6',
                border: '1px solid #3b82f6',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-block'
              }}
            >
              Changer de fichier
            </label>
          </div>
        )}
      </div>

      {file && (
        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          marginBottom: '24px'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '16px' }}>
            2️⃣ Scanner le document
          </h2>

          <button
            onClick={handleScan}
            disabled={scanning || (file?.type === 'application/pdf' && !pdfConvertedImage)}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: (scanning || (file?.type === 'application/pdf' && !pdfConvertedImage)) ? '#d1d5db' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: (scanning || (file?.type === 'application/pdf' && !pdfConvertedImage)) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {scanning ? '🔄 Scan en cours...' : '🧠 Scanner le justificatif'}
          </button>
        </div>
      )}

      {editedResult && (
        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
              ✨ Résultat du scan
            </h2>
            <span style={{
              padding: '4px 12px',
              backgroundColor: editedResult.confidence >= 0.8 ? '#d1fae5' : editedResult.confidence >= 0.5 ? '#fef3c7' : '#fee2e2',
              color: editedResult.confidence >= 0.8 ? '#065f46' : editedResult.confidence >= 0.5 ? '#92400e' : '#991b1b',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              Confiance: {formatConfidence(editedResult.confidence)}
            </span>
          </div>

          {scannedFileName && (
            <div style={{
              padding: '8px 12px',
              backgroundColor: '#f0f9ff',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#1e40af',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div>
                <strong>Fichier scanné:</strong> {scannedFileName}
              </div>
              {requestId && (
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  ID: {requestId}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Type suggéré
              </label>
              <input
                type="text"
                value={formatSuggestedType(editedResult.suggested_type)}
                readOnly
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: '#f9fafb'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Date
              </label>
              <input
                type="date"
                value={editedResult.date || ''}
                onChange={(e) => setEditedResult({ ...editedResult, date: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Fournisseur / Client
              </label>
              <input
                type="text"
                value={editedResult.vendor_or_client || ''}
                onChange={(e) => setEditedResult({ ...editedResult, vendor_or_client: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Description
              </label>
              <input
                type="text"
                value={editedResult.description || ''}
                onChange={(e) => setEditedResult({ ...editedResult, description: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Montant HT (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={editedResult.amount_ht || ''}
                onChange={(e) => setEditedResult({ ...editedResult, amount_ht: parseFloat(e.target.value) || null })}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                TVA (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={editedResult.amount_tva || ''}
                onChange={(e) => setEditedResult({ ...editedResult, amount_tva: parseFloat(e.target.value) || null })}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Montant TTC (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={editedResult.amount_ttc || ''}
                onChange={(e) => setEditedResult({ ...editedResult, amount_ttc: parseFloat(e.target.value) || null })}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Taux TVA
              </label>
              <input
                type="number"
                step="0.01"
                value={editedResult.tva_rate ? (editedResult.tva_rate * 100) : ''}
                onChange={(e) => setEditedResult({ ...editedResult, tva_rate: e.target.value ? parseFloat(e.target.value) / 100 : null })}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
                placeholder="%"
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Catégorie détectée
              </label>
              <div style={{
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: mappedCategory ? '#d1fae5' : '#fef3c7',
                fontSize: '14px'
              }}>
                {mappedCategory ? (
                  <span style={{ color: '#065f46', fontWeight: '600' }}>
                    ✓ {mappedCategory.name}
                  </span>
                ) : (
                  <span style={{ color: '#92400e' }}>
                    {editedResult.suggested_category_label
                      ? `"${editedResult.suggested_category_label}" → Catégorie à choisir manuellement`
                      : 'Aucune catégorie suggérée → À choisir manuellement'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{
            padding: '16px',
            backgroundColor: '#eff6ff',
            borderRadius: '8px',
            border: '1px solid #bfdbfe',
            marginBottom: '20px'
          }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#1e40af' }}>
              💡 <strong>Astuce:</strong> Vous pouvez modifier les valeurs ci-dessus avant de créer une dépense ou un revenu.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleCreateExpense}
              disabled={!editedResult}
              style={{
                flex: 1,
                padding: '14px',
                backgroundColor: editedResult ? '#dc2626' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: editedResult ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                opacity: editedResult ? 1 : 0.6
              }}
              onMouseEnter={(e) => editedResult && (e.currentTarget.style.backgroundColor = '#b91c1c')}
              onMouseLeave={(e) => editedResult && (e.currentTarget.style.backgroundColor = '#dc2626')}
            >
              📤 Créer une dépense
            </button>

            <button
              onClick={handleCreateRevenue}
              disabled={!editedResult}
              style={{
                flex: 1,
                padding: '14px',
                backgroundColor: editedResult ? '#16a34a' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: editedResult ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                opacity: editedResult ? 1 : 0.6
              }}
              onMouseEnter={(e) => editedResult && (e.currentTarget.style.backgroundColor = '#15803d')}
              onMouseLeave={(e) => editedResult && (e.currentTarget.style.backgroundColor = '#16a34a')}
            >
              📥 Créer un revenu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
