import { useState, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import Footer from '../components/Footer';

/*
  TODO: CONFIGURATION SUPABASE AUTH - URLs de redirection requises

  Pour que le flow "Mot de passe oublié" fonctionne correctement, vous devez configurer
  les URLs de redirection dans votre projet Supabase:

  1. Aller dans Supabase Dashboard > Authentication > URL Configuration

  2. Site URL:
     - Production: https://votre-domaine-production.com
     - Développement: http://localhost:5173

  3. Redirect URLs (Additional Redirect URLs):
     - https://votre-domaine-production.com/auth/callback
     - https://votre-domaine-production.com/reset-password
     - http://localhost:5173/auth/callback (pour dev)
     - http://localhost:5173/reset-password (pour dev)

  Sans ces URLs configurées, les liens de réinitialisation de mot de passe ne fonctionneront pas.
*/

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const { error, data } = await signUp(email, password);

        if (error) {
          setError(error.message);
        } else if (data?.user && !data?.session) {
          navigate('/check-email', { state: { email } });
        } else {
          const redirectTo = searchParams.get('redirect');
          navigate(redirectTo || '/app');
        }
      } else {
        const { error } = await signIn(email, password);

        if (error) {
          setError(error.message);
        } else {
          const redirectTo = searchParams.get('redirect');
          navigate(redirectTo || '/app');
        }
      }
    } catch (err) {
      setError('Une erreur inattendue est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setResetLoading(true);

    try {
      await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setResetSuccess(true);
    } catch (err) {
      console.error(err);
    } finally {
      setResetLoading(false);
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
          maxWidth: '420px',
          padding: '32px',
          backgroundColor: 'white',
          borderRadius: '16px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <img
              src="/logo_carre_comptaapp_format_png.png"
              alt="ComptaApp Logo"
              style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 14px',
                display: 'block',
              }}
            />
            <h1 style={{
              margin: '0 0 8px 0',
              fontSize: '24px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}>
              {isSignUp ? 'Créer un compte' : 'Connexion'}
            </h1>
            <p style={{
              margin: '12px 0 0 0',
              color: '#0a0a0a',
              fontSize: '16px',
              fontWeight: '650',
              lineHeight: '1.4',
              textAlign: 'center',
            }}>
              La gestion comptable de votre entreprise, enfin claire et centralisée.
            </p>
            <p style={{
              margin: '12px auto 0 auto',
              color: '#4b5563',
              fontSize: '14px',
              lineHeight: '1.5',
              textAlign: 'center',
              maxWidth: '360px',
            }}>
              ComptaApp accompagne les entreprises dans le pilotage,
              l'organisation et la collaboration autour de leurs données financières.
            </p>
            <div style={{
              margin: '24px 0',
              padding: '20px',
              backgroundColor: '#f8fdf9',
              borderRadius: '12px',
              border: '1px solid #d1f4dd',
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#15803d',
                  fontSize: '14px',
                }}>
                  <span style={{ fontSize: '16px' }}>✔</span>
                  <span>Données financières centralisées</span>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#15803d',
                  fontSize: '14px',
                }}>
                  <span style={{ fontSize: '16px' }}>✔</span>
                  <span>Collaboration fluide avec vos partenaires</span>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#15803d',
                  fontSize: '14px',
                }}>
                  <span style={{ fontSize: '16px' }}>✔</span>
                  <span>Paramètres clairs et structurés</span>
                </div>
              </div>
            </div>
          </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label htmlFor="email" style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
              }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: '15px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s ease',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#28a745'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
              />
            </div>

            <div>
              <label htmlFor="password" style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
              }}>
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: '15px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s ease',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#28a745'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
              />
              {isSignUp && (
                <p style={{
                  fontSize: '12px',
                  color: '#9ca3af',
                  margin: '6px 0 0 0',
                }}>
                  Minimum 6 caractères
                </p>
              )}
            </div>
          </div>

          {error && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: '14px',
              marginTop: '16px',
            }}>
              {error}
            </div>
          )}

          {!isSignUp && (
            <p style={{
              margin: '20px 0 0 0',
              color: '#6b7280',
              fontSize: '12px',
              textAlign: 'left',
            }}>
              Après connexion, vous accéderez à vos entreprises
              et à l'ensemble de leurs paramètres.
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px 20px',
              fontSize: '15px',
              fontWeight: '600',
              color: 'white',
              backgroundColor: loading ? '#9ca3af' : '#28a745',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'background-color 0.2s ease',
              marginTop: '16px',
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = '#218838';
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = '#28a745';
            }}
          >
            {loading ? 'Chargement...' : (isSignUp ? 'Créer le compte' : 'Se connecter')}
          </button>

          <div style={{
            marginTop: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'center',
          }}>
            {!isSignUp && (
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(true);
                  setResetEmail(email);
                  setResetSuccess(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '400',
                  padding: 0,
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                Mot de passe oublié ?
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '400',
                padding: 0,
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
            >
              {isSignUp ? 'Déjà un compte ? Se connecter' : 'Créer un compte'}
            </button>
          </div>
        </form>
        </div>
      </div>

      {showResetModal && (
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
            padding: '20px',
            zIndex: 1000,
          }}
          onClick={() => setShowResetModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '600px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
              border: '2px solid #e5e7eb',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontSize: '20px',
              fontWeight: '600',
              margin: '0 0 8px 0',
              color: '#1a1a1a',
            }}>
              Réinitialiser le mot de passe
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0 0 24px 0',
              lineHeight: '1.5',
            }}>
              Entrez votre adresse email. Vous recevrez un lien pour créer un nouveau mot de passe.
            </p>

            {!resetSuccess ? (
              <form onSubmit={handleResetPassword}>
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="reset-email" style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                  }}>
                    Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#374151',
                      backgroundColor: '#f3f4f6',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: 'white',
                      backgroundColor: resetLoading ? '#9ca3af' : '#28a745',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: resetLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {resetLoading ? 'Envoi...' : 'Envoyer'}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div style={{
                  padding: '14px 16px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  color: '#15803d',
                  fontSize: '14px',
                  marginBottom: '20px',
                }}>
                  Si un compte existe pour cet email, un lien a été envoyé.
                </div>
                <button
                  onClick={() => setShowResetModal(false)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '16px',
                    fontWeight: '600',
                    color: 'white',
                    backgroundColor: '#28a745',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <Footer />
    </div>
  );
}
