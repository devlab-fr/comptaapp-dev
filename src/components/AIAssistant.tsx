import { useState, useEffect } from 'react';
import { usePlan } from '../lib/usePlan';
import { useNavigate } from 'react-router-dom';
import { useLegalAcceptance } from '../hooks/useLegalAcceptance';
import { LegalGateModal } from './legal/LegalGateModal';
import { supabase } from '../lib/supabase';

interface AIAssistantProps {
  context: 'synthese' | 'compte-resultat' | 'tva';
  data: Record<string, any>;
  companyId: string;
}

export default function AIAssistant({ context, data, companyId }: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [userInput, setUserInput] = useState('');
  const [showLegalGate, setShowLegalGate] = useState(false);
  const { canUse } = usePlan(companyId);
  const { hasAccepted, loading: legalLoading } = useLegalAcceptance(companyId);
  const navigate = useNavigate();

  const hasAccess = canUse('assistantIA');
  const hasAcceptedIA = !legalLoading && hasAccepted('ia');

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const handleSendMessage = async () => {
    if (!userInput.trim() || loading) return;

    if (!hasAcceptedIA) {
      setShowLegalGate(true);
      return;
    }

    const newUserMessage = { role: 'user' as const, content: userInput };
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Session expirée. Veuillez vous reconnecter.');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          context,
          data,
          userMessage: userInput,
          conversationHistory: messages,
          companyId,
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la requête');
      }

      const result = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
    } catch (error) {
      console.error('AI Assistant error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Désolé, une erreur s'est produite. Veuillez réessayer.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = () => {
    navigate(`/app/company/${companyId}/subscription`);
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '12px 20px',
          backgroundColor: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
          transition: 'all 0.2s',
          zIndex: 1000,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#1d4ed8';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#2563eb';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        Assistant IA
      </button>
    );
  }

  return (
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
        zIndex: 2000,
      }}
      onClick={() => setIsOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
            Assistant IA Comptable
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              color: '#6b7280',
              cursor: 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {!hasAccess ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
            <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
              Assistant IA disponible en Pro++
            </h3>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px', lineHeight: '1.6' }}>
              L'assistant IA vous aide à comprendre vos données comptables de manière pédagogique.
              Passez au plan Pro++ pour y accéder.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleUpgrade}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1d4ed8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }}
              >
                Passer au plan Pro++
              </button>
            </div>
          </div>
        ) : (
          <>
            {!hasAcceptedIA && (
              <div
                style={{
                  padding: '16px 24px',
                  backgroundColor: '#fef3c7',
                  borderBottom: '1px solid #fbbf24',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <p style={{ margin: 0, fontSize: '14px', color: '#92400e', flex: 1 }}>
                  Avant d'utiliser l'assistant IA, veuillez accepter les conditions d'utilisation.
                </p>
                <button
                  onClick={() => setShowLegalGate(true)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    marginLeft: '12px',
                  }}
                >
                  Accepter
                </button>
              </div>
            )}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                  <div style={{ fontSize: '40px', marginBottom: '16px' }}>💡</div>
                  <p style={{ fontSize: '14px', lineHeight: '1.6' }}>
                    Posez vos questions sur les données comptables affichées.
                    L'assistant vous aidera à mieux comprendre leur signification.
                  </p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '80%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      backgroundColor: msg.role === 'user' ? '#2563eb' : '#f3f4f6',
                      color: msg.role === 'user' ? 'white' : '#111827',
                      fontSize: '14px',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {msg.content}
                  </div>
                ))
              )}
              {loading && (
                <div style={{ alignSelf: 'flex-start', color: '#6b7280', fontSize: '14px' }}>
                  L'assistant réfléchit...
                </div>
              )}
            </div>

            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                gap: '12px',
              }}
            >
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Posez votre question..."
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={loading || !userInput.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: loading || !userInput.trim() ? '#d1d5db' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: loading || !userInput.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                Envoyer
              </button>
            </div>
          </>
        )}
      </div>

      <LegalGateModal
        companyId={companyId}
        documentKey="ia"
        isOpen={showLegalGate}
        onClose={() => setShowLegalGate(false)}
        onAccepted={() => {
          setShowLegalGate(false);
        }}
      />
    </div>
  );
}
