import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import BackButton from '../components/BackButton';
import { useUserRole } from '../lib/useUserRole';
import ConfirmModal from '../components/ConfirmModal';

interface Facture {
  id: string;
  numero_facture: string;
  date_facture: string;
  statut_paiement: string;
  date_paiement?: string;
  montant_total_ht: number;
  montant_total_tva: number;
  montant_total_ttc: number;
  remise_type?: string;
  remise_value?: number;
  montant_remise?: number;
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
  category_id?: string | null;
  revenue_categories?: {
    id: string;
    name: string;
  } | null;
}

interface Company {
  name: string;
  country: string;
  siren?: string | null;
  siret?: string | null;
  address?: string | null;
  vat_regime?: string | null;
  legal_form?: string | null;
  email?: string | null;
  phone?: string | null;
  vat_number?: string | null;
  rcs?: string | null;
  capital?: string | null;
  payment_terms?: string | null;
  late_penalties?: string | null;
  recovery_costs?: string | null;
  discount_terms?: string | null;
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

export default function ViewFacturePage() {
  const { companyId, factureId } = useParams<{ companyId: string; factureId: string }>();
  const navigate = useNavigate();
  const { canModify } = useUserRole(companyId);

  const [facture, setFacture] = useState<Facture | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [recipient, setRecipient] = useState<InvoiceRecipient | null>(null);
  const [lignes, setLignes] = useState<LigneFacture[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

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
    if (companyId && factureId) {
      if (factureId === 'new') {
        navigate(`/app/company/${companyId}/factures/create`);
        return;
      }
      loadFacture();
      loadCompany();
    }
  }, [companyId, factureId]);

  const loadCompany = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('name, country, legal_form, siren, siret, address, vat_regime')
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
          client_id,
          recipient_id
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

      if (factureData.recipient_id) {
        const { data: recipientData, error: recipientError } = await supabase
          .from('invoice_recipients')
          .select('*')
          .eq('id', factureData.recipient_id)
          .maybeSingle();

        if (!recipientError && recipientData) {
          setRecipient(recipientData);
        }
      }

      const { data: lignesData, error: lignesError } = await supabase
        .from('lignes_factures')
        .select(`
          *,
          revenue_categories (id, name)
        `)
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

