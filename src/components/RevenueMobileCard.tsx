import { StatusBadges } from './StatusBadges';
import { ActionsDropdown } from './ActionsDropdown';

interface RevenueMobileCardProps {
  revenue: {
    id: string;
    invoice_date: string;
    category_name?: string;
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

export function RevenueMobileCard({
  revenue,
  onEdit,
  onDelete,
  onToggleValidation,
  onTogglePaid
}: RevenueMobileCardProps) {
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
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
            {revenue.category_name || 'Sans catégorie'}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            {new Date(revenue.invoice_date).toLocaleDateString('fr-FR')}
          </div>
        </div>
        <div style={{ fontSize: '16px', fontWeight: '700', color: '#16a34a', whiteSpace: 'nowrap', marginLeft: '12px' }}>
          {parseFloat(revenue.amount_incl_vat.toString()).toFixed(2)} €
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '13px', color: '#6b7280' }}>
        <span>
          HT: <strong style={{ color: '#1f2937' }}>{parseFloat(revenue.amount_excl_vat.toString()).toFixed(2)} €</strong>
        </span>
        <span>
          TVA: <strong style={{ color: '#1f2937' }}>{parseFloat(revenue.vat_amount.toString()).toFixed(2)} €</strong>
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <StatusBadges
          accountingStatus={revenue.accounting_status}
          paymentStatus={revenue.payment_status}
        />
        <ActionsDropdown
          onEdit={() => onEdit(revenue.id)}
          onDelete={() => onDelete(revenue.id)}
          onToggleValidation={onToggleValidation ? () => onToggleValidation(revenue.id) : undefined}
          onTogglePaid={onTogglePaid ? () => onTogglePaid(revenue.id) : undefined}
          accountingStatus={revenue.accounting_status}
          paymentStatus={revenue.payment_status}
        />
      </div>
    </div>
  );
}
