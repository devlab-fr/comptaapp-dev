import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';

export default function BillingCancelPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <AppHeader subtitle="" onSignOut={() => {}} />

      <main style={{
        maxWidth: '600px',
        margin: '80px auto',
        padding: '40px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '48px 32px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
        }}>
          <div style={{
            fontSize: '64px',
            marginBottom: '24px',
          }}>
            ✗
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#dc3545',
            margin: '0 0 16px 0',
          }}>
            Paiement annulé
          </h1>
          <p style={{
            fontSize: '18px',
            color: '#6b7280',
            margin: '0 0 32px 0',
          }}>
            Votre paiement a été annulé. Aucune modification n'a été apportée à votre abonnement.
          </p>
          <button
            onClick={() => navigate('/app')}
            style={{
              padding: '12px 32px',
              fontSize: '16px',
              fontWeight: '600',
              color: 'white',
              backgroundColor: '#28a745',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
          >
            Retourner à l'application
          </button>
        </div>
      </main>
    </div>
  );
}
