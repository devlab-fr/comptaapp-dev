import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import InviteAccountantModal from './InviteAccountantModal';

interface Member {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  user_email?: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  token: string;
}

interface MembersManagementProps {
  companyId: string;
  canManageMembers: boolean;
}

export default function MembersManagement({ companyId, canManageMembers }: MembersManagementProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copyToast, setCopyToast] = useState(false);

  useEffect(() => {
    loadData();
  }, [companyId]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadMembers(), loadInvitations()]);
    setLoading(false);
  };

  const loadMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, user_id, role, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const membersWithEmails = await Promise.all(
        (data || []).map(async (member) => {
          const { data: userData } = await supabase.auth.admin.getUserById(member.user_id);
          return {
            ...member,
            user_email: userData?.user?.email,
          };
        })
      );

      setMembers(membersWithEmails);
    } catch (err) {
      console.error('Error loading members:', err);
    }
  };

  const loadInvitations = async () => {
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvitations(data || []);
    } catch (err) {
      console.error('Error loading invitations:', err);
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;
      await loadInvitations();
    } catch (err) {
      console.error('Error canceling invitation:', err);
    }
  };

  const copyInviteLink = async (token: string) => {
    const inviteUrl = `${window.location.origin}/accept-invitation/${token}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    } catch (err) {
      console.error('Error copying link:', err);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return { bg: '#e6f4ea', color: '#15803d', label: 'Propriétaire' };
      case 'admin':
        return { bg: '#f0fdf4', color: '#15803d', label: 'Administrateur' };
      case 'accountant':
        return { bg: '#fef3c7', color: '#92400e', label: 'Comptable' };
      case 'viewer':
        return { bg: '#f3f4f6', color: '#374151', label: 'Lecteur' };
      default:
        return { bg: '#f3f4f6', color: '#6b7280', label: role };
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>Chargement...</div>;
  }

  return (
    <div style={{ marginTop: '24px' }}>
      {canManageMembers && (
        <div style={{
          padding: '24px',
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '10px',
          marginBottom: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          flexWrap: 'wrap',
        }}>
          <p style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            lineHeight: '1.5',
            maxWidth: '520px',
            flex: '1 1 auto',
          }}>
            Accès en lecture et suivi uniquement.{' '}
            Aucun impact sur vos données.
          </p>
          <button
            onClick={() => setShowInviteModal(true)}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'white',
              backgroundColor: '#28a745',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#218838';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#28a745';
            }}
          >
            Inviter un comptable
          </button>
        </div>
      )}

      <div style={{ marginBottom: '32px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#111', marginBottom: '4px', textTransform: 'uppercase' }}>
          Membres actuels ({members.length})
        </h4>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#374151' }}>
          Les membres actuels ont déjà accès à cet espace selon leur rôle.
        </p>
        {members.length === 1 ? (
          <div style={{ textAlign: 'center', padding: '32px 24px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <p style={{ color: '#111', fontSize: '14px', fontWeight: '600', margin: '0 0 8px 0' }}>
              Aucun membre supplémentaire pour le moment.
            </p>
            <p style={{ color: '#374151', fontSize: '14px', margin: 0 }}>
              Vous pouvez inviter des collaborateurs ou partenaires selon vos besoins.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {members.map((member) => {
              const roleStyle = getRoleBadgeColor(member.role);
              const isOwner = member.role === 'owner';
              const showMaskedEmail = !member.user_email;
              return (
                <div
                  key={member.id}
                  style={{
                    padding: '16px',
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: showMaskedEmail ? '600' : '500', color: showMaskedEmail ? '#111' : '#1a1a1a', marginBottom: '4px' }}>
                      {member.user_email || 'Email masqué (compte propriétaire)'}
                    </div>
                    {isOwner && showMaskedEmail ? (
                      <div style={{ fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
                        Compte propriétaire de l'entreprise
                      </div>
                    ) : null}
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      Membre depuis {new Date(member.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '4px 12px',
                      backgroundColor: roleStyle.bg,
                      color: roleStyle.color,
                      fontSize: '13px',
                      fontWeight: isOwner ? '600' : '500',
                      borderRadius: '6px',
                    }}
                  >
                    {roleStyle.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{
        padding: '20px',
        backgroundColor: '#f9fafb',
        borderRadius: '10px',
      }}>
        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#111', marginBottom: '4px', textTransform: 'uppercase' }}>
          Invitations en attente ({invitations.length})
        </h4>
        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#374151' }}>
          Les invitations permettent à une personne de rejoindre cet espace après création ou connexion à son compte.
        </p>
        {invitations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <p style={{ color: '#111', fontSize: '14px', fontWeight: '600', margin: '0 0 8px 0' }}>
              Aucune invitation en attente.
            </p>
            <p style={{ color: '#374151', fontSize: '14px', margin: 0 }}>
              Les invitations envoyées apparaîtront ici jusqu'à leur acceptation.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {invitations.map((invitation) => {
              const roleStyle = getRoleBadgeColor(invitation.role);
              const inviteUrl = `${window.location.origin}/accept-invitation/${invitation.token}`;
              return (
                <div
                  key={invitation.id}
                  style={{
                    padding: '20px',
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                    marginBottom: '16px',
                    paddingBottom: '16px',
                    borderBottom: '1px solid #f3f4f6',
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Email invité
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: '500', color: '#111' }}>
                        {invitation.email}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Rôle
                      </div>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        backgroundColor: roleStyle.bg,
                        color: roleStyle.color,
                        fontSize: '13px',
                        fontWeight: '500',
                        borderRadius: '6px',
                      }}>
                        {roleStyle.label}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Expiration
                      </div>
                      <div style={{ fontSize: '14px', color: '#374151' }}>
                        {new Date(invitation.expires_at).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    padding: '14px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    marginBottom: '14px',
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#374151', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🔗</span>
                      <span>LIEN D'INVITATION</span>
                    </div>
                    <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#374151', lineHeight: '1.5' }}>
                      Ce lien est personnel et sécurisé. Il permet au destinataire de rejoindre l'entreprise sans configuration technique.
                    </p>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}>
                      <input
                        type="text"
                        readOnly
                        value={inviteUrl}
                        style={{
                          flex: 1,
                          minWidth: '200px',
                          padding: '10px 12px',
                          fontSize: '13px',
                          color: '#4b5563',
                          backgroundColor: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          outline: 'none',
                        }}
                      />
                      <button
                        onClick={() => copyInviteLink(invitation.token)}
                        style={{
                          padding: '10px 18px',
                          fontSize: '13px',
                          fontWeight: '500',
                          color: '#374151',
                          backgroundColor: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#f9fafb';
                          e.currentTarget.style.borderColor = '#9ca3af';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                          e.currentTarget.style.borderColor = '#d1d5db';
                        }}
                      >
                        📋 Copier
                      </button>
                    </div>
                  </div>

                  <div style={{
                    padding: '14px',
                    backgroundColor: '#f0fdf4',
                    borderRadius: '8px',
                    borderLeft: '3px solid #28a745',
                    marginBottom: '12px',
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>ℹ️</span>
                      <span>Comment le comptable rejoint l'entreprise</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>
                      <div style={{ marginBottom: '4px', display: 'flex', gap: '8px' }}>
                        <span style={{ fontWeight: '600', color: '#28a745' }}>1.</span>
                        <span>Cliquer sur le lien d'invitation</span>
                      </div>
                      <div style={{ marginBottom: '4px', display: 'flex', gap: '8px' }}>
                        <span style={{ fontWeight: '600', color: '#28a745' }}>2.</span>
                        <span>Se connecter ou créer un compte avec l'email invité</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ fontWeight: '600', color: '#28a745' }}>3.</span>
                        <span>Accès automatique à l'entreprise</span>
                      </div>
                    </div>
                  </div>

                  {canManageMembers && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => cancelInvitation(invitation.id)}
                        style={{
                          padding: '8px 16px',
                          fontSize: '13px',
                          fontWeight: '500',
                          color: '#dc2626',
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#fee2e2';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = '#fef2f2';
                        }}
                      >
                        Annuler l'invitation
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showInviteModal && (
        <InviteAccountantModal
          companyId={companyId}
          onClose={() => setShowInviteModal(false)}
          onSuccess={loadData}
        />
      )}

      {copyToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '12px 24px',
          backgroundColor: '#28a745',
          color: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: '14px',
          fontWeight: '500',
          zIndex: 1000,
        }}>
          Lien copié dans le presse-papiers
        </div>
      )}
    </div>
  );
}
