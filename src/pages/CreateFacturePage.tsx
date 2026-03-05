import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';

interface LigneFacture {
  description: string;
  quantite: number;
  prix_unitaire_ht: number;
  taux_tva: number;
}

interface Client {
  id: string;
  name: string;
}

export default function CreateFacturePage() {
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();

  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [showNewClient, setShowNewClient] = useState(false);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [dateFacture, setDateFacture] = useState(new Date().toISOString().split('T')[0]);
  const [statutPaiement, setStatutPaiement] = useState('non_payee');
  const [datePaiement, setDatePaiement] = useState('');

  const [newClientName, setNewClientName] = useState('');

  const [lignes, setLignes] = useState<LigneFacture[]>([
    { description: '', quantite: 0, prix_unitaire_ht: 0, taux_tva: 20 }
  ]);

  useEffect(() => {
    if (companyId) {
      loadClients();
    }
  }, [companyId]);

  const loadClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('company_id', companyId);

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des clients:', error);
    }
  };

  const addLigne = () => {
    setLignes([...lignes, { description: '', quantite: 0, prix_unitaire_ht: 0, taux_tva: 20 }]);
  };

  const removeLigne = (index: number) => {
    if (lignes.length > 1) {
      setLignes(lignes.filter((_, i) => i !== index));
    }
  };

  const updateLigne = (index: number, field: keyof LigneFacture, value: string | number) => {
    const newLignes = [...lignes];
    newLignes[index] = { ...newLignes[index], [field]: value };
    setLignes(newLignes);
  };

  const calculateLigneTotals = (ligne: LigneFacture) => {
    const montantHT = ligne.quantite * ligne.prix_unitaire_ht;
    const montantTVA = montantHT * (ligne.taux_tva / 100);
    const montantTTC = montantHT + montantTVA;
    return { montantHT, montantTVA, montantTTC };
  };

  const calculateTotals = () => {
    let totalHT = 0;
    let totalTVA = 0;
    let totalTTC = 0;

    lignes.forEach(ligne => {
      const { montantHT, montantTVA, montantTTC } = calculateLigneTotals(ligne);
      totalHT += montantHT;
      totalTVA += montantTVA;
      totalTTC += montantTTC;
    });

    return { totalHT, totalTVA, totalTTC };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let clientId = selectedClientId;

      if (showNewClient) {
        if (!newClientName.trim()) {
          alert('Le nom du client est obligatoire');
          setLoading(false);
          return;
        }

        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({
            company_id: companyId,
            name: newClientName.trim(),
          })
          .select()
          .single();

        if (clientError) {
          console.error('Erreur client:', JSON.stringify(clientError, null, 2));
          throw clientError;
        }
        clientId = newClient.id;
      }

      if (!clientId) {
        alert('Veuillez sélectionner ou créer un client');
        setLoading(false);
        return;
      }

      const { data: numeroData, error: numeroError } = await supabase
        .rpc('generate_numero_facture', { p_company_id: companyId });

      if (numeroError) {
        console.error('Erreur numéro facture:', JSON.stringify(numeroError, null, 2));
        throw numeroError;
      }

      const totals = calculateTotals();

      const { data: facture, error: factureError } = await supabase
        .from('factures')
        .insert({
          company_id: companyId,
          client_id: clientId,
          numero_facture: numeroData,
          date_facture: dateFacture,
          statut_paiement: statutPaiement,
          date_paiement: statutPaiement === 'payee' ? datePaiement : null,
          montant_total_ht: totals.totalHT,
          montant_total_tva: totals.totalTVA,
          montant_total_ttc: totals.totalTTC,
        })
        .select()
        .single();

      if (factureError) {
        console.error('Erreur facture:', JSON.stringify(factureError, null, 2));
        throw factureError;
      }

      const lignesData = lignes.map((ligne, index) => {
        const { montantHT, montantTVA, montantTTC } = calculateLigneTotals(ligne);
        return {
          facture_id: facture.id,
          description: ligne.description,
          quantite: ligne.quantite,
          prix_unitaire_ht: ligne.prix_unitaire_ht,
          taux_tva: ligne.taux_tva,
          montant_ht: montantHT,
          montant_tva: montantTVA,
          montant_ttc: montantTTC,
          ordre: index,
        };
      });

      const { error: lignesError } = await supabase
        .from('lignes_factures')
        .insert(lignesData);

      if (lignesError) {
        console.error('Erreur lignes:', JSON.stringify(lignesError, null, 2));
        throw lignesError;
      }

      navigate(`/app/company/${companyId}/factures/${facture.id}`);
    } catch (error: any) {
      console.error('Erreur création facture:', JSON.stringify(error, null, 2));
      alert(`Erreur: ${error?.message || 'Erreur inconnue'}`);
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();

  return (
    <>

      <div style={{ padding: '32px 20px', maxWidth: '1000px', margin: '0 auto' }}>
        <BackButton to={`/app/company/${companyId}/factures`} />
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#111827', marginBottom: '32px' }}>
          Nouvelle facture
        </h1>

        <form onSubmit={handleSubmit}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '20px' }}>
              Informations générales
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                Date de facture *
              </label>
              <input
                type="date"
                value={dateFacture}
                onChange={(e) => setDateFacture(e.target.value)}
                required
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                Statut de paiement
              </label>
              <select
                value={statutPaiement}
                onChange={(e) => setStatutPaiement(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              >
                <option value="non_payee">Non payée</option>
                <option value="payee">Payée</option>
              </select>
            </div>

            {statutPaiement === 'payee' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  Date de paiement *
                </label>
                <input
                  type="date"
                  value={datePaiement}
                  onChange={(e) => setDatePaiement(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                />
              </div>
            )}
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '20px' }}>
              Client
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#374151', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  checked={showNewClient}
                  onChange={(e) => setShowNewClient(e.target.checked)}
                />
                Créer un nouveau client
              </label>
            </div>

            {!showNewClient ? (
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  Sélectionner un client *
                </label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                >
                  <option value="">-- Choisir un client --</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  Nom du client *
                </label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  required
                  placeholder="Ex: Jean Dupont ou SARL Martin"
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                />
              </div>
            )}
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0 }}>
                Lignes de facture
              </h2>
              <button
                type="button"
                onClick={addLigne}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                + Ajouter une ligne
              </button>
            </div>

            {lignes.map((ligne, index) => (
              <div key={index} style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>Ligne {index + 1}</span>
                  {lignes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLigne(index)}
                      style={{ padding: '4px 8px', backgroundColor: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Supprimer
                    </button>
                  )}
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    Description *
                  </label>
                  <input
                    type="text"
                    value={ligne.description}
                    onChange={(e) => updateLigne(index, 'description', e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      Quantité *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={ligne.quantite === 0 ? '' : ligne.quantite}
                      onChange={(e) => updateLigne(index, 'quantite', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      required
                      placeholder="1"
                      style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      Prix unitaire HT *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={ligne.prix_unitaire_ht === 0 ? '' : ligne.prix_unitaire_ht}
                      onChange={(e) => updateLigne(index, 'prix_unitaire_ht', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                      required
                      placeholder="0.00"
                      style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      TVA (%) *
                    </label>
                    <select
                      value={ligne.taux_tva}
                      onChange={(e) => updateLigne(index, 'taux_tva', parseFloat(e.target.value))}
                      required
                      style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    >
                      <option value="0">0%</option>
                      <option value="5.5">5,5%</option>
                      <option value="10">10%</option>
                      <option value="20">20%</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: '12px', padding: '8px', backgroundColor: 'white', borderRadius: '4px', fontSize: '13px', color: '#6b7280' }}>
                  Total ligne: {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(calculateLigneTotals(ligne).montantTTC)}
                </div>
              </div>
            ))}
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
              Récapitulatif
            </h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
              <span style={{ color: '#6b7280' }}>Total HT:</span>
              <span style={{ fontWeight: '600', color: '#111827' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totals.totalHT)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
              <span style={{ color: '#6b7280' }}>Total TVA:</span>
              <span style={{ fontWeight: '600', color: '#111827' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totals.totalTVA)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '2px solid #e5e7eb', fontSize: '16px' }}>
              <span style={{ fontWeight: '600', color: '#111827' }}>Total TTC:</span>
              <span style={{ fontWeight: '700', color: '#111827', fontSize: '18px' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totals.totalTTC)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => navigate(`/app/company/${companyId}/factures`)}
              disabled={loading}
              style={{
                padding: '12px 24px',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px 24px',
                backgroundColor: loading ? '#9ca3af' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Création...' : 'Créer la facture'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