  const handleChangeStatut = (newStatut: string) => {
    if (!canModify || !facture) return;

    if (newStatut === 'payee') {
      const clientName = recipient?.name || client?.name;

      setConfirmModal({
        isOpen: true,
        message: 'Confirmer le paiement de cette facture ?',
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
              .update({
                statut_paiement: newStatut,
                date_paiement: new Date().toISOString().split('T')[0],
              })
              .eq('id', factureId);

            if (error) throw error;

            loadFacture();
          } catch (error) {
            console.error('Erreur changement statut:', error);
            alert('Erreur lors du changement de statut');
          }
        },
      });
    }
  };

  const handleAnnuler = () => {
    if (!canModify || !facture) return;

    const clientName = recipient?.name || client?.name;

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

          loadFacture();
        } catch (error) {
          console.error('Erreur annulation:', error);
          alert('Erreur lors de l\'annulation');
        }
      },
    });
  };

  const handleSupprimer = () => {
    if (!canModify || !facture) return;

    if (facture.statut_paiement !== 'brouillon') {
      alert('Seules les factures brouillon peuvent être supprimées. Utilisez "Annuler" pour les autres factures.');
      return;
    }

    const clientName = recipient?.name || client?.name;

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

          navigate(`/app/company/${companyId}/factures`);
        } catch (error) {
          console.error('Erreur suppression:', error);
          alert('Erreur lors de la suppression');
        }
      },
    });
  };

  const generatePDF = async () => {
    if (!facture || !client || !company) return;

    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.width = '210mm';
    tempDiv.style.height = '297mm';
    tempDiv.style.backgroundColor = 'white';
    tempDiv.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    tempDiv.style.fontSize = '12px';
    tempDiv.style.lineHeight = '1.4';
    tempDiv.style.color = '#1a1a1a';
    tempDiv.style.padding = '10mm 11mm 8mm 11mm';
    tempDiv.style.boxSizing = 'border-box';
    tempDiv.style.display = 'flex';
    tempDiv.style.flexDirection = 'column';
    tempDiv.style.maxWidth = '100%';

    const displayName = recipient?.name || client.name;
    const dueDate = new Date(facture.date_facture);
    dueDate.setDate(dueDate.getDate() + 30);

    const totalHTBrut = (facture.montant_remise && facture.montant_remise > 0)
      ? facture.montant_total_ht + facture.montant_remise
      : facture.montant_total_ht;

    // Statut de paiement
    const statutLabels: Record<string, string> = {
      'brouillon': 'Brouillon',
      'en_attente': 'En attente',
      'payee': 'Payée',
      'annulee': 'Annulée'
    };
    const statutLabel = statutLabels[facture.statut_paiement] || facture.statut_paiement;

    // Infos société émettrice
    const companyInfoLines: string[] = [];
    if (company.name) companyInfoLines.push(company.name);
    if (company.legal_form) companyInfoLines.push(company.legal_form);
    if (company.address) companyInfoLines.push(company.address);
    if (company.country) companyInfoLines.push(company.country);
    if (company.siren) companyInfoLines.push(`SIREN : ${company.siren}`);
    if (company.siret) companyInfoLines.push(`SIRET : ${company.siret}`);
    if (company.vat_number) companyInfoLines.push(`N° TVA intracommunautaire : ${company.vat_number}`);

    // Mentions TVA pour conditions de règlement
    const conditionsLines: string[] = [];

    conditionsLines.push('Conditions de paiement : paiement à réception');

    if (company.vat_regime) {
      if (company.vat_regime.toLowerCase().includes('293b') || company.vat_regime.toLowerCase().includes('non applicable')) {
        conditionsLines.push('TVA non applicable art 293B');
      } else {
        conditionsLines.push('TVA incluse');
      }
    } else {
      conditionsLines.push('TVA incluse');
    }

    tempDiv.innerHTML = `
      <div style="display: flex; flex-direction: column; min-height: 277mm;">
        <!-- En-tête 2 colonnes : Émetteur + Facture -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
          <!-- Colonne gauche : Émetteur -->
          <div style="flex: 1; max-width: 45%;">
            <div style="font-size: 12px; font-weight: 600; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">ÉMETTEUR</div>
            <div style="font-size: 11px; color: #334155; line-height: 1.5;">
              ${companyInfoLines.slice(0, 6).map(line => `<div>${line}</div>`).join('')}
            </div>
          </div>
          <!-- Colonne droite : Facture -->
          <div style="text-align: right; flex: 1; max-width: 50%;">
            <h1 style="margin: 0 0 10px 0; font-size: 32px; font-weight: 700; color: #0f172a;">FACTURE</h1>
            <div style="font-size: 11px; color: #475569; line-height: 1.6; margin-bottom: 8px;">
              <div style="margin-bottom: 2px;"><strong style="color: #1e293b;">N° :</strong> ${facture.numero_facture}</div>
              <div style="margin-bottom: 2px;"><strong style="color: #1e293b;">Date :</strong> ${new Date(facture.date_facture).toLocaleDateString('fr-FR')}</div>
              ${facture.date_paiement ? `<div style="margin-bottom: 2px;"><strong style="color: #1e293b;">Échéance :</strong> ${dueDate.toLocaleDateString('fr-FR')}</div>` : ''}
            </div>
            <div style="display: inline-block; padding: 6px 14px; background-color: ${facture.statut_paiement === 'payee' ? '#dbeafe' : '#fef3c7'}; border: 1px solid ${facture.statut_paiement === 'payee' ? '#2563eb' : '#f59e0b'}; border-radius: 4px; font-size: 11px; font-weight: 600; color: ${facture.statut_paiement === 'payee' ? '#1e40af' : '#92400e'};">
              ${statutLabel}
            </div>
          </div>
        </div>

        <!-- Wrapper avec padding-top pour descendre les tableaux -->
        <div style="padding-top: 10mm;">
          <!-- Bloc FACTURÉ À -->
          <div style="margin-bottom: 18px; padding: 10px 12px; background-color: #ffffff; border-left: 4px solid #2563eb;">
            <div style="font-size: 12px; font-weight: 600; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">FACTURÉ À</div>
            <div style="font-size: 11px; color: #0f172a; line-height: 1.5;">
              <div style="font-weight: 600; margin-bottom: 2px;">${displayName}</div>
              ${recipient?.address_line1 ? `<div>${recipient.address_line1}</div>` : ''}
              ${recipient?.address_line2 ? `<div>${recipient.address_line2}</div>` : ''}
              ${recipient?.postal_code || recipient?.city ? `<div>${[recipient.postal_code, recipient.city].filter(Boolean).join(' ')}</div>` : ''}
              ${recipient?.country ? `<div>${recipient.country}</div>` : ''}
              ${recipient?.type === 'entreprise' && recipient?.siren ? `<div style="margin-top: 3px; font-size: 11px;">SIREN : ${recipient.siren}</div>` : ''}
              ${recipient?.type === 'entreprise' && recipient?.vat_number ? `<div style="font-size: 11px;">N° TVA : ${recipient.vat_number}</div>` : ''}
            </div>
          </div>

        <!-- Table des lignes -->
        <table style="width: 100%; border-collapse: collapse; margin: 28px 0 14px 0; border: 1px solid #cbd5e1;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
              <th style="padding: 10px 12px 10px 18px; text-align: left; font-size: 11px; font-weight: 600; color: #1e293b; text-transform: uppercase; letter-spacing: 0.3px; width: 50%;">Description</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #1e293b; text-transform: uppercase; letter-spacing: 0.3px; width: 10%;">Qté</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 11px; font-weight: 600; color: #1e293b; text-transform: uppercase; letter-spacing: 0.3px; width: 15%;">PU HT</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #1e293b; text-transform: uppercase; letter-spacing: 0.3px; width: 10%;">TVA</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 11px; font-weight: 600; color: #1e293b; text-transform: uppercase; letter-spacing: 0.3px; width: 15%;">Total TTC</th>
            </tr>
          </thead>
          <tbody>
            ${lignes.map((ligne) => `
              <tr style="border-bottom: 1px solid #e2e8f0; background-color: #ffffff;">
                <td style="padding: 10px 12px 10px 18px; font-size: 11px; color: #0f172a; vertical-align: top;">${ligne.description}</td>
                <td style="padding: 10px 12px; font-size: 11px; color: #334155; text-align: center; vertical-align: top;">${ligne.quantite}</td>
                <td style="padding: 10px 12px; font-size: 11px; color: #334155; text-align: right; vertical-align: top; white-space: nowrap;">${ligne.prix_unitaire_ht.toFixed(2)} €</td>
                <td style="padding: 10px 12px; font-size: 11px; color: #334155; text-align: center; vertical-align: top;">${ligne.taux_tva}%</td>
                <td style="padding: 10px 12px; font-size: 11px; color: #0f172a; text-align: right; vertical-align: top; font-weight: 600; white-space: nowrap;">${ligne.montant_ttc.toFixed(2)} €</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

          <!-- Totaux -->
          <div style="display: flex; justify-content: flex-end; margin: 14px 0 8px 0;">
            <div style="width: 260px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 12px; background-color: #f8fafc;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px;">
                <span style="color: #64748b; font-weight: 500;">Total HT</span>
                <span style="color: #1e293b; font-weight: 600;">${totalHTBrut.toFixed(2)} €</span>
              </div>
              ${facture.montant_remise && facture.montant_remise > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px;">
                  <span style="color: #dc2626; font-weight: 500;">Remise</span>
                  <span style="color: #dc2626; font-weight: 600;">-${facture.montant_remise.toFixed(2)} €</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #cbd5e1; font-size: 11px;">
                  <span style="color: #64748b; font-weight: 500;">Total HT après remise</span>
                  <span style="color: #1e293b; font-weight: 600;">${facture.montant_total_ht.toFixed(2)} €</span>
                </div>
              ` : ''}
              <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #cbd5e1; font-size: 11px;">
                <span style="color: #64748b; font-weight: 500;">Total TVA</span>
                <span style="color: #1e293b; font-weight: 600;">${facture.montant_total_tva.toFixed(2)} €</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px;">
                <span style="color: #0f172a; font-weight: 700;">Total TTC</span>
                <span style="color: #0f172a; font-weight: 700;">${facture.montant_total_ttc.toFixed(2)} €</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-top: 6px; border-top: 1px solid #cbd5e1; font-size: 12px;">
                <span style="color: #0f172a; font-weight: 600;">Net à payer</span>
                <span style="color: #0f172a; font-weight: 600;">${facture.montant_total_ttc.toFixed(2)} €</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Bloc informations en bas (poussé en bas avec margin-top: auto) -->
        <div style="margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; padding: 12px 0; border-top: 1px solid #cbd5e1;">
          <!-- Colonne gauche : Informations société -->
          <div>
            <div style="font-size: 11px; font-weight: 600; color: #1e293b; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px;">INFORMATIONS SOCIÉTÉ</div>
            <div style="font-size: 10px; color: #475569; line-height: 1.6;">
              ${companyInfoLines.map(line => `<div>${line}</div>`).join('')}
            </div>
          </div>
          <!-- Colonne droite : Conditions de règlement -->
          <div>
            <div style="font-size: 11px; font-weight: 600; color: #1e293b; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px;">CONDITIONS DE RÈGLEMENT</div>
            <div style="font-size: 10px; color: #475569; line-height: 1.6;">
              ${conditionsLines.map(line => `<div style="margin-bottom: 3px;">${line}</div>`).join('')}
            </div>
          </div>
        </div>

        <!-- Footer professionnel en bas de page -->
        <div style="padding-top: 8px; margin-top: 6mm; border-top: 1px solid #e2e8f0; text-align: center; font-size: 8px; color: #94a3b8;">
          Document édité via ComptaApp
        </div>
      </div>
    `;

    document.body.appendChild(tempDiv);

    try {
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      const tolerance = 5;
      const overflow = imgHeight - pdfHeight;

      if (overflow > tolerance) {
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > tolerance) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pdfHeight;
        }
      } else {
        const scaledHeight = Math.min(imgHeight, pdfHeight);
        const scaledWidth = (scaledHeight / imgHeight) * imgWidth;
        pdf.addImage(imgData, 'PNG', 0, 0, scaledWidth, scaledHeight);
      }

      pdf.save(`Facture_${facture.numero_facture}.pdf`);
    } finally {
      document.body.removeChild(tempDiv);
    }
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', gap: '16px', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#111827', margin: 0 }}>
            Facture {facture.numero_facture}
          </h1>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {canModify && facture.statut_paiement !== 'annulee' && (
              <>
                <button
                  onClick={() => navigate(`/app/company/${companyId}/factures/${factureId}/edit`)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#dbeafe',
                    color: '#1e40af',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Modifier
                </button>
                {facture.statut_paiement === 'en_attente' && (
                  <button
                    onClick={() => handleChangeStatut('payee')}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#d1fae5',
                      color: '#065f46',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Marquer comme payée
                  </button>
                )}
                {facture.statut_paiement !== 'payee' && (
                  <button
                    onClick={handleAnnuler}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#fee2e2',
                      color: '#991b1b',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Annuler
                  </button>
                )}
                {facture.statut_paiement === 'brouillon' && (
                  <button
                    onClick={handleSupprimer}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#fee2e2',
                      color: '#991b1b',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Supprimer
                  </button>
                )}
              </>
            )}
            <button
              onClick={generatePDF}
              style={{
                padding: '10px 20px',
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
                    backgroundColor: getStatutColor(facture.statut_paiement).bg,
                    color: getStatutColor(facture.statut_paiement).text,
                  }}>
                    {getStatutLabel(facture.statut_paiement)}
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
                {recipient ? (
                  <>
                    <div><strong>{recipient.name}</strong></div>
                    {recipient.address_line1 && <div>{recipient.address_line1}</div>}
                    {recipient.address_line2 && <div>{recipient.address_line2}</div>}
                    {(recipient.postal_code || recipient.city) && (
                      <div>{[recipient.postal_code, recipient.city].filter(Boolean).join(' ')}</div>
                    )}
                    {recipient.country && <div>{recipient.country}</div>}
                    {recipient.email && <div style={{ marginTop: '4px' }}>{recipient.email}</div>}
                    {recipient.type === 'entreprise' && (
                      <>
                        {recipient.siren && <div style={{ marginTop: '4px' }}>SIREN: {recipient.siren}</div>}
                        {recipient.vat_number && <div>TVA: {recipient.vat_number}</div>}
                      </>
                    )}
                  </>
                ) : (
                  <div><strong>{client.name}</strong></div>
                )}
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
                <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Catégorie
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
                  <td style={{ padding: '12px 8px', fontSize: '14px', color: '#6b7280' }}>
                    {ligne.revenue_categories?.name || '—'}
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
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
                  (facture.montant_remise && facture.montant_remise > 0)
                    ? facture.montant_total_ht + facture.montant_remise
                    : facture.montant_total_ht
                )}
              </span>
            </div>
            {facture.montant_remise && facture.montant_remise > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '300px', fontSize: '14px' }}>
                  <span style={{ color: '#dc2626' }}>Remise:</span>
                  <span style={{ fontWeight: '600', color: '#dc2626' }}>
                    -{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(facture.montant_remise)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '300px', fontSize: '14px' }}>
                  <span style={{ color: '#6b7280' }}>Total HT après remise:</span>
                  <span style={{ fontWeight: '600', color: '#111827' }}>
                    {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(facture.montant_total_ht)}
                  </span>
                </div>
              </>
            )}
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
