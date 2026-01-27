import { StatusBadges } from './StatusBadges';
import { ActionsDropdown } from './ActionsDropdown';

interface ExpenseMobileCardProps {
  expense: {
    id: string;
    invoice_date: string;
    description: string | null;
    category_name?: string;
    subcategory_name?: string;
    amount_excl_vat: number;
    vat_amount: number;
    amount_incl_vat: number;
    accounting_status: string;
    payment_status: string;
  };
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleValidation?: (id: string) => void;
  onTogglePaid?: (id: string) => void;
}

export function ExpenseMobileCard({
  expense,
  onEdit,
  onDelete,
  onToggleValidation,
  onTogglePaid
}: ExpenseMobileCardProps) {
  return (
    <div
      style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '4px', wordBreak: 'break-word' }}>
            {expense.description || 'Sans libellé'}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            {new Date(expense.invoice_date).toLocaleDateString('fr-FR')}
          </div>
        </div>
        <div style={{ fontSize: '16px', fontWeight: '700', color: '#dc2626', whiteSpace: 'nowrap', marginLeft: '12px' }}>
          {parseFloat(expense.amount_incl_vat.toString()).toFixed(2)} €
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        <div
          style={{
            fontSize: '13px',
            color: '#1f2937',
            padding: '4px 10px',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px',
          }}
        >
          {expense.category_name || '-'}
        </div>
        {expense.subcategory_name && (
          <div
            style={{
              fontSize: '12px',
              color: '#6b7280',
              padding: '4px 10px',
              backgroundColor: '#f9fafb',
              borderRadius: '6px',
            }}
          >
            {expense.subcategory_name}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '13px', color: '#6b7280' }}>
        <span>
          HT: <strong style={{ color: '#1f2937' }}>{parseFloat(expense.amount_excl_vat.toString()).toFixed(2)} €</strong>
        </span>
        <span>
          TVA: <strong style={{ color: '#1f2937' }}>{parseFloat(expense.vat_amount.toString()).toFixed(2)} €</strong>
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <StatusBadges
          accountingStatus={expense.accounting_status}
          paymentStatus={expense.payment_status}
        />
        <ActionsDropdown
          onEdit={() => onEdit(expense.id)}
          onDelete={() => onDelete(expense.id)}
          onToggleValidation={onToggleValidation ? () => onToggleValidation(expense.id) : undefined}
          onTogglePaid={onTogglePaid ? () => onTogglePaid(expense.id) : undefined}
          accountingStatus={expense.accounting_status}
          paymentStatus={expense.payment_status}
        />
      </div>
    </div>
  );
}
