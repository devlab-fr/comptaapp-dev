import { useState, useRef, useEffect } from 'react';

interface ActionsDropdownProps {
  onEdit: () => void;
  onDelete: () => void;
  onToggleValidation?: () => void;
  onTogglePaid?: () => void;
  accountingStatus?: string;
  paymentStatus?: string;
  readOnly?: boolean;
}

export function ActionsDropdown({
  onEdit,
  onDelete,
  onToggleValidation,
  onTogglePaid,
  accountingStatus = 'draft',
  paymentStatus = 'unpaid',
  readOnly = false
}: ActionsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  if (readOnly) {
    return null;
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '6px 12px',
          fontSize: '18px',
          fontWeight: '600',
          color: '#6b7280',
          backgroundColor: 'white',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          cursor: 'pointer',
          lineHeight: 1,
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f9fafb';
          e.currentTarget.style.borderColor = '#9ca3af';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'white';
          e.currentTarget.style.borderColor = '#d1d5db';
        }}
      >
        ⋯
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 4px)',
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            minWidth: '200px',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => {
              onEdit();
              setIsOpen(false);
            }}
            style={{
              width: '100%',
              padding: '10px 16px',
              textAlign: 'left',
              fontSize: '14px',
              fontWeight: '500',
              color: '#1f2937',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Modifier
          </button>

          {onToggleValidation && (
            <button
              onClick={() => {
                onToggleValidation();
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                padding: '10px 16px',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: '500',
                color: '#1f2937',
                backgroundColor: 'transparent',
                border: 'none',
                borderTop: '1px solid #f3f4f6',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {accountingStatus === 'validated' ? 'Repasser en brouillon' : 'Valider'}
            </button>
          )}

          {onTogglePaid && (
            <button
              onClick={() => {
                onTogglePaid();
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                padding: '10px 16px',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: '500',
                color: '#1f2937',
                backgroundColor: 'transparent',
                border: 'none',
                borderTop: '1px solid #f3f4f6',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {paymentStatus === 'paid' ? 'Marquer comme non payé' : 'Marquer comme payé'}
            </button>
          )}

          <button
            onClick={() => {
              onDelete();
              setIsOpen(false);
            }}
            style={{
              width: '100%',
              padding: '10px 16px',
              textAlign: 'left',
              fontSize: '14px',
              fontWeight: '500',
              color: '#dc2626',
              backgroundColor: 'transparent',
              border: 'none',
              borderTop: '1px solid #f3f4f6',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#fef2f2';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}
