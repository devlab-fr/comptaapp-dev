import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';
import { usePlan } from '../lib/usePlan';
import { useUserRole } from '../lib/useUserRole';

interface Facture {
  id: string;
  numero_facture: string;
  date_facture: string;
  statut_paiement: string;
  montant_total_ttc: number;
  client_id: string;
  client_nom?: string;
  client_raison_sociale?: string;
  client_type?: string;
}

export default function FacturesPage() {
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();
  const { canUse, loading: planLoading } = usePlan(companyId);
  const { canModify } = useUserRole(companyId);

  const [factures, setFactures] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      loadFactures();
    }
  }, [companyId]);

  const loadFactures = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('factures')
        .select(`
          id,
          numero_facture,
          date_facture,
          statut_paiement,
          montant_total_ttc,
          client_id,
          clients:clients!factures_client_id_fkey (
            name
          )
        `)
        .eq('company_id', companyId)
        .order('date_facture', { ascending: false, nullsFirst: false });

      if (error) throw error;

      const formattedFactures = (data || []).map((f: any) => ({
        id: f.id,
        numero_facture: f.numero_facture,
        date_facture: f.date_facture,
        statut_paiement: f.statut_paiement,
        montant_total_ttc: f.montant_total_ttc,
        client_id: f.client_id,
        client_nom: f.clients?.name,
        client_raison_sociale: f.clients?.name,
        client_type: 'entreprise',
      }));

      setFactures(formattedFactures);
    } catch (error) {
      console.error('Erreur lors du chargement des factures:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasAccess = canUse('assistantIA');

  if (planLoading) {
    return (
      <div style={{ padding: '32px 20px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
          Chargement...
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <>
        <div style={{ padding: '32px 24px', maxWidth: '1400px', margin: '0 auto' }}>
          <BackButton to={`/app/company/${companyId}`} />
        </div>
        <div style={{ padding: '40px 20px', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>🔒</div>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
            Factures disponibles en Pro++
          </h2>
          <p style={{ fontSize: '16px', color: '#6b7280', marginBottom: '16px', lineHeight: '1.6' }}>
            Le module de facturation est réservé au plan Pro++.
            Créez et gérez vos factures de vente en toute simplicité.
          </p>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '32px', lineHeight: '1.6', fontStyle: 'italic' }}>
            Les factures créées sont des documents commerciaux. L'enregistrement comptable reste une action séparée et contrôlée par l'utilisateur.
          </p>
          <button
            onClick={() => navigate(`/app/company/${companyId}/subscription`)}
            style={{
              padding: '12px 24px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Passer au plan Pro++
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ padding: '32px 20px', maxWidth: '1400px', margin: '0 auto' }}>
        <BackButton to={`/app/company/${companyId}`} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#111827', margin: 0 }}>
            Factures
          </h1>
          {canModify && (
            <button
              onClick={() => navigate(`/app/company/${companyId}/factures/create`)}
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
            >
              + Nouvelle facture
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
            Chargement...
          </div>
        ) : factures.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
            <p style={{ fontSize: '16px', marginBottom: '24px' }}>Aucune facture pour le moment</p>
            {canModify && (
              <button
                onClick={() => navigate(`/app/company/${companyId}/factures/create`)}
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
              >
                Créer ma première facture
              </button>
            )}
          </div>
        ) : (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Numéro
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Date
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Client
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Montant TTC
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Statut
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {factures.map((facture) => (
                  <tr key={facture.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#111827', fontWeight: '500' }}>
                      {facture.numero_facture}
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#6b7280' }}>
                      {new Date(facture.date_facture).toLocaleDateString('fr-FR')}
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#111827' }}>
                      {facture.client_nom || facture.client_raison_sociale}
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#111827', textAlign: 'right', fontWeight: '600' }}>
                      {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(facture.montant_total_ttc)}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: facture.statut_paiement === 'payee' ? '#d1fae5' : '#fee2e2',
                        color: facture.statut_paiement === 'payee' ? '#065f46' : '#991b1b',
                      }}>
                        {facture.statut_paiement === 'payee' ? 'Payée' : 'Non payée'}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <button
                        onClick={() => navigate(`/app/company/${companyId}/factures/${facture.id}`)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#f3f4f6',
                          color: '#374151',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: '500',
                          cursor: 'pointer',
                        }}
                      >
                        Voir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
