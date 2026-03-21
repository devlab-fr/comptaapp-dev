import { useState } from 'react';
import { uploadAttachment, getAttachments, deleteAttachment, getAttachmentUrl, validateFile, getFileIcon, Attachment } from '../utils/attachments';

interface AttachmentUploadProps {
  companyId: string;
  fiscalYear: number;
  recordType: 'expense_documents' | 'revenue_documents';
  recordId: string;
  disabled?: boolean;
  onAttachmentsChange?: () => void;
  setToast: (toast: { message: string; type: 'success' | 'error' }) => void;
}

export function AttachmentUpload({
  companyId,
  fiscalYear,
  recordType,
  recordId,
  disabled = false,
  onAttachmentsChange,
  setToast
}: AttachmentUploadProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const loadAttachments = async () => {
    if (!recordId) return;
    setLoading(true);
    try {
      const data = await getAttachments(recordType, recordId);
      setAttachments(data);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useState(() => {
    loadAttachments();
  });

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (disabled) return;

    const file = files[0];
    const validation = validateFile(file);

    if (!validation.valid) {
      setToast({ message: validation.error || 'Fichier invalide', type: 'error' });
      return;
    }

    setUploading(true);
    try {
      await uploadAttachment(file, companyId, fiscalYear, recordType, recordId);
      await loadAttachments();
      onAttachmentsChange?.();
      setToast({ message: 'Justificatif ajouté', type: 'success' });
    } catch (err: any) {
      setToast({ message: 'Upload impossible, réessaie.', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (disabled) return;
    if (!confirm('Supprimer ce justificatif ?')) return;

    try {
      await deleteAttachment(attachmentId);
      await loadAttachments();
      onAttachmentsChange?.();
      setToast({ message: 'Justificatif supprimé', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleView = async (attachment: Attachment) => {
    try {
      const url = await getAttachmentUrl(attachment.file_path);
      window.open(url, '_blank');
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280' }}>
        Chargement...
      </div>
    );
  }

  return (
    <div style={{
      padding: '20px',
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
          Justificatif
        </h3>
        {attachments.length === 0 && (
          <span style={{
            padding: '4px 8px',
            backgroundColor: '#fef3c7',
            color: '#92400e',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '600'
          }}>
            Manquant
          </span>
        )}
      </div>

      <input
        id="file-input"
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => {
          handleFileSelect(e.target.files);
          e.target.value = '';
        }}
        disabled={disabled || uploading}
        style={{ display: 'none' }}
      />

      {attachments.length === 0 ? (
        <>
          {!isMobile && (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              style={{
                padding: '32px',
                border: `2px dashed ${dragActive ? '#3b82f6' : '#d1d5db'}`,
                borderRadius: '8px',
                textAlign: 'center',
                backgroundColor: dragActive ? '#eff6ff' : 'white',
                transition: 'all 0.2s',
                marginBottom: '12px'
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📎</div>
              <p style={{ margin: '0', fontSize: '14px', color: '#6b7280' }}>
                Glisse un fichier ici
              </p>
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <label
              htmlFor="file-input"
              style={{
                padding: '12px 24px',
                backgroundColor: disabled || uploading ? '#d1d5db' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: disabled || uploading ? 'not-allowed' : 'pointer',
                display: 'inline-block',
                userSelect: 'none'
              }}
            >
              {uploading ? 'Upload en cours...' : '📎 Joindre un justificatif'}
            </label>
            <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#9ca3af' }}>
              JPG, PNG, WEBP ou PDF · Max 10 MB
            </p>
          </div>
        </>
      ) : (
        <div>
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              style={{
                padding: '16px',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                marginBottom: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '24px' }}>
                  {getFileIcon(attachment.file_type)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
                    {attachment.file_name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {new Date(attachment.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleView(attachment)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Voir
                  </button>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => handleDelete(attachment.id)}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!disabled && (
            <div style={{ marginTop: '12px' }}>
              <label
                htmlFor="file-input"
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'white',
                  color: '#3b82f6',
                  border: '1px solid #3b82f6',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: disabled || uploading ? 'not-allowed' : 'pointer',
                  display: 'inline-block',
                  userSelect: 'none'
                }}
              >
                {uploading ? 'Upload...' : '📎 Joindre un justificatif'}
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
