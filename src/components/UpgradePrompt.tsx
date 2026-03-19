import { useNavigate, useParams } from 'react-router-dom';
import { PlanTier, getPlanDefinition } from '../lib/plans';

interface UpgradePromptProps {
  feature: string;
  requiredPlan: PlanTier;
  style?: React.CSSProperties;
}

export default function UpgradePrompt({ feature, requiredPlan, style }: UpgradePromptProps) {
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();
  const plan = getPlanDefinition(requiredPlan);

  const handleUpgrade = () => {
    if (companyId) {
      navigate(`/app/company/${companyId}/subscription`);
    } else {
      navigate('/app/subscription');
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#fef3c7',
        border: '1px solid #fbbf24',
        borderRadius: '12px',
        padding: '20px',
        textAlign: 'center',
        ...style,
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          backgroundColor: '#fbbf24',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h3
        style={{
          fontSize: '18px',
          fontWeight: '600',
          color: '#92400e',
          margin: '0 0 8px 0',
        }}
      >
        Fonctionnalité {plan.name}
      </h3>
      <p
        style={{
          fontSize: '14px',
          color: '#92400e',
          margin: '0 0 16px 0',
          lineHeight: '1.5',
        }}
      >
        {feature} est disponible à partir du plan <strong>{plan.name}</strong>.
      </p>
      <button
        onClick={handleUpgrade}
        style={{
          padding: '10px 24px',
          fontSize: '14px',
          fontWeight: '600',
          color: 'white',
          backgroundColor: '#f59e0b',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#d97706')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f59e0b')}
      >
        Passer à {plan.name}
      </button>
    </div>
  );
}
