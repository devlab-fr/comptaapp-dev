import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';
import { usePlan } from '../lib/usePlan';
import { useUserRole } from '../lib/useUserRole';
import ConfirmModal from '../components/ConfirmModal';

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
  const [filteredFactures, setFilteredFactures] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatut, setFilterStatut] = useState('tous');
  const [filterYear, setFilterYear] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
    factureInfo?: {
      numero?: string;
      client?: string;
      date?: string;
      montantTTC?: number;
    };
  }>({ isOpen: false, message: '', onConfirm: () => {} });

  useEffect(() => {
    if (companyId) {
      loadFactures();
    }
  }, [companyId]);

  useEffect(() => {
    applyFilters();
  }, [factures, searchQuery, filterStatut, filterYear]);

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
        .order('created_at', { ascending: false });

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

  const applyFilters = () => {
    let filtered = [...factures];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(f =>
        f.numero_facture.toLowerCase().includes(query) ||
        f.client_nom?.toLowerCase().includes(query) ||
        f.client_raison_sociale?.toLowerCase().includes(query)
      );
    }

    if (filterStatut !== 'tous') {
      filtered = filtered.filter(f => f.statut_paiement === filterStatut);
    }

    if (filterYear !== 'all') {
      filtered = filtered.filter(f => {
        const year = new Date(f.date_facture).getFullYear().toString();
        return year === filterYear;
      });
    }

    setFilteredFactures(filtered);
    setCurrentPage(1);
  };

  const getYearOptions = () => {
    const currentYear = new Date().getFullYear();
    return [
      { value: 'all', label: 'Toutes' },
      { value: currentYear.toString(), label: currentYear.toString() },
      { value: (currentYear - 1).toString(), label: (currentYear - 1).toString() },
      { value: (currentYear - 2).toString(), label: (currentYear - 2).toString() },
    ];
  };

  const getPaginatedFactures = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredFactures.slice(startIndex, endIndex);
  };

  const totalPages = Math.ceil(filteredFactures.length / itemsPerPage);

  const getStatutLabel = (statut: string) => {
    const labels: { [key: string]: string } = {
      brouillon: 'Brouillon',
      en_attente: 'En attente',
      payee: 'Payée',
      annulee: 'Annulée',
    };
    return labels[statut] || statut;
  };

  const getStatutColor = (statut: string) => {
    const colors: { [key: string]: { bg: string; text: string } } = {
      brouillon: { bg: '#f3f4f6', text: '#6b7280' },
      en_attente: { bg: '#fef3c7', text: '#92400e' },
      payee: { bg: '#d1fae5', text: '#065f46' },
      annulee: { bg: '#fee2e2', text: '#991b1b' },
    };
    return colors[statut] || { bg: '#f3f4f6', text: '#6b7280' };
  };

  const handleAnnuler = (factureId: string) => {
    if (!canModify) return;

    const facture = factures.find((f) => f.id === factureId);
    if (!facture) return;

    const clientName = facture.client_type === 'entreprise'
      ? facture.client_raison_sociale
      : facture.client_nom;

    setConfirmModal({
      isOpen: true,
      message: 'Confirmer l\'annulation de cette facture ?',
      factureInfo: {
        numero: facture.numero_facture,
        client: clientName,
        date: new Date(facture.date_facture).toLocaleDateString('fr-FR'),
        montantTTC: facture.montant_total_ttc,
      },
      onConfirm: async () => {
        setConfirmModal({ isOpen: false, message: '', onConfirm: () => {} });
        try {
          const { error } = await supabase
            .from('factures')
            .update({ statut_paiement: 'annulee', date_paiement: null })
            .eq('id', factureId);

          if (error) throw error;

          loadFactures();
        } catch (error) {
          console.error('Erreur annulation:', error);
          alert('Erreur lors de l\'annulation');
        }
      },
    });
  };

  const handleSupprimer = (factureId: string, statut: string) => {
    if (!canModify) return;

    if (statut !== 'brouillon') {
      alert('Seules les factures brouillon peuvent être supprimées. Utilisez "Annuler" pour les autres factures.');
      return;
    }

    const facture = factures.find((f) => f.id === factureId);
    if (!facture) return;

    const clientName = facture.client_type === 'entreprise'
      ? facture.client_raison_sociale
      : facture.client_nom;

    setConfirmModal({
      isOpen: true,
      message: 'Confirmer la suppression de cette facture ?',
      factureInfo: {
        numero: facture.numero_facture,
        client: clientName,
        date: new Date(facture.date_facture).toLocaleDateString('fr-FR'),
        montantTTC: facture.montant_total_ttc,
      },
      onConfirm: async () => {
        setConfirmModal({ isOpen: false, message: '', onConfirm: () => {} });
        try {
          const { error } = await supabase
            .from('factures')
            .delete()
            .eq('id', factureId);

          if (error) throw error;

          loadFactures();
        } catch (error) {
          console.error('Erreur suppression:', error);
          alert('Erreur lors de la suppression');
        }
      },
    });
  };

  const hasAccess = canUse('facturation');

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
            Module Factures disponible à partir du plan Pro
          </h2>
          <p style={{ fontSize: '16px', color: '#6b7280', marginBottom: '16px', lineHeight: '1.6' }}>
            Le module de facturation est disponible sur tous les plans payants.
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
            Voir les plans payants
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
          <>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#6b7280', marginBottom: '6px' }}>
                    Rechercher
                  </label>
                  <input
                    type="text"
                    placeholder="N° facture ou client..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#6b7280', marginBottom: '6px' }}>
                    Statut
                  </label>
                  <select
                    value={filterStatut}
                    onChange={(e) => setFilterStatut(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    <option value="tous">Tous</option>
                    <option value="brouillon">Brouillon</option>
                    <option value="en_attente">En attente</option>
                    <option value="payee">Payée</option>
                    <option value="annulee">Annulée</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#6b7280', marginBottom: '6px' }}>
                    Année
                  </label>
                  <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    {getYearOptions().map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                {filteredFactures.length} facture{filteredFactures.length > 1 ? 's' : ''} trouvée{filteredFactures.length > 1 ? 's' : ''}
              </div>
            </div>

            {filteredFactures.length === 0 ? (
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
                <p style={{ fontSize: '16px', color: '#6b7280' }}>Aucune facture ne correspond aux filtres</p>
              </div>
            ) : (
              <>
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
                      {getPaginatedFactures().map((facture) => {
                        const colors = getStatutColor(facture.statut_paiement);
                        return (
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
                                backgroundColor: colors.bg,
                                color: colors.text,
                              }}>
                                {getStatutLabel(facture.statut_paiement)}
                              </span>
                            </td>
                            <td style={{ padding: '16px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
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
                                {canModify && facture.statut_paiement !== 'annulee' && facture.statut_paiement !== 'payee' && (
                                  <>
                                    <button
                                      onClick={() => navigate(`/app/company/${companyId}/factures/${facture.id}/edit`)}
                                      style={{
                                        padding: '6px 12px',
                                        backgroundColor: '#dbeafe',
                                        color: '#1e40af',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Modifier
                                    </button>
                                    {facture.statut_paiement !== 'payee' && (
                                      <button
                                        onClick={() => handleAnnuler(facture.id)}
                                        style={{
                                          padding: '6px 12px',
                                          backgroundColor: '#fee2e2',
                                          color: '#991b1b',
                                          border: 'none',
                                          borderRadius: '6px',
                                          fontSize: '13px',
                                          fontWeight: '500',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        Annuler
                                      </button>
                                    )}
                                    {facture.statut_paiement === 'brouillon' && (
                                      <button
                                        onClick={() => handleSupprimer(facture.id, facture.statut_paiement)}
                                        style={{
                                          padding: '6px 12px',
                                          backgroundColor: '#fee2e2',
                                          color: '#991b1b',
                                          border: 'none',
                                          borderRadius: '6px',
                                          fontSize: '13px',
                                          fontWeight: '500',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        Supprimer
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>Affichage:</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    >
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>
                      Affichage {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, filteredFactures.length)} sur {filteredFactures.length} factures
                    </span>
                  </div>

                  {totalPages > 1 && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: currentPage === 1 ? '#f3f4f6' : 'white',
                          color: currentPage === 1 ? '#9ca3af' : '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: '500',
                          cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Précédent
                      </button>
                      <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: '14px', color: '#6b7280' }}>
                        Page {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: currentPage === totalPages ? '#f3f4f6' : 'white',
                          color: currentPage === totalPages ? '#9ca3af' : '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: '500',
                          cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Suivant
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ isOpen: false, message: '', onConfirm: () => {} })}
        factureInfo={confirmModal.factureInfo}
      />
    </>
  );
}
