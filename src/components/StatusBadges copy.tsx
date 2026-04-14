interface StatusBadgesProps {
  accountingStatus: string;
  paymentStatus: string;
  paymentEntryId?: string | null;
}

export function StatusBadges({ accountingStatus, paymentStatus, paymentEntryId }: StatusBadgesProps) {
  const effectivePaymentStatus = paymentEntryId ? 'paid' : paymentStatus;
  const getAccountingBadgeStyle = (status: string) => {
    if (status === 'validated') {
      return {
        backgroundColor: '#d1fae5',
        color: '#065f46',
        text: 'Validé'
      };
    }
    return {
      backgroundColor: '#fef3c7',
      color: '#92400e',
      text: 'Brouillon'
    };
  };

  const getPaymentBadgeStyle = (status: string) => {
    if (status === 'paid') {
      return {
        backgroundColor: '#dbeafe',
        color: '#1e40af',
        text: 'Payé'
      };
    }
    return {
      backgroundColor: '#fee2e2',
      color: '#991b1b',
      text: 'Non payé'
    };
  };

  const accountingBadge = getAccountingBadgeStyle(accountingStatus);
  const paymentBadge = getPaymentBadgeStyle(effectivePaymentStatus);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
      <span
        style={{
          padding: '4px 10px',
          fontSize: '12px',
          fontWeight: '600',
          borderRadius: '12px',
          backgroundColor: accountingBadge.backgroundColor,
          color: accountingBadge.color,
          whiteSpace: 'nowrap',
        }}
      >
        {accountingBadge.text}
      </span>
      <span
        style={{
          padding: '4px 10px',
          fontSize: '12px',
          fontWeight: '600',
          borderRadius: '12px',
          backgroundColor: paymentBadge.backgroundColor,
          color: paymentBadge.color,
          whiteSpace: 'nowrap',
        }}
      >
        {paymentBadge.text}
      </span>
    </div>
  );
}
