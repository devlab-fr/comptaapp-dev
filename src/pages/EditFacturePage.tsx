import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';

interface LigneFacture {
  id?: string;
  description: string;
  quantite: number;
  prix_unitaire_ht: number;
  taux_tva: number;
  category_id: string;
}

interface Client {
  id: string;
  name: string;
}

interface InvoiceRecipient {
  id: string;
  name: string;
  type: 'particulier' | 'entreprise';
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  siren?: string | null;
  vat_number?: string | null;
}

interface RevenueCategory {
  id: string;
  name: string;
}

export default function EditFacturePage() {
  const navigate = useNavigate();
  const { companyId, factureId } = useParams<{ companyId: string; factureId: string }>();

  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<RevenueCategory[]>([]);
  const [companyVatRegime, setCompanyVatRegime] = useState<string>('');

  const [selectedClientId, setSelectedClientId] = useState('');
  const [dateFacture, setDateFacture] = useState('');
  const [statutPaiement, setStatutPaiement] = useState('en_attente');
  const [datePaiement, setDatePaiement] = useState('');

  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<InvoiceRecipient | null>(null);

  const [clientType, setClientType] = useState<'particulier' | 'entreprise'>('particulier');
  const [clientName, setClientName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('France');
  const [email, setEmail] = useState('');
  const [siren, setSiren] = useState('');
  const [vatNumber, setVatNumber] = useState('');

  const [lignes, setLignes] = useState<LigneFacture[]>([
    { description: '', quantite: 0, prix_unitaire_ht: 0, taux_tva: 20, category_id: '' }
  ]);

  const [remiseType, setRemiseType] = useState<'aucune' | 'pct' | 'fixe'>('aucune');
  const [remiseValue, setRemiseValue] = useState(0);

  useEffect(() => {
    if (companyId && factureId) {
      loadCompanyVatRegime();
      loadClients();
      loadCategories();
      loadFacture();
    }
  }, [companyId, factureId]);

  const loadCompanyVatRegime = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('vat_regime')
        .eq('id', companyId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setCompanyVatRegime(data.vat_regime || '');
      }
    } catch (error) {
      console.error('Erreur lors du chargement du régime TVA:', error);
    }
  };

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

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('revenue_categories')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des catégories:', error);
    }
  };

  const loadFacture = async () => {
    setLoadingData(true);
    try {
      const { data: factureData, error: factureError } = await supabase
        .from('factures')
        .select(`
          *,
          clients:clients!factures_client_id_fkey (id, name)
        `)
        .eq('id', factureId)
        .single();

      if (factureError) throw factureError;

      setSelectedClientId(factureData.client_id);
      setDateFacture(factureData.date_facture);
      setStatutPaiement(factureData.statut_paiement);
      setDatePaiement(factureData.date_paiement || '');
      setRecipientId(factureData.recipient_id);
      setRemiseType(factureData.remise_type || 'aucune');
      setRemiseValue(factureData.remise_value || 0);

      if (factureData.recipient_id) {
        const { data: recipientData, error: recipientError } = await supabase
          .from('invoice_recipients')
          .select('*')
          .eq('id', factureData.recipient_id)
          .single();

        if (!recipientError && recipientData) {
          setRecipient(recipientData);
          setClientType(recipientData.type);
          setClientName(recipientData.name);
          setAddressLine1(recipientData.address_line1 || '');
          setAddressLine2(recipientData.address_line2 || '');
          setPostalCode(recipientData.postal_code || '');
          setCity(recipientData.city || '');
          setCountry(recipientData.country || 'France');
          setEmail(recipientData.email || '');
          setSiren(recipientData.siren || '');
          setVatNumber(recipientData.vat_number || '');
        }
      }

      const { data: lignesData, error: lignesError } = await supabase
        .from('lignes_factures')
        .select('*')
        .eq('facture_id', factureId)
        .order('ordre', { ascending: true });

      if (lignesError) throw lignesError;

      if (lignesData && lignesData.length > 0) {
        setLignes(lignesData.map(l => ({
          id: l.id,
          description: l.description,
          quantite: l.quantite,
          prix_unitaire_ht: l.prix_unitaire_ht,
          taux_tva: l.taux_tva,
          category_id: l.category_id || '',
        })));
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la facture:', error);
      alert('Erreur lors du chargement de la facture');
      navigate(`/app/company/${companyId}/factures`);
    } finally {
      setLoadingData(false);
    }
  };

  const addLigne = () => {
    const tauxTva = companyVatRegime === 'franchise' ? 0 : 20;
    setLignes([...lignes, { description: '', quantite: 0, prix_unitaire_ht: 0, taux_tva: tauxTva, category_id: '' }]);
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

    let montantRemise = 0;
    if (remiseType === 'pct') {
      montantRemise = totalHT * (remiseValue / 100);
    } else if (remiseType === 'fixe') {
      montantRemise = remiseValue;
    }

    const totalHTApresRemise = totalHT - montantRemise;

    let totalTVAApresRemise = 0;
    if (montantRemise > 0 && totalHT > 0) {
      const ratioRemise = totalHTApresRemise / totalHT;
      totalTVAApresRemise = totalTVA * ratioRemise;
    } else {
      totalTVAApresRemise = totalTVA;
    }

    const totalTTCApresRemise = totalHTApresRemise + totalTVAApresRemise;

    return {
      totalHT,
      montantRemise,
      totalHTApresRemise,
      totalTVA: totalTVAApresRemise,
      totalTTC: totalTTCApresRemise
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      for (const ligne of lignes) {
        if (!ligne.category_id) {
          alert('Chaque ligne de facture doit avoir une catégorie');
          setLoading(false);
          return;
        }
      }
      if (recipientId) {
        const { error: recipientError } = await supabase
          .from('invoice_recipients')
          .update({
            name: clientName.trim(),
            type: clientType,
            address_line1: addressLine1.trim() || null,
            address_line2: addressLine2.trim() || null,
            postal_code: postalCode.trim() || null,
            city: city.trim() || null,
            country: country.trim() || null,
            email: email.trim() || null,
            siren: clientType === 'entreprise' ? (siren.trim() || null) : null,
            vat_number: clientType === 'entreprise' ? (vatNumber.trim() || null) : null,
          })
          .eq('id', recipientId);

        if (recipientError) {
          console.error('Erreur recipient:', JSON.stringify(recipientError, null, 2));
          throw recipientError;
        }
      }

      const totals = calculateTotals();

      const { error: factureError } = await supabase
        .from('factures')
        .update({
          client_id: selectedClientId,
          date_facture: dateFacture,
          statut_paiement: statutPaiement,
          date_paiement: statutPaiement === 'payee' ? datePaiement : null,
          montant_total_ht: totals.totalHTApresRemise,
          montant_total_tva: totals.totalTVA,
          montant_total_ttc: totals.totalTTC,
          remise_type: remiseType,
          remise_value: remiseValue,
          montant_remise: totals.montantRemise,
          updated_at: new Date().toISOString(),
        })
        .eq('id', factureId);

      if (factureError) {
        console.error('Erreur facture:', JSON.stringify(factureError, null, 2));
        throw factureError;
      }

      const { error: deleteLignesError } = await supabase
        .from('lignes_factures')
        .delete()
        .eq('facture_id', factureId);

      if (deleteLignesError) {
        console.error('Erreur suppression lignes:', JSON.stringify(deleteLignesError, null, 2));
        throw deleteLignesError;
      }

      const lignesData = lignes.map((ligne, index) => {
        const { montantHT, montantTVA, montantTTC } = calculateLigneTotals(ligne);
        return {
          facture_id: factureId,
          description: ligne.description,
          quantite: ligne.quantite,
          prix_unitaire_ht: ligne.prix_unitaire_ht,
          taux_tva: ligne.taux_tva,
          montant_ht: montantHT,
          montant_tva: montantTVA,
          montant_ttc: montantTTC,
          ordre: index,
          category_id: ligne.category_id,
        };
      });

      const { error: lignesError } = await supabase
        .from('lignes_factures')
        .insert(lignesData);

      if (lignesError) {
        console.error('Erreur lignes:', JSON.stringify(lignesError, null, 2));
        throw lignesError;
      }

      navigate(`/app/company/${companyId}/factures/${factureId}`);
    } catch (error: any) {
      console.error('Erreur modification facture:', JSON.stringify(error, null, 2));
      alert(`Erreur: ${error?.message || 'Erreur inconnue'}`);
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();

  if (loadingData) {
    return (
      <div style={{ padding: '32px 20px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
          Chargement...
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: '32px 20px', maxWidth: '1000px', margin: '0 auto' }}>
        <BackButton to={`/app/company/${companyId}/factures/${factureId}`} />
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#111827', marginBottom: '32px' }}>
          Modifier la facture
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
                <option value="brouillon">Brouillon</option>
                <option value="en_attente">En attente</option>
                <option value="payee">Payée</option>
                <option value="annulee">Annulée</option>
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

            {recipient && (
              <div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                    Type de client
                  </label>
                  <select
                    value={clientType}
                    onChange={(e) => setClientType(e.target.value as 'particulier' | 'entreprise')}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    <option value="particulier">Particulier</option>
                    <option value="entreprise">Entreprise</option>
                  </select>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                    {clientType === 'entreprise' ? 'Raison sociale *' : 'Nom *'}
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                    placeholder={clientType === 'entreprise' ? 'Ex: SARL Martin' : 'Ex: Jean Dupont'}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                    Adresse
                  </label>
                  <input
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="Numéro et nom de rue"
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', marginBottom: '8px' }}
                  />
                  <input
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder="Complément d'adresse (optionnel)"
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                      Code postal
                    </label>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="75001"
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                      Ville
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Paris"
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                    Pays
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="France"
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contact@example.com"
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>

                {clientType === 'entreprise' && (
                  <>
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                        SIREN
                      </label>
                      <input
                        type="text"
                        value={siren}
                        onChange={(e) => setSiren(e.target.value)}
                        placeholder="123456789"
                        style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                      />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                        TVA intracommunautaire
                      </label>
                      <input
                        type="text"
                        value={vatNumber}
                        onChange={(e) => setVatNumber(e.target.value)}
                        placeholder="FR12345678901"
                        style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                      />
                    </div>
                  </>
                )}
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

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    Catégorie *
                  </label>
                  <select
                    value={ligne.category_id}
                    onChange={(e) => updateLigne(index, 'category_id', e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    <option value="">-- Sélectionner une catégorie --</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
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
                    {companyVatRegime === 'franchise' ? (
                      <input
                        type="text"
                        value="0% (Franchise en base)"
                        disabled
                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', backgroundColor: '#f3f4f6', color: '#6b7280' }}
                      />
                    ) : (
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
                    )}
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
              Remise
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  Type de remise
                </label>
                <select
                  value={remiseType}
                  onChange={(e) => {
                    setRemiseType(e.target.value as 'aucune' | 'pct' | 'fixe');
                    if (e.target.value === 'aucune') {
                      setRemiseValue(0);
                    }
                  }}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                >
                  <option value="aucune">Aucune remise</option>
                  <option value="pct">Pourcentage (%)</option>
                  <option value="fixe">Montant fixe (€)</option>
                </select>
              </div>
              {remiseType !== 'aucune' && (
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                    {remiseType === 'pct' ? 'Pourcentage de remise' : 'Montant de la remise (€)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={remiseType === 'pct' ? '100' : undefined}
                    value={remiseValue === 0 ? '' : remiseValue}
                    onChange={(e) => setRemiseValue(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    placeholder={remiseType === 'pct' ? '10' : '0.00'}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>
              )}
            </div>
            {remiseType !== 'aucune' && remiseValue > 0 && (
              <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fef3c7', borderRadius: '6px', fontSize: '14px', color: '#92400e' }}>
                <strong>Remise appliquée:</strong> -{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totals.montantRemise)}
              </div>
            )}
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
            {totals.montantRemise > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                  <span style={{ color: '#dc2626' }}>Remise:</span>
                  <span style={{ fontWeight: '600', color: '#dc2626' }}>
                    -{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totals.montantRemise)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                  <span style={{ color: '#6b7280' }}>Total HT après remise:</span>
                  <span style={{ fontWeight: '600', color: '#111827' }}>
                    {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totals.totalHTApresRemise)}
                  </span>
                </div>
              </>
            )}
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
              onClick={() => navigate(`/app/company/${companyId}/factures/${factureId}`)}
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
              {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
