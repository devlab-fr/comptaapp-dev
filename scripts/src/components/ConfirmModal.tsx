interface ConfirmModalProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  factureInfo?: {
    numero?: string;
    client?: string;
    date?: string;
    montantTTC?: number;
  };
}

export default function ConfirmModal({
  isOpen,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  factureInfo,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: '16px', color: '#111827', marginBottom: factureInfo ? '16px' : '24px', lineHeight: '1.5' }}>
          {message}
        </p>

        {factureInfo && (
          <div
            style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '20px',
              fontSize: '14px',
              lineHeight: '1.6',
            }}
          >
            {factureInfo.numero && (
              <div style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: '600', color: '#374151' }}>Numéro : </span>
                <span style={{ color: '#111827' }}>{factureInfo.numero}</span>
              </div>
            )}
            {factureInfo.client && (
              <div style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: '600', color: '#374151' }}>Client : </span>
                <span style={{ color: '#111827' }}>{factureInfo.client}</span>
              </div>
            )}
            {factureInfo.date && (
              <div style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: '600', color: '#374151' }}>Date : </span>
                <span style={{ color: '#111827' }}>{factureInfo.date}</span>
              </div>
            )}
            {factureInfo.montantTTC !== undefined && (
              <div>
                <span style={{ fontWeight: '600', color: '#374151' }}>Montant TTC : </span>
                <span style={{ color: '#111827' }}>
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(factureInfo.montantTTC)}
                </span>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
