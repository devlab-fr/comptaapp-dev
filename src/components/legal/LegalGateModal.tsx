import { useState, useEffect } from 'react';
import { useLegalAcceptance, DocumentKey, LegalDocument } from '../../hooks/useLegalAcceptance';

interface LegalGateModalProps {
  companyId: string;
  documentKey: DocumentKey;
  isOpen: boolean;
  onClose: () => void;
  onAccepted: () => void;
}

export function LegalGateModal({
  companyId,
  documentKey,
  isOpen,
  onClose,
  onAccepted,
}: LegalGateModalProps) {
  const { getActiveDoc, hasAccepted, accept, loading } = useLegalAcceptance(companyId);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const [checkedOnOpen, setCheckedOnOpen] = useState(false);
  const [acceptedLocally, setAcceptedLocally] = useState(false);

  useEffect(() => {
    if (isOpen && !checkedOnOpen) {
      const doc = getActiveDoc(documentKey);
      setDocument(doc);

      if (acceptedLocally || hasAccepted(documentKey)) {
        onAccepted();
        onClose();
      }
      setCheckedOnOpen(true);
    } else if (!isOpen) {
      setCheckedOnOpen(false);
      setAcceptedLocally(false);
      setError(null);
    }
  }, [isOpen, documentKey, acceptedLocally]);

  const handleAccept = async () => {
    if (!document) return;

    setAccepting(true);
    setError(null);

    const result = await accept(documentKey, document.version, {
      source: 'modal',
      timestamp: new Date().toISOString(),
    });

    if (result.success) {
      setAcceptedLocally(true);
      onAccepted();
      onClose();
    } else {
      setError(result.error || 'Erreur lors de l\'acceptation');
    }

    setAccepting(false);
  };

  const handleLater = () => {
    onClose();
  };

  if (!isOpen) return null;
  if (loading || !document) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '12px',
          textAlign: 'center',
        }}>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  const renderMarkdown = (markdown: string) => {
    return markdown.split('\n').map((line, idx) => {
      if (line.startsWith('# ')) {
        return <h1 key={idx} style={{ fontSize: '24px', fontWeight: '700', marginTop: '20px', marginBottom: '16px' }}>{line.substring(2)}</h1>;
      } else if (line.startsWith('## ')) {
        return <h2 key={idx} style={{ fontSize: '20px', fontWeight: '600', marginTop: '16px', marginBottom: '12px', color: '#1a1a1a' }}>{line.substring(3)}</h2>;
      } else if (line.startsWith('### ')) {
        return <h3 key={idx} style={{ fontSize: '16px', fontWeight: '600', marginTop: '12px', marginBottom: '8px', color: '#374151' }}>{line.substring(4)}</h3>;
      } else if (line.startsWith('- ✅') || line.startsWith('- ❌') || line.startsWith('- ✓')) {
        return <li key={idx} style={{ marginLeft: '20px', marginBottom: '6px', lineHeight: '1.6' }}>{line.substring(2)}</li>;
      } else if (line.startsWith('- ')) {
        return <li key={idx} style={{ marginLeft: '20px', marginBottom: '6px', lineHeight: '1.6' }}>{line.substring(2)}</li>;
      } else if (line.includes('**') || line.includes('*')) {
        const parts = line.split(/(\*\*.*?\*\*|\*.*?\*)/g);
        return (
          <p key={idx} style={{ marginBottom: '12px', lineHeight: '1.6', color: '#4b5563' }}>
            {parts.map((part, i) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i}>{part.slice(2, -2)}</strong>;
              } else if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={i}>{part.slice(1, -1)}</em>;
              }
              return part;
            })}
          </p>
        );
      } else if (line.startsWith('---')) {
        return <hr key={idx} style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />;
      } else if (line.trim()) {
        return <p key={idx} style={{ marginBottom: '12px', lineHeight: '1.6', color: '#4b5563' }}>{line}</p>;
      }
      return <br key={idx} />;
    });
  };

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
        zIndex: 10000,
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleLater();
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div
          style={{
            padding: '24px 32px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#1a1a1a' }}>
            {document.title}
          </h2>
          <button
            onClick={handleLater}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '32px',
          }}
        >
          <div style={{ fontSize: '14px' }}>
            {renderMarkdown(document.content_md)}
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '16px 32px',
              backgroundColor: '#fef2f2',
              borderTop: '1px solid #fecaca',
            }}
          >
            <p style={{ margin: 0, color: '#dc2626', fontSize: '14px' }}>{error}</p>
          </div>
        )}

        <div
          style={{
            padding: '24px 32px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={handleLater}
            disabled={accepting}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              border: '2px solid #e5e7eb',
              backgroundColor: 'white',
              color: '#6b7280',
              fontSize: '14px',
              fontWeight: '600',
              cursor: accepting ? 'not-allowed' : 'pointer',
              opacity: accepting ? 0.5 : 1,
            }}
          >
            Plus tard
          </button>
          <button
            onClick={handleAccept}
            disabled={accepting}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: documentKey === 'ia' ? '#8b5cf6' : '#3b82f6',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: accepting ? 'not-allowed' : 'pointer',
              opacity: accepting ? 0.7 : 1,
            }}
          >
            {accepting ? 'Acceptation...' : 'J\'accepte'}
          </button>
        </div>
      </div>
    </div>
  );
}
