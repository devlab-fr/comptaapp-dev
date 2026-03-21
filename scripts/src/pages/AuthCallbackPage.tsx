import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const type = searchParams.get('type');
      const code = searchParams.get('code');

      if (type === 'recovery') {
        navigate('/reset-password');
        return;
      }

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          console.error('Auth callback error (code exchange):', error);
          setError(error.message);
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        if (data.session) {
          navigate('/app');
        } else {
          navigate('/login');
        }
      } else {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Auth callback error:', error);
          setError(error.message);
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        if (data.session) {
          navigate('/app');
        } else {
          navigate('/login');
        }
      }
    } catch (err) {
      console.error('Unexpected callback error:', err);
      setError('Une erreur inattendue est survenue');
      setTimeout(() => navigate('/login'), 3000);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        maxWidth: '440px',
        width: '100%',
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05)',
        padding: '48px 40px',
        textAlign: 'center',
      }}>
        {error ? (
          <>
            <div style={{
              width: '48px',
              height: '48px',
              margin: '0 auto 24px',
              borderRadius: '50%',
              backgroundColor: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#dc2626"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              margin: '0 0 8px 0',
              color: '#1a1a1a',
            }}>
              Erreur d'authentification
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0 0 24px 0',
            }}>
              {error}
            </p>
            <p style={{
              fontSize: '13px',
              color: '#9ca3af',
              margin: 0,
            }}>
              Redirection vers la page de connexion...
            </p>
          </>
        ) : (
          <>
            <div style={{
              width: '48px',
              height: '48px',
              margin: '0 auto 24px',
              border: '4px solid #e5e7eb',
              borderTopColor: '#28a745',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}></div>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              margin: '0 0 8px 0',
              color: '#1a1a1a',
            }}>
              Authentification en cours
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: 0,
            }}>
              Veuillez patienter...
            </p>
          </>
        )}

        <style>
          {`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    </div>
  );
}
