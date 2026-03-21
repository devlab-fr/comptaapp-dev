import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function CreateCompanyPage() {
  const [companyName, setCompanyName] = useState('');
  const [country, setCountry] = useState('FR');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!user) {
      setError('Session expirée, reconnecte-toi');
      setLoading(false);
      return;
    }

    try {
      const { error: companyError } = await supabase
        .from('companies')
        .insert({
          name: companyName,
          country: country,
        });

      if (companyError) {
        console.error('Error creating company:', companyError);
        if (companyError.message.includes('JWT') || companyError.message.includes('session') || companyError.code === 'PGRST301') {
          setError('Session expirée, reconnecte-toi');
        } else {
          setError(`Erreur: ${companyError.message}`);
        }
        setLoading(false);
        return;
      }

      navigate('/app');
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('Erreur inattendue');
      setLoading(false);
    }
  };

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
            Créer votre entreprise
          </h2>
          <p style={{
            margin: 0,
            color: '#6b7280',
            fontSize: '16px',
          }}>
            Renseignez les informations de votre entreprise
          </p>
        </div>

        <div style={{
          padding: '32px',
          backgroundColor: 'white',
          borderRadius: '16px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
          border: '2px solid #e5e7eb',
        }}>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <div>
              <label htmlFor="companyName" style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
              }}>
                Nom de l'entreprise *
              </label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                placeholder="Ex: Ma société"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label htmlFor="country" style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
              }}>
                Pays
              </label>
              <select
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                }}
              >
                <option value="FR">France</option>
                <option value="BE">Belgique</option>
                <option value="CH">Suisse</option>
                <option value="CA">Canada</option>
              </select>
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
              marginTop: '20px',
            }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={() => navigate('/app')}
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
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                color: 'white',
                backgroundColor: loading ? '#9ca3af' : '#28a745',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#218838';
              }}
              onMouseLeave={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#28a745';
              }}
            >
              {loading ? 'Création...' : 'Créer l\'entreprise'}
            </button>
          </div>
        </form>
        </div>
      </main>
    </div>
  );
}
