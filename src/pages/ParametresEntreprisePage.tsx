import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import Toast from '../components/Toast';

interface CompanyData {
  id: string;
  name: string;
  legal_form: string;
  siren: string;
  siret: string;
  address: string;
  country: string;
  vat_regime: string;
  fiscal_year_start: string;
  fiscal_year_end: string;
  is_locked: boolean;
}

interface Director {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  start_date: string;
  is_active: boolean;
}

interface Shareholder {
  id: string;
  name: string;
  type: 'person' | 'entity';
  ownership_percentage: number;
  capital_amount: number;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

export default function ParametresEntreprisePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [companyData, setCompanyData] = useState<CompanyData>({
    id: '',
    name: '',
    legal_form: '',
    siren: '',
    siret: '',
    address: '',
    country: 'FR',
    vat_regime: '',
    fiscal_year_start: '',
    fiscal_year_end: '',
    is_locked: false,
  });

  const [directors, setDirectors] = useState<Director[]>([]);
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

  const [showDirectorForm, setShowDirectorForm] = useState(false);
  const [editingDirector, setEditingDirector] = useState<Director | null>(null);
  const [directorForm, setDirectorForm] = useState({
    first_name: '',
    last_name: '',
    role: '',
    start_date: new Date().toISOString().split('T')[0],
    is_active: true,
  });

