import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Footer from '../components/Footer';
import { logoUrl } from '../lib/logoUrl';

export default function CheckEmailPage() {
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const email = location.state?.email || '';

  const handleResendEmail = async () => {
    if (!email) {
      setResendError('Aucun email fourni');
      return;
    }

    setResendLoading(true);
    setResendError(null);
    setResendSuccess(false);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setResendError(error.message);
      } else {
        setResendSuccess(true);
      }
    } catch (err) {
      setResendError('Une erreur est survenue');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '520px',
          padding: '40px',
          backgroundColor: 'white',
          borderRadius: '16px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <img
              src={logoUrl}
              alt="ComptaApp Logo"
              style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 20px',
                display: 'block',
              }}
            />

            <div style={{
              width: '56px',
              height: '56px',
              margin: '0 auto 20px',
              borderRadius: '50%',
              backgroundColor: '#f0fdf4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>

            <h1 style={{
              margin: '0 0 12px 0',
              fontSize: '28px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}>
              Vérifiez votre email
            </h1>

            <p style={{
              margin: '0 0 20px 0',
              color: '#374151',
              fontSize: '16px',
              lineHeight: '1.6',
            }}>
              Un email de confirmation a été envoyé à :
            </p>

            {email && (
              <p style={{
                margin: '0 0 20px 0',
                color: '#28a745',
                fontSize: '16px',
                fontWeight: '600',
              }}>
                {email}
              </p>
            )}

            <p style={{
              margin: '0 0 28px 0',
              color: '#6b7280',
              fontSize: '14px',
              lineHeight: '1.6',
            }}>
              Cliquez sur le lien dans l'email pour activer votre compte et commencer à utiliser ComptaApp.
            </p>

            <div style={{
              padding: '16px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              marginBottom: '28px',
            }}>
              <p style={{
                margin: 0,
                color: '#92400e',
                fontSize: '13px',
                lineHeight: '1.5',
              }}>
                Pensez à vérifier vos spams si vous ne recevez pas l'email dans les prochaines minutes.
              </p>
            </div>
          </div>

          {resendSuccess && (
            <div style={{
              padding: '14px 16px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              color: '#15803d',
              fontSize: '14px',
              marginBottom: '20px',
              textAlign: 'center',
            }}>
              Email renvoyé avec succès
            </div>
          )}

          {resendError && (
            <div style={{
              padding: '14px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: '14px',
              marginBottom: '20px',
              textAlign: 'center',
            }}>
              {resendError}
            </div>
          )}

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {email && (
              <button
                onClick={handleResendEmail}
                disabled={resendLoading || resendSuccess}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: resendSuccess ? '#9ca3af' : '#28a745',
                  backgroundColor: 'white',
                  border: `2px solid ${resendSuccess ? '#e5e7eb' : '#28a745'}`,
                  borderRadius: '8px',
                  cursor: (resendLoading || resendSuccess) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!resendLoading && !resendSuccess) {
                    e.currentTarget.style.backgroundColor = '#f0fdf4';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!resendLoading && !resendSuccess) {
                    e.currentTarget.style.backgroundColor = 'white';
                  }
                }}
              >
                {resendLoading ? 'Envoi en cours...' : (resendSuccess ? 'Email envoyé' : 'Renvoyer l\'email')}
              </button>
            )}

            <button
              onClick={() => navigate('/login')}
              style={{
                width: '100%',
                padding: '14px 20px',
                fontSize: '15px',
                fontWeight: '600',
                color: 'white',
                backgroundColor: '#28a745',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
            >
              Retour à la connexion
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
