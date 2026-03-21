import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type PageState = 'loading' | 'error' | 'wrongEmail' | 'needLogin' | 'accepting' | 'success';

export default function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<any>(null);
  const [acceptedCompanyName, setAcceptedCompanyName] = useState<string>('');

  useEffect(() => {
    if (token) {
      loadInvitation();
    }
  }, [token, user]);

  const loadInvitation = async () => {
    try {
      setPageState('loading');
      setError(null);

      const { data: inviteData, error: inviteError } = await supabase
        .from('invitations')
        .select('*, companies(name)')
        .eq('token', token)
        .maybeSingle();

      if (inviteError || !inviteData) {
        setError('Invitation introuvable ou expirée');
        setPageState('error');
        return;
      }

      if (inviteData.status !== 'pending') {
        setError('Cette invitation a déjà été utilisée');
        setPageState('error');
        return;
      }

      if (new Date(inviteData.expires_at) < new Date()) {
        setError('Cette invitation a expiré');
        setPageState('error');
        return;
      }

      setInvitation(inviteData);

      if (user) {
        if (user.email?.toLowerCase() === inviteData.email.toLowerCase()) {
          setPageState('accepting');
          await acceptInvitation(inviteData);
        } else {
          setPageState('wrongEmail');
        }
      } else {
        setPageState('needLogin');
      }
    } catch (err) {
      console.error('Error loading invitation:', err);
      setError('Erreur lors du chargement de l\'invitation');
      setPageState('error');
    }
  };

  const acceptInvitation = async (inviteData: any) => {
    try {
      const { error: memberError } = await supabase
        .from('memberships')
        .insert({
          company_id: inviteData.company_id,
          user_id: user!.id,
          role: inviteData.role,
        });

      if (memberError) {
        if (memberError.code === '23505') {
          setError('Vous êtes déjà membre de cette entreprise');
        } else {
          throw memberError;
        }
        setPageState('error');
        return;
      }

      await supabase
        .from('invitations')
        .update({ status: 'accepted' })
        .eq('id', inviteData.id);

      setAcceptedCompanyName(inviteData.companies?.name || 'l\'entreprise');
      setPageState('success');
    } catch (err) {
      console.error('Error accepting invitation:', err);
      setError('Erreur lors de l\'acceptation de l\'invitation');
      setPageState('error');
    }
  };

  const handleSwitchAccount = async () => {
    await supabase.auth.signOut();
    navigate(`/login?redirect=/accept-invitation/${token}`);
  };

  if (pageState === 'loading') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <main style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '32px 24px',
        }}>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{
              margin: '0 0 8px 0',
              fontSize: '32px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}>
              Invitation
            </h2>
            <p style={{
              margin: 0,
              color: '#6b7280',
              fontSize: '16px',
            }}>
              Chargement de l'invitation
            </p>
          </div>

          <div style={{
            padding: '32px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
            border: '2px solid #e5e7eb',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              Chargement...
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (pageState === 'accepting') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <main style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '32px 24px',
        }}>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{
              margin: '0 0 8px 0',
              fontSize: '32px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}>
              Acceptation en cours
            </h2>
            <p style={{
              margin: 0,
              color: '#6b7280',
              fontSize: '16px',
            }}>
              Traitement de l'invitation
            </p>
          </div>

          <div style={{
            padding: '32px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
            border: '2px solid #e5e7eb',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              Acceptation en cours...
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <main style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '32px 24px',
        }}>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{
              margin: '0 0 8px 0',
              fontSize: '32px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}>
              Invitation invalide
            </h2>
            <p style={{
              margin: 0,
              color: '#6b7280',
              fontSize: '16px',
            }}>
              Cette invitation ne peut pas être acceptée
            </p>
          </div>

          <div style={{
            padding: '32px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
            border: '2px solid #e5e7eb',
          }}>
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '14px',
              marginBottom: '24px',
            }}>
              {error}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => navigate('/app')}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'white',
                  backgroundColor: '#28a745',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#218838';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#28a745';
                }}
              >
                Retour à l'accueil
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (pageState === 'wrongEmail' && invitation && user) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <main style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '32px 24px',
        }}>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{
              margin: '0 0 8px 0',
              fontSize: '32px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}>
              Compte incorrect
            </h2>
            <p style={{
              margin: 0,
              color: '#6b7280',
              fontSize: '16px',
            }}>
              Cette invitation est destinée à un autre compte
            </p>
          </div>

          <div style={{
            padding: '32px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
            border: '2px solid #e5e7eb',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px',
              marginBottom: '20px',
            }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                }}>
                  Entreprise
                </label>
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827',
                }}>
                  {invitation.companies?.name || 'Entreprise'}
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                }}>
                  Email invité
                </label>
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fde68a',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#92400e',
                }}>
                  {invitation.email}
                </div>
              </div>
            </div>

            <div style={{
              padding: '12px 16px',
              backgroundColor: '#fffbeb',
              borderRadius: '8px',
              border: '1px solid #fde68a',
              fontSize: '14px',
              color: '#92400e',
              marginBottom: '20px',
            }}>
              <strong>Connecté avec :</strong> {user.email}
            </div>

            <div style={{
              padding: '12px 16px',
              backgroundColor: '#eff6ff',
              borderRadius: '8px',
              border: '1px solid #bfdbfe',
              fontSize: '14px',
              color: '#1e40af',
              marginBottom: '24px',
            }}>
              Pour accepter cette invitation, connectez-vous avec l'adresse email invitée.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleSwitchAccount}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'white',
                  backgroundColor: '#28a745',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#218838';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#28a745';
                }}
              >
                Changer de compte
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (pageState === 'needLogin' && invitation) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <main style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '32px 24px',
        }}>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{
              margin: '0 0 8px 0',
              fontSize: '32px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}>
              Invitation reçue
            </h2>
            <p style={{
              margin: 0,
              color: '#6b7280',
              fontSize: '16px',
            }}>
              Rejoignez {invitation.companies?.name || 'l\'entreprise'}
            </p>
          </div>

          <div style={{
            padding: '32px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
            border: '2px solid #e5e7eb',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px',
              marginBottom: '20px',
            }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                }}>
                  Entreprise
                </label>
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827',
                }}>
                  {invitation.companies?.name || 'Entreprise'}
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                }}>
                  Email invité
                </label>
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#065f46',
                }}>
                  {invitation.email}
                </div>
              </div>
            </div>

            <div style={{
              padding: '12px 16px',
              backgroundColor: '#eff6ff',
              borderRadius: '8px',
              border: '1px solid #bfdbfe',
              fontSize: '14px',
              color: '#1e40af',
              marginBottom: '24px',
            }}>
              Pour accepter cette invitation, vous devez créer un compte ou vous connecter avec l'adresse email invitée.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => navigate(`/login?redirect=/accept-invitation/${token}`)}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#6b7280',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                }}
              >
                Créer un compte
              </button>
              <button
                onClick={() => navigate(`/login?redirect=/accept-invitation/${token}`)}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'white',
                  backgroundColor: '#28a745',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#218838';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#28a745';
                }}
              >
                Se connecter
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <main style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '32px 24px',
        }}>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{
              margin: '0 0 8px 0',
              fontSize: '32px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}>
              Invitation acceptée
            </h2>
            <p style={{
              margin: 0,
              color: '#6b7280',
              fontSize: '16px',
            }}>
              Vous avez rejoint {acceptedCompanyName}
            </p>
          </div>

          <div style={{
            padding: '32px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
            border: '2px solid #e5e7eb',
          }}>
            <div style={{
              padding: '16px',
              backgroundColor: '#f0fdf4',
              borderRadius: '8px',
              border: '1px solid #a7f3d0',
              marginBottom: '24px',
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#065f46',
                marginBottom: '6px',
              }}>
                Accès accordé
              </div>
              <div style={{
                fontSize: '14px',
                color: '#047857',
                lineHeight: '1.5',
              }}>
                Vous pouvez désormais accéder aux données de l'entreprise
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => navigate('/app')}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'white',
                  backgroundColor: '#28a745',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#218838';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#28a745';
                }}
              >
                Accéder à l'application
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return null;
}
