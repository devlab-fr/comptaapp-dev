interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: '#fef3c7', text: '#92400e', label: 'Brouillon' },
  validated: { bg: '#d1fae5', text: '#065f46', label: 'Validé' },
  paid: { bg: '#dbeafe', text: '#1e40af', label: 'Payé' },
  unpaid: { bg: '#fee2e2', text: '#991b1b', label: 'Non payé' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || { bg: '#f3f4f6', text: '#4b5563', label: status };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: '600',
        backgroundColor: config.bg,
        color: config.text,
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  );
}
