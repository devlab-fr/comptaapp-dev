import { supabase } from '../lib/supabase';

export interface Attachment {
  id: string;
  company_id: string;
  expense_id?: string;
  revenue_id?: string;
  expense_document_id?: string;
  revenue_document_id?: string;
  file_path: string;
  created_at: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
}

export async function uploadAttachment(
  file: File,
  companyId: string,
  fiscalYear: number,
  recordType: 'expense_documents' | 'revenue_documents',
  recordId: string
): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `${companyId}/${fiscalYear}/justificatifs/${recordType}/${recordId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('justificatifs')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (uploadError) throw uploadError;

  const attachmentData: any = {
    company_id: companyId,
    file_path: filePath,
    expense_id: null,
    revenue_id: null,
    expense_document_id: null,
    revenue_document_id: null
  };

  if (recordType === 'expense_documents') {
    attachmentData.expense_document_id = recordId;
  } else if (recordType === 'revenue_documents') {
    attachmentData.revenue_document_id = recordId;
  } else {
    throw new Error(`Type d'enregistrement non supporté: ${recordType}`);
  }

  console.debug('[uploadAttachment] Payload envoyé à Supabase:', {
    ...attachmentData,
    file_path: filePath.split('/').slice(-2).join('/')
  });

  const { error: dbError } = await supabase
    .from('attachments')
    .insert(attachmentData);

  if (dbError) {
    await supabase.storage.from('justificatifs').remove([filePath]);
    throw dbError;
  }

  return filePath;
}

export async function getAttachments(
  recordType: 'expense_documents' | 'revenue_documents',
  recordId: string
): Promise<Attachment[]> {
  const column = recordType === 'expense_documents' ? 'expense_document_id' : 'revenue_document_id';

  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq(column, recordId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(att => ({
    ...att,
    file_name: att.file_path.split('/').pop() || 'fichier',
    file_type: att.file_path.split('.').pop() || 'unknown',
    file_size: undefined
  }));
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  const { data: attachment } = await supabase
    .from('attachments')
    .select('file_path')
    .eq('id', attachmentId)
    .maybeSingle();

  if (!attachment) throw new Error('Justificatif introuvable');

  const { error: storageError } = await supabase.storage
    .from('justificatifs')
    .remove([attachment.file_path]);

  if (storageError) throw storageError;

  const { error: dbError } = await supabase
    .from('attachments')
    .delete()
    .eq('id', attachmentId);

  if (dbError) throw dbError;
}

export async function getAttachmentUrl(filePath: string): Promise<string> {
  const { data } = await supabase.storage
    .from('justificatifs')
    .createSignedUrl(filePath, 3600);

  if (!data?.signedUrl) throw new Error('Impossible de générer l\'URL');

  return data.signedUrl;
}

export async function hasAttachment(
  recordType: 'expense_documents' | 'revenue_documents',
  recordId: string
): Promise<boolean> {
  const column = recordType === 'expense_documents' ? 'expense_document_id' : 'revenue_document_id';

  const { data, error } = await supabase
    .from('attachments')
    .select('id')
    .eq(column, recordId)
    .limit(1)
    .maybeSingle();

  if (error) return false;
  return !!data;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function getFileIcon(fileType?: string): string {
  if (!fileType) return '📄';
  const type = fileType.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type)) return '🖼️';
  if (type === 'pdf') return '📕';
  return '📄';
}

export function isImageFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
}

export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf'
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Format non supporté. Utilisez JPG, PNG, WEBP ou PDF.'
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'Fichier trop volumineux. Taille maximale : 10 MB.'
    };
  }

  return { valid: true };
}
