import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface AccountingLinkButtonProps {
  companyId: string;
  documentId: string;
  documentType: 'expense' | 'revenue';
  isValidated: boolean;
  linkedEntryId: string | null;
  onLinkCreated?: () => void;
}

export function AccountingLinkButton({
  companyId,
  documentId,
  documentType,
  isValidated,
  linkedEntryId,
}: AccountingLinkButtonProps) {
  const navigate = useNavigate();
  const [entryNumber, setEntryNumber] = useState<string | null>(null);

  useEffect(() => {
    if (linkedEntryId) {
      loadEntryNumber();
    }
  }, [linkedEntryId]);

  const loadEntryNumber = async () => {
    if (!linkedEntryId) return;

    try {
      const { data, error } = await supabase
        .from('accounting_entries')
        .select('entry_number')
        .eq('id', linkedEntryId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setEntryNumber(data.entry_number);
      }
    } catch (err) {
      console.error('Error loading entry number:', err);
    }
  };

  const handleCreateEntry = () => {
    const params = new URLSearchParams({
      source: documentType,
      documentId: documentId
    });
    navigate(`/app/company/${companyId}/comptabilite?${params.toString()}`);
  };

  const handleViewEntry = () => {
    navigate(`/app/company/${companyId}/comptabilite?tab=list`);
  };

  if (!isValidated) {
    return null;
  }

  if (linkedEntryId) {
    return (
      <button
        onClick={handleViewEntry}
        style={{
          padding: '8px 16px',
          backgroundColor: '#dcfce7',
          color: '#166534',
          border: '1px solid #86efac',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: '500',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        <span>✓</span>
        <span>Comptabilisé</span>
        {entryNumber && <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>({entryNumber})</span>}
      </button>
    );
  }

  return (
    <button
      onClick={handleCreateEntry}
      style={{
        padding: '8px 16px',
        backgroundColor: '#eff6ff',
        color: '#1e40af',
        border: '1px solid #3b82f6',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '500',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}
    >
      <span>📒</span>
      <span>Créer l'écriture comptable</span>
    </button>
  );
}