  const [showShareholderForm, setShowShareholderForm] = useState(false);
  const [editingShareholder, setEditingShareholder] = useState<Shareholder | null>(null);
  const [shareholderForm, setShareholderForm] = useState({
    name: '',
    type: 'person' as 'person' | 'entity',
    ownership_percentage: 0,
    capital_amount: 0,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type });
  };

  const closeToast = () => {
    setToast({ show: false, message: '', type: 'success' });
  };

  useEffect(() => {
    const loadData = async () => {
      if (!companyId) return;

      setLoading(true);

      const { data: company } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .maybeSingle();

      if (company) {
        setCompanyData(company);
      }

      const { data: directorsData } = await supabase
        .from('company_directors')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (directorsData) {
        setDirectors(directorsData);
      }

      const { data: shareholdersData } = await supabase
        .from('company_shareholders')
        .select('*')
        .eq('company_id', companyId)
        .order('ownership_percentage', { ascending: false });

      if (shareholdersData) {
        setShareholders(shareholdersData);
      }

      setLoading(false);
    };

    loadData();
  }, [companyId]);

  const handleCompanyUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { error } = await supabase
      .from('companies')
      .update({
        name: companyData.name,
        legal_form: companyData.legal_form,
        siren: companyData.siren,
        siret: companyData.siret,
        address: companyData.address,
        country: companyData.country,
        vat_regime: companyData.vat_regime,
        fiscal_year_start: companyData.fiscal_year_start || null,
        fiscal_year_end: companyData.fiscal_year_end || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId);

    setSaving(false);

    if (error) {
      showToast('Erreur lors de la sauvegarde', 'error');
    } else {
      showToast('Entreprise mise à jour', 'success');
    }
  };

  const handleAddDirector = () => {
    setEditingDirector(null);
    setDirectorForm({
      first_name: '',
      last_name: '',
      role: '',
      start_date: new Date().toISOString().split('T')[0],
      is_active: true,
    });
    setShowDirectorForm(true);
  };

  const handleEditDirector = (director: Director) => {
    setEditingDirector(director);
    setDirectorForm({
      first_name: director.first_name,
      last_name: director.last_name,
      role: director.role,
      start_date: director.start_date,
      is_active: director.is_active,
    });
    setShowDirectorForm(true);
  };

  const handleSaveDirector = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingDirector) {
      const { error } = await supabase
        .from('company_directors')
        .update({
          ...directorForm,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingDirector.id);

      if (error) {
        showToast('Erreur lors de la mise à jour', 'error');
        return;
      }

      setDirectors(
        directors.map((d) =>
          d.id === editingDirector.id ? { ...editingDirector, ...directorForm } : d
        )
      );
      showToast('Dirigeant mis à jour', 'success');
    } else {
      const { data, error } = await supabase
        .from('company_directors')
        .insert({
          company_id: companyId,
          ...directorForm,
        })
        .select()
        .single();

      if (error || !data) {
        showToast('Erreur lors de l\'ajout', 'error');
        return;
      }

      setDirectors([data, ...directors]);
      showToast('Dirigeant ajouté', 'success');
    }

    setShowDirectorForm(false);
  };

  const handleDeleteDirector = async (id: string) => {
    if (!confirm('Confirmer la suppression de ce dirigeant ?')) return;

    const { error } = await supabase.from('company_directors').delete().eq('id', id);

    if (error) {
      showToast('Erreur lors de la suppression', 'error');
      return;
    }

    setDirectors(directors.filter((d) => d.id !== id));
    showToast('Dirigeant supprimé', 'success');
  };

  const handleAddShareholder = () => {
    setEditingShareholder(null);
    setShareholderForm({
      name: '',
      type: 'person',
      ownership_percentage: 0,
      capital_amount: 0,
    });
    setShowShareholderForm(true);
  };

  const handleEditShareholder = (shareholder: Shareholder) => {
    setEditingShareholder(shareholder);
    setShareholderForm({
      name: shareholder.name,
      type: shareholder.type,
      ownership_percentage: shareholder.ownership_percentage,
      capital_amount: shareholder.capital_amount,
    });
    setShowShareholderForm(true);
  };

  const handleSaveShareholder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingShareholder) {
      const { error } = await supabase
        .from('company_shareholders')
        .update({
          ...shareholderForm,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingShareholder.id);

      if (error) {
        showToast('Erreur lors de la mise à jour', 'error');
        return;
      }

      setShareholders(
        shareholders.map((s) =>
          s.id === editingShareholder.id ? { ...editingShareholder, ...shareholderForm } : s
        )
      );
      showToast('Associé mis à jour', 'success');
    } else {
      const { data, error } = await supabase
        .from('company_shareholders')
        .insert({
          company_id: companyId,
          ...shareholderForm,
        })
        .select()
        .single();

      if (error || !data) {
        showToast('Erreur lors de l\'ajout', 'error');
        return;
      }

      setShareholders([...shareholders, data].sort((a, b) => b.ownership_percentage - a.ownership_percentage));
      showToast('Associé ajouté', 'success');
    }

    setShowShareholderForm(false);
  };

  const handleDeleteShareholder = async (id: string) => {
    if (!confirm('Confirmer la suppression de cet associé ?')) return;

    const { error } = await supabase.from('company_shareholders').delete().eq('id', id);

    if (error) {
      showToast('Erreur lors de la suppression', 'error');
      return;
    }

    setShareholders(shareholders.filter((s) => s.id !== id));
    showToast('Associé supprimé', 'success');
  };

  const totalOwnership = shareholders.reduce((sum, s) => sum + Number(s.ownership_percentage), 0);
  const isCapitalValid = Math.abs(totalOwnership - 100) < 0.01 || shareholders.length === 0;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>Chargement...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <AppHeader subtitle={user?.email} onSignOut={handleSignOut} />

      <main
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '32px 24px',
        }}
      >
        <button
          onClick={() => navigate(`/app/company/${companyId}`)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#6b7280',
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '24px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f9fafb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
          }}
        >
          <span>←</span>
          Retour
        </button>

        <div style={{ marginBottom: '32px' }}>
          <h2
            style={{
              margin: '0 0 8px 0',
              fontSize: '32px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}
          >
            Paramètres Entreprise
          </h2>
          <p
            style={{
              margin: 0,
              color: '#6b7280',
              fontSize: '16px',
            }}
          >
            {companyData.name}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div
            style={{
              padding: '32px',
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
              border: '2px solid #e5e7eb',
            }}
          >
            <h3
              style={{
                margin: '0 0 24px 0',
                fontSize: '20px',
                fontWeight: '600',
                color: '#1a1a1a',
              }}
            >
              Informations Entreprise
            </h3>

            {companyData.is_locked && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: '8px',
                  marginBottom: '24px',
                  fontSize: '14px',
                  color: '#92400e',
                }}
              >
                Les données sont en lecture seule car des écritures comptables validées existent.
              </div>
            )}

            <form onSubmit={handleCompanyUpdate}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                    }}
                  >
                    Dénomination sociale
                  </label>
                  <input
                    type="text"
                    value={companyData.name}
                    onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                    disabled={companyData.is_locked}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      backgroundColor: companyData.is_locked ? '#f3f4f6' : 'white',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                    }}
                  >
                    Forme juridique
                  </label>
                  <select
                    value={companyData.legal_form}
                    onChange={(e) => setCompanyData({ ...companyData, legal_form: e.target.value })}
                    disabled={companyData.is_locked}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      backgroundColor: companyData.is_locked ? '#f3f4f6' : 'white',
                    }}
                  >
                    <option value="">Sélectionner</option>
                    <option value="EI">EI - Entreprise Individuelle</option>
                    <option value="EIRL">EIRL - Entrepreneur Individuel à Responsabilité Limitée</option>
                    <option value="EURL">EURL - Entreprise Unipersonnelle à Responsabilité Limitée</option>
                    <option value="SARL">SARL - Société à Responsabilité Limitée</option>
                    <option value="SASU">SASU - Société par Actions Simplifiée Unipersonnelle</option>
                    <option value="SAS">SAS - Société par Actions Simplifiée</option>
                    <option value="SA">SA - Société Anonyme</option>
                    <option value="SNC">SNC - Société en Nom Collectif</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                    }}
                  >
                    SIREN
                  </label>
                  <input
                    type="text"
                    value={companyData.siren}
                    onChange={(e) => setCompanyData({ ...companyData, siren: e.target.value })}
                    disabled={companyData.is_locked}
                    maxLength={9}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      backgroundColor: companyData.is_locked ? '#f3f4f6' : 'white',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                    }}
                  >
                    SIRET
                  </label>
                  <input
                    type="text"
                    value={companyData.siret}
                    onChange={(e) => setCompanyData({ ...companyData, siret: e.target.value })}
                    disabled={companyData.is_locked}
                    maxLength={14}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      backgroundColor: companyData.is_locked ? '#f3f4f6' : 'white',
                    }}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                    }}
                  >
                    Adresse complète
                  </label>
                  <textarea
                    value={companyData.address}
                    onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
                    disabled={companyData.is_locked}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      resize: 'vertical',
                      backgroundColor: companyData.is_locked ? '#f3f4f6' : 'white',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                    }}
                  >
                    Pays
                  </label>
                  <input
                    type="text"
                    value={companyData.country}
                    onChange={(e) => setCompanyData({ ...companyData, country: e.target.value })}
                    disabled={companyData.is_locked}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      backgroundColor: companyData.is_locked ? '#f3f4f6' : 'white',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                    }}
                  >
                    Régime de TVA
                  </label>
                  <select
                    value={companyData.vat_regime}
                    onChange={(e) => setCompanyData({ ...companyData, vat_regime: e.target.value })}
                    disabled={companyData.is_locked}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      backgroundColor: companyData.is_locked ? '#f3f4f6' : 'white',
                    }}
                  >
                    <option value="">Sélectionner</option>
                    <option value="franchise">Franchise en base de TVA</option>
                    <option value="reel_simplifie">Réel simplifié</option>
                    <option value="reel_normal">Réel normal</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                    }}
                  >
                    Début d'exercice
                  </label>
                  <input
                    type="date"
                    value={companyData.fiscal_year_start}
                    onChange={(e) => setCompanyData({ ...companyData, fiscal_year_start: e.target.value })}
                    disabled={companyData.is_locked}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      backgroundColor: companyData.is_locked ? '#f3f4f6' : 'white',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                    }}
                  >
                    Clôture d'exercice
                  </label>
                  <input
                    type="date"
                    value={companyData.fiscal_year_end}
                    onChange={(e) => setCompanyData({ ...companyData, fiscal_year_end: e.target.value })}
                    disabled={companyData.is_locked}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      backgroundColor: companyData.is_locked ? '#f3f4f6' : 'white',
                    }}
                  />
                </div>
              </div>

              {!companyData.is_locked && (
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      padding: '12px 24px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'white',
                      backgroundColor: '#3b82f6',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                      transition: 'background-color 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!saving) e.currentTarget.style.backgroundColor = '#2563eb';
                    }}
                    onMouseLeave={(e) => {
                      if (!saving) e.currentTarget.style.backgroundColor = '#3b82f6';
                    }}
                  >
                    {saving ? 'Sauvegarde...' : 'Enregistrer'}
                  </button>
                </div>
              )}
            </form>
          </div>

          <div
            style={{
              padding: '32px',
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
              border: '2px solid #e5e7eb',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#1a1a1a',
                }}
              >
                Dirigeants
              </h3>
              <button
                onClick={handleAddDirector}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'white',
                  backgroundColor: '#3b82f6',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                }}
              >
                Ajouter
              </button>
            </div>

            {directors.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                Aucun dirigeant enregistré
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                        Nom
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                        Prénom
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                        Rôle
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                        Date de début
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                        Statut
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {directors.map((director) => (
                      <tr key={director.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                          {director.last_name}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                          {director.first_name}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                          {director.role}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                          {new Date(director.start_date).toLocaleDateString('fr-FR')}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '4px 12px',
                              fontSize: '12px',
                              fontWeight: '600',
                              borderRadius: '12px',
                              backgroundColor: director.is_active ? '#d1fae5' : '#fee2e2',
                              color: director.is_active ? '#065f46' : '#991b1b',
                            }}
                          >
                            {director.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleEditDirector(director)}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: '500',
                              color: '#3b82f6',
                              backgroundColor: 'transparent',
                              border: '1px solid #3b82f6',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              marginRight: '8px',
                            }}
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => handleDeleteDirector(director.id)}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: '500',
                              color: '#dc2626',
                              backgroundColor: 'transparent',
                              border: '1px solid #dc2626',
                              borderRadius: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div
            style={{
              padding: '32px',
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
              border: '2px solid #e5e7eb',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h3
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '20px',
                    fontWeight: '600',
                    color: '#1a1a1a',
                  }}
                >
                  Associés
                </h3>
                {shareholders.length > 0 && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      fontWeight: '500',
                      color: isCapitalValid ? '#059669' : '#f59e0b',
                    }}
                  >
                    Total détenu : {totalOwnership.toFixed(2)}%
                    {!isCapitalValid && ' (doit être égal à 100%)'}
                  </p>
                )}
              </div>
              <button
                onClick={handleAddShareholder}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'white',
                  backgroundColor: '#3b82f6',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                }}
              >
                Ajouter
              </button>
            </div>

            {shareholders.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                Aucun associé enregistré
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                        Nom / Dénomination
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                        Type
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                        % Détention
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                        Montant capital
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shareholders.map((shareholder) => (
                      <tr key={shareholder.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                          {shareholder.name}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '4px 12px',
                              fontSize: '12px',
                              fontWeight: '600',
                              borderRadius: '12px',
                              backgroundColor: shareholder.type === 'person' ? '#dbeafe' : '#fef3c7',
                              color: shareholder.type === 'person' ? '#1e40af' : '#92400e',
                            }}
                          >
                            {shareholder.type === 'person' ? 'Personne physique' : 'Personne morale'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151', textAlign: 'right', fontWeight: '600' }}>
                          {Number(shareholder.ownership_percentage).toFixed(2)}%
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151', textAlign: 'right', fontWeight: '600' }}>
                          {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
                            shareholder.capital_amount
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleEditShareholder(shareholder)}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: '500',
                              color: '#3b82f6',
                              backgroundColor: 'transparent',
                              border: '1px solid #3b82f6',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              marginRight: '8px',
                            }}
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => handleDeleteShareholder(shareholder.id)}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: '500',
                              color: '#dc2626',
                              backgroundColor: 'transparent',
                              border: '1px solid #dc2626',
                              borderRadius: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {showDirectorForm && (
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
            zIndex: 1000,
          }}
          onClick={() => setShowDirectorForm(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: '600', color: '#1a1a1a' }}>
              {editingDirector ? 'Modifier le dirigeant' : 'Ajouter un dirigeant'}
            </h3>

            <form onSubmit={handleSaveDirector}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    Nom
                  </label>
                  <input
                    type="text"
                    value={directorForm.last_name}
                    onChange={(e) => setDirectorForm({ ...directorForm, last_name: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    Prénom
                  </label>
                  <input
                    type="text"
                    value={directorForm.first_name}
                    onChange={(e) => setDirectorForm({ ...directorForm, first_name: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    Rôle
                  </label>
                  <select
                    value={directorForm.role}
                    onChange={(e) => setDirectorForm({ ...directorForm, role: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                    }}
                  >
                    <option value="">Sélectionner</option>
                    <option value="Gérant">Gérant</option>
                    <option value="Co-gérant">Co-gérant</option>
                    <option value="Président">Président</option>
                    <option value="Directeur Général">Directeur Général</option>
                    <option value="Directeur Général Délégué">Directeur Général Délégué</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    Date de début
                  </label>
                  <input
                    type="date"
                    value={directorForm.start_date}
                    onChange={(e) => setDirectorForm({ ...directorForm, start_date: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={directorForm.is_active}
                    onChange={(e) => setDirectorForm({ ...directorForm, is_active: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151', cursor: 'pointer' }}>
                    Actif
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowDirectorForm(false)}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#6b7280',
                    backgroundColor: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'white',
                    backgroundColor: '#3b82f6',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  {editingDirector ? 'Mettre à jour' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showShareholderForm && (
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
            zIndex: 1000,
          }}
          onClick={() => setShowShareholderForm(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: '600', color: '#1a1a1a' }}>
              {editingShareholder ? 'Modifier l\'associé' : 'Ajouter un associé'}
            </h3>

            <form onSubmit={handleSaveShareholder}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    Nom / Dénomination
                  </label>
                  <input
                    type="text"
                    value={shareholderForm.name}
                    onChange={(e) => setShareholderForm({ ...shareholderForm, name: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    Type
                  </label>
                  <select
                    value={shareholderForm.type}
                    onChange={(e) => setShareholderForm({ ...shareholderForm, type: e.target.value as 'person' | 'entity' })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                    }}
                  >
                    <option value="person">Personne physique</option>
                    <option value="entity">Personne morale</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    Pourcentage de détention (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={shareholderForm.ownership_percentage}
                    onChange={(e) => setShareholderForm({ ...shareholderForm, ownership_percentage: Number(e.target.value) })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    Montant du capital détenu (EUR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={shareholderForm.capital_amount}
                    onChange={(e) => setShareholderForm({ ...shareholderForm, capital_amount: Number(e.target.value) })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowShareholderForm(false)}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#6b7280',
                    backgroundColor: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'white',
                    backgroundColor: '#3b82f6',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  {editingShareholder ? 'Mettre à jour' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast.show && (
        <Toast message={toast.message} type={toast.type} onClose={closeToast} />
      )}
    </div>
  );
}
