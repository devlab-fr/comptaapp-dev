import { useState } from 'react';

interface TvaDeclareModalProps {
  isOpen: boolean;
  month: string;
  soldeTVA: number;
  onConfirm: (date: string) => void;
  onCancel: () => void;
}

export default function TvaDeclareModal({
  isOpen,
  month,
  soldeTVA,
  onConfirm,
  onCancel,
}: TvaDeclareModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedDate) {
      onConfirm(selectedDate);
    }
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
        <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600', color: '#111827' }}>
          Déclarer la TVA
        </h3>

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
          <div style={{ marginBottom: '8px' }}>
            <span style={{ fontWeight: '600', color: '#374151' }}>Mois concerné : </span>
            <span style={{ color: '#111827' }}>{month}</span>
          </div>
          <div>
            <span style={{ fontWeight: '600', color: '#374151' }}>Solde TVA : </span>
            <span style={{ color: '#111827', fontWeight: '600' }}>
              {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(soldeTVA)}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label
            htmlFor="declaration-date"
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
            }}
          >
            Date de déclaration
          </label>
          <input
            id="declaration-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              outline: 'none',
            }}
          />
        </div>

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
            Annuler
          </button>
          <button
            onClick={handleConfirm}
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
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
