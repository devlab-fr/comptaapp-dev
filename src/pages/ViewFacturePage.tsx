import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import jsPDF from 'jspdf';
import BackButton from '../components/BackButton';

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
  id: string;
  name: string;
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
  siren?: string | null;
  siret?: string | null;
  address?: string | null;
  vat_regime?: string | null;
  legal_form?: string | null;
}

export default function ViewFacturePage() {
  const { companyId, factureId } = useParams<{ companyId: string; factureId: string }>();

  const [facture, setFacture] = useState<Facture | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [lignes, setLignes] = useState<LigneFacture[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

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
        .select('name, country')
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
        .select('id, name')
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
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - (margin * 2);
    let yPos = margin;

    const grayBg = 245;
    const lineColor = 220;
    const textPrimary = 30;
    const textSecondary = 100;

    yPos = margin;

    const colLeftX = margin;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textSecondary);
    doc.text(company.name, colLeftX, yPos);
    yPos += 5;

    if (company.address) {
      const addressLines = doc.splitTextToSize(company.address, 80);
      doc.text(addressLines, colLeftX, yPos);
      yPos += addressLines.length * 5;
    }

    if (company.siren) {
      doc.text(`SIREN: ${company.siren}`, colLeftX, yPos);
      yPos += 5;
    }

    if (company.vat_regime && company.vat_regime.toLowerCase().includes('tva')) {
      doc.text(company.vat_regime, colLeftX, yPos);
      yPos += 5;
    }

    const titleYPos = margin;
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textPrimary);
    doc.text('FACTURE', pageWidth - margin, titleYPos, { align: 'right' });

    let rightYPos = titleYPos + 15;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textSecondary);
    doc.text(`N° ${facture.numero_facture}`, pageWidth - margin, rightYPos, { align: 'right' });
    rightYPos += 6;
    doc.text(`Date: ${new Date(facture.date_facture).toLocaleDateString('fr-FR')}`, pageWidth - margin, rightYPos, { align: 'right' });
    rightYPos += 6;

    if (facture.date_paiement) {
      const dueDate = new Date(facture.date_facture);
      dueDate.setDate(dueDate.getDate() + 30);
      doc.text(`Échéance: ${dueDate.toLocaleDateString('fr-FR')}`, pageWidth - margin, rightYPos, { align: 'right' });
    }

    yPos = Math.max(yPos, rightYPos) + 20;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textSecondary);
    doc.text('FACTURÉ À', colLeftX, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textPrimary);

    const clientName = client.name || 'Client';
    doc.text(clientName, colLeftX, yPos);
    yPos += 6;

    yPos += 20;

    const tableStartY = yPos;
    const colWidths = {
      description: contentWidth * 0.40,
      qte: contentWidth * 0.12,
      pu: contentWidth * 0.18,
      tva: contentWidth * 0.12,
      total: contentWidth * 0.18
    };

    doc.setFillColor(grayBg, grayBg, grayBg);
    doc.rect(margin, tableStartY, contentWidth, 10, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textPrimary);

    let colX = margin + 5;
    doc.text('Description', colX, tableStartY + 7);
    colX += colWidths.description;
    doc.text('Qté', colX, tableStartY + 7, { align: 'center' });
    colX += colWidths.qte;
    doc.text('Prix unitaire HT', colX, tableStartY + 7, { align: 'right' });
    colX += colWidths.pu;
    doc.text('TVA %', colX, tableStartY + 7, { align: 'right' });
    colX += colWidths.tva;
    doc.text('Total TTC', colX, tableStartY + 7, { align: 'right' });

    yPos = tableStartY + 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    lignes.forEach((ligne, index) => {
      if (yPos > pageHeight - 80) {
        doc.addPage();
        yPos = margin;
      }

      const rowStartY = yPos;
      const rowPadding = 10;

      const descLines = doc.splitTextToSize(ligne.description, colWidths.description - 10);
      const rowHeight = Math.max(descLines.length * 5 + rowPadding, rowPadding + 5);

      if (index % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, rowStartY, contentWidth, rowHeight, 'F');
      }

      colX = margin + 5;
      doc.setTextColor(textPrimary);
      doc.text(descLines, colX, rowStartY + 7);

      colX += colWidths.description;
      doc.text(ligne.quantite.toString(), colX, rowStartY + 7, { align: 'center' });

      colX += colWidths.qte;
      doc.text(`${ligne.prix_unitaire_ht.toFixed(2)} €`, colX, rowStartY + 7, { align: 'right' });

      colX += colWidths.pu;
      doc.text(`${ligne.taux_tva}%`, colX, rowStartY + 7, { align: 'right' });

      colX += colWidths.tva;
      doc.setFont('helvetica', 'bold');
      doc.text(`${ligne.montant_ttc.toFixed(2)} €`, colX, rowStartY + 7, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      doc.setDrawColor(lineColor, lineColor, lineColor);
      doc.setLineWidth(0.1);
      doc.line(margin, rowStartY + rowHeight, pageWidth - margin, rowStartY + rowHeight);

      yPos += rowHeight;
    });

    yPos += 10;

    const totalsX = pageWidth - margin - 60;
    const totalsValueX = pageWidth - margin - 5;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textSecondary);
    doc.text('Total HT', totalsX, yPos);
    doc.setTextColor(textPrimary);
    doc.text(`${facture.montant_total_ht.toFixed(2)} €`, totalsValueX, yPos, { align: 'right' });
    yPos += 7;

    doc.setTextColor(textSecondary);
    doc.text('Total TVA', totalsX, yPos);
    doc.setTextColor(textPrimary);
    doc.text(`${facture.montant_total_tva.toFixed(2)} €`, totalsValueX, yPos, { align: 'right' });
    yPos += 10;

    doc.setDrawColor(textPrimary, textPrimary, textPrimary);
    doc.setLineWidth(0.5);
    doc.line(totalsX - 5, yPos - 3, totalsValueX, yPos - 3);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textPrimary);
    doc.text('Total TTC', totalsX, yPos);
    doc.text(`${facture.montant_total_ttc.toFixed(2)} €`, totalsValueX, yPos, { align: 'right' });

    yPos += 20;

    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = margin;
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textSecondary);
    doc.text('MENTIONS LÉGALES', margin, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(textSecondary);

    const mentions: string[] = [];

    if (company.vat_regime) {
      if (company.vat_regime.toLowerCase().includes('293b') || company.vat_regime.toLowerCase().includes('non applicable')) {
        mentions.push('TVA non applicable, art. 293 B du CGI.');
      }
    }

    mentions.push('Conditions de paiement: paiement à réception.');
    mentions.push('Pénalités de retard en cas de non-paiement: taux BCE + 10 points.');
    mentions.push('Indemnité forfaitaire pour frais de recouvrement en cas de retard: 40 €.');
    mentions.push('Escompte pour paiement anticipé: néant.');

    mentions.forEach((mention) => {
      if (yPos > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
      }
      const mentionLines = doc.splitTextToSize(mention, contentWidth - 20);
      doc.text(mentionLines, margin, yPos);
      yPos += mentionLines.length * 4.5;
    });

    doc.save(`Facture_${facture.numero_facture}.pdf`);
  };

  if (loading) {
    return (
      <>
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#6b7280' }}>
          Chargement...
        </div>
      </>
    );
  }

  if (!facture || !client) {
    return (
      <>
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#6b7280' }}>
          Facture introuvable
        </div>
      </>
    );
  }

  return (
    <>

      <div style={{ padding: '32px 20px', maxWidth: '1000px', margin: '0 auto' }}>
        <BackButton to={`/app/company/${companyId}/factures`} />
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
                <div><strong>{client.name}</strong></div>
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
