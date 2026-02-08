import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import { usePlan } from '../lib/usePlan';
import jsPDF from 'jspdf';

interface Facture {
  id: string;
  numero_facture: string;
  date_facture: string;
  statut_paiement: string;
  date_paiement?: string;
  montant_total_ht: number;
  montant_total_tva: number;
  montant_total_ttc: number;
}

interface Client {
  type_client: string;
  nom?: string;
  raison_sociale?: string;
  adresse: string;
  pays: string;
  email?: string;
  siren?: string;
  tva_intracommunautaire?: string;
}

interface LigneFacture {
  id: string;
  description: string;
  quantite: number;
  prix_unitaire_ht: number;
  taux_tva: number;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  ordre: number;
}

interface Company {
  name: string;
  country: string;
  siren?: string;
  tva_number?: string;
  address?: string;
  city?: string;
  postal_code?: string;
}

export default function ViewFacturePage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { companyId, factureId } = useParams<{ companyId: string; factureId: string }>();
  const { canUse } = usePlan(companyId);

  const [facture, setFacture] = useState<Facture | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [lignes, setLignes] = useState<LigneFacture[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  useEffect(() => {
    if (companyId && factureId) {
      loadFacture();
      loadCompany();
    }
  }, [companyId, factureId]);

  const loadCompany = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('name, country, siren, tva_number, address, city, postal_code')
        .eq('id', companyId)
        .single();

      if (error) throw error;
      setCompany(data);
    } catch (error) {
      console.error('Erreur lors du chargement de l\'entreprise:', error);
    }
  };

  const loadFacture = async () => {
    setLoading(true);
    try {
      const { data: factureData, error: factureError } = await supabase
        .from('factures')
        .select(`
          id,
          numero_facture,
          date_facture,
          statut_paiement,
          date_paiement,
          montant_total_ht,
          montant_total_tva,
          montant_total_ttc,
          client_id
        `)
        .eq('id', factureId)
        .single();

      if (factureError) throw factureError;
      setFacture(factureData);

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', factureData.client_id)
        .single();

      if (clientError) throw clientError;
      setClient(clientData);

      const { data: lignesData, error: lignesError } = await supabase
        .from('lignes_factures')
        .select('*')
        .eq('facture_id', factureId)
        .order('ordre', { ascending: true });

      if (lignesError) throw lignesError;
      setLignes(lignesData || []);
    } catch (error) {
      console.error('Erreur lors du chargement de la facture:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = () => {
    if (!facture || !client || !company) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('FACTURE', pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Numéro: ${facture.numero_facture}`, 20, yPos);
    yPos += 6;
    doc.text(`Date: ${new Date(facture.date_facture).toLocaleDateString('fr-FR')}`, 20, yPos);
    yPos += 15;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Émetteur:', 20, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(company.name, 20, yPos);
    yPos += 5;
    if (company.address) {
      doc.text(company.address, 20, yPos);
      yPos += 5;
    }
    if (company.city && company.postal_code) {
      doc.text(`${company.postal_code} ${company.city}`, 20, yPos);
      yPos += 5;
    }
    if (company.siren) {
      doc.text(`SIREN: ${company.siren}`, 20, yPos);
      yPos += 5;
    }
    if (company.tva_number) {
      doc.text(`TVA: ${company.tva_number}`, 20, yPos);
      yPos += 5;
    }

    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Client:', 20, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    if (client.type_client === 'particulier') {
      doc.text(client.nom || '', 20, yPos);
    } else {
      doc.text(client.raison_sociale || '', 20, yPos);
      yPos += 5;
      if (client.siren) {
        doc.text(`SIREN: ${client.siren}`, 20, yPos);
        yPos += 5;
      }
      if (client.tva_intracommunautaire) {
        doc.text(`TVA intracommunautaire: ${client.tva_intracommunautaire}`, 20, yPos);
        yPos += 5;
      }
    }
    yPos += 5;
    doc.text(client.adresse, 20, yPos);
    yPos += 5;
    doc.text(client.pays, 20, yPos);
    if (client.email) {
      yPos += 5;
      doc.text(`Email: ${client.email}`, 20, yPos);
    }

    yPos += 15;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Détail de la facture', 20, yPos);
    yPos += 8;

    const tableStartY = yPos;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Description', 20, tableStartY);
    doc.text('Qté', 110, tableStartY, { align: 'right' });
    doc.text('P.U. HT', 135, tableStartY, { align: 'right' });
    doc.text('TVA %', 155, tableStartY, { align: 'right' });
    doc.text('Total TTC', 185, tableStartY, { align: 'right' });
    yPos = tableStartY + 5;

    doc.setLineWidth(0.5);
    doc.line(20, yPos, 190, yPos);
    yPos += 5;

    doc.setFont('helvetica', 'normal');
    lignes.forEach((ligne) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      const descLines = doc.splitTextToSize(ligne.description, 85);
      doc.text(descLines, 20, yPos);
      const lineHeight = descLines.length * 5;

      doc.text(ligne.quantite.toFixed(2), 110, yPos, { align: 'right' });
      doc.text(`${ligne.prix_unitaire_ht.toFixed(2)} €`, 135, yPos, { align: 'right' });
      doc.text(`${ligne.taux_tva.toFixed(2)}%`, 155, yPos, { align: 'right' });
      doc.text(`${ligne.montant_ttc.toFixed(2)} €`, 185, yPos, { align: 'right' });

      yPos += Math.max(lineHeight, 5) + 2;
    });

    yPos += 5;
    doc.setLineWidth(0.5);
    doc.line(20, yPos, 190, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('Total HT:', 135, yPos, { align: 'right' });
    doc.text(`${facture.montant_total_ht.toFixed(2)} €`, 185, yPos, { align: 'right' });
    yPos += 6;

    doc.text('Total TVA:', 135, yPos, { align: 'right' });
    doc.text(`${facture.montant_total_tva.toFixed(2)} €`, 185, yPos, { align: 'right' });
    yPos += 6;

    doc.setFontSize(11);
    doc.text('Total TTC:', 135, yPos, { align: 'right' });
    doc.text(`${facture.montant_total_ttc.toFixed(2)} €`, 185, yPos, { align: 'right' });
    yPos += 15;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    if (client.type_client === 'particulier') {
      doc.text('Mentions légales - Particuliers:', 20, yPos);
      yPos += 5;
      doc.text('Facture à conserver. En cas de litige, seul le tribunal de commerce compétent', 20, yPos);
      yPos += 4;
      doc.text('sera habilité. Aucun escompte en cas de paiement anticipé.', 20, yPos);
    } else {
      doc.text('Mentions légales - Professionnels:', 20, yPos);
      yPos += 5;
      doc.text('Facture à conserver. Pénalités de retard: taux BCE + 10 points.', 20, yPos);
      yPos += 4;
      doc.text('Indemnité forfaitaire pour frais de recouvrement: 40€. Escompte: néant.', 20, yPos);
    }

    doc.save(`Facture_${facture.numero_facture}.pdf`);
  };

  const hasAccess = canUse('assistantIA');

  if (!hasAccess) {
    navigate(`/app/company/${companyId}/factures`);
    return null;
  }

  if (loading) {
    return (
      <>
        <AppHeader
          title="Facture"
          showSignOut={true}
          onSignOut={handleSignOut}
        />
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#6b7280' }}>
          Chargement...
        </div>
      </>
    );
  }

  if (!facture || !client) {
    return (
      <>
        <AppHeader
          title="Facture"
          showSignOut={true}
          onSignOut={handleSignOut}
        />
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#6b7280' }}>
          Facture introuvable
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader
        title={`Facture ${facture.numero_facture}`}
        showSignOut={true}
        onSignOut={handleSignOut}
      />

      <div style={{ padding: '32px 20px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#111827', margin: 0 }}>
            Facture {facture.numero_facture}
          </h1>
          <button
            onClick={generatePDF}
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
            Télécharger PDF
          </button>
        </div>

        <div style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ fontSize: '20px', marginTop: '2px' }}>ℹ️</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#1e40af', fontWeight: '600' }}>
                Document commercial uniquement
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#1e3a8a', lineHeight: '1.6' }}>
                Cette facture est un document commercial (PDF). Elle n'est pas automatiquement enregistrée en comptabilité.
                Pour qu'elle impacte votre résultat et votre TVA, vous devez créer un revenu séparément dans le module Revenus.
              </p>
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '12px', textTransform: 'uppercase' }}>
                Informations
              </h3>
              <div style={{ fontSize: '14px', color: '#111827', lineHeight: '1.8' }}>
                <div><strong>Date:</strong> {new Date(facture.date_facture).toLocaleDateString('fr-FR')}</div>
                <div><strong>Statut:</strong>
                  <span style={{
                    marginLeft: '8px',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    backgroundColor: facture.statut_paiement === 'payee' ? '#d1fae5' : '#fee2e2',
                    color: facture.statut_paiement === 'payee' ? '#065f46' : '#991b1b',
                  }}>
                    {facture.statut_paiement === 'payee' ? 'Payée' : 'Non payée'}
                  </span>
                </div>
                {facture.statut_paiement === 'payee' && facture.date_paiement && (
                  <div><strong>Date de paiement:</strong> {new Date(facture.date_paiement).toLocaleDateString('fr-FR')}</div>
                )}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '12px', textTransform: 'uppercase' }}>
                Client
              </h3>
              <div style={{ fontSize: '14px', color: '#111827', lineHeight: '1.8' }}>
                <div><strong>{client.type_client === 'particulier' ? client.nom : client.raison_sociale}</strong></div>
                <div>{client.adresse}</div>
                <div>{client.pays}</div>
                {client.email && <div>Email: {client.email}</div>}
                {client.siren && <div>SIREN: {client.siren}</div>}
                {client.tva_intracommunautaire && <div>TVA intracommunautaire: {client.tva_intracommunautaire}</div>}
              </div>
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
            Lignes de facture
          </h3>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Description
                </th>
                <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Qté
                </th>
                <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  P.U. HT
                </th>
                <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  TVA %
                </th>
                <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Total TTC
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => (
                <tr key={ligne.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 8px', fontSize: '14px', color: '#111827' }}>
                    {ligne.description}
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: '14px', color: '#111827', textAlign: 'right' }}>
                    {ligne.quantite}
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: '14px', color: '#111827', textAlign: 'right' }}>
                    {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(ligne.prix_unitaire_ht)}
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: '14px', color: '#111827', textAlign: 'right' }}>
                    {ligne.taux_tva}%
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: '14px', color: '#111827', textAlign: 'right', fontWeight: '600' }}>
                    {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(ligne.montant_ttc)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '300px', fontSize: '14px' }}>
              <span style={{ color: '#6b7280' }}>Total HT:</span>
              <span style={{ fontWeight: '600', color: '#111827' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(facture.montant_total_ht)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '300px', fontSize: '14px' }}>
              <span style={{ color: '#6b7280' }}>Total TVA:</span>
              <span style={{ fontWeight: '600', color: '#111827' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(facture.montant_total_tva)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '300px', fontSize: '18px', paddingTop: '8px', borderTop: '2px solid #e5e7eb' }}>
              <span style={{ fontWeight: '600', color: '#111827' }}>Total TTC:</span>
              <span style={{ fontWeight: '700', color: '#111827' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(facture.montant_total_ttc)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
