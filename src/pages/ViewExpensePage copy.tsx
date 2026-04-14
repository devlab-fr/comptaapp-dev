import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';
import { StatusBadges } from '../components/StatusBadges';
import { useUserRole } from '../lib/useUserRole';
import ConfirmModal from '../components/ConfirmModal';

interface ExpenseDocument {
  id: string;
  invoice_date: string;
  total_excl_vat: number;
  total_vat: number;
  total_incl_vat: number;
  accounting_status: string;
  payment_status: string;
  paid_at?: string;
  linked_accounting_entry_id?: string;
  payment_entry_id?: string;
  third_party_id?: string | null;
  third_party?: {
    name: string;
    code: string | null;
  } | null;
}

interface ExpenseLine {
  id: string;
  description: string;
  category_id: string;
  subcategory_id?: string;
  amount_excl_vat: number;
  vat_rate: number;
  vat_amount: number;
  amount_incl_vat: number;
  line_order: number;
  expense_categories?: {
    id: string;
    name: string;
  } | null;
  expense_subcategories?: {
    id: string;
    name: string;
  } | null;
}

interface Attachment {
  id: string;
  file_path: string;
  created_at: string;
}

interface AccountingEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  is_locked: boolean;
  journal_id: string;
  journals?: {
    code: string;
    name: string;
  } | null;
}

interface AccountingLine {
  id: string;
  label: string;
  debit: number;
  credit: number;
  line_order: number;
  chart_of_accounts?: {
    code: string;
    name: string;
  } | null;
}

export default function ViewExpensePage() {
  const { companyId, documentId } = useParams<{ companyId: string; documentId: string }>();
  const navigate = useNavigate();
  const { canModify } = useUserRole(companyId);

  const [document, setDocument] = useState<ExpenseDocument | null>(null);
  const [lines, setLines] = useState<ExpenseLine[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [accountingEntry, setAccountingEntry] = useState<AccountingEntry | null>(null);
  const [accountingLines, setAccountingLines] = useState<AccountingLine[]>([]);
  const [paymentEntry, setPaymentEntry] = useState<AccountingEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, message: '', onConfirm: () => {} });

  useEffect(() => {
    if (companyId && documentId) {
      loadDocument();
    }
  }, [companyId, documentId]);

  const loadDocument = async () => {
    setLoading(true);
    try {
      const { data: docData, error: docError } = await supabase
        .from('expense_documents')
        .select('*, third_party:third_parties(name, code)')
        .eq('id', documentId)
        .single();

      if (docError) throw docError;
      setDocument(docData);

      const { data: linesData, error: linesError } = await supabase
        .from('expense_lines')
        .select(`
          *,
          expense_categories (id, name),
          expense_subcategories (id, name)
        `)
        .eq('document_id', documentId)
        .order('line_order', { ascending: true });

      if (linesError) throw linesError;
      setLines(linesData || []);

      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from('attachments')
        .select('id, file_path, created_at')
        .eq('expense_document_id', documentId)
        .order('created_at', { ascending: false });

      if (!attachmentsError && attachmentsData) {
        setAttachments(attachmentsData);
      }

      if (docData.linked_accounting_entry_id) {
        const { data: entryData } = await supabase
          .from('accounting_entries')
          .select(`
            *,
            journals (code, name)
          `)
          .eq('id', docData.linked_accounting_entry_id)
          .maybeSingle();

        if (entryData) {
          setAccountingEntry(entryData);
        }

        const { data: linesData } = await supabase
          .from('accounting_lines')
          .select(`
            id,
            label,
            debit,
            credit,
            line_order,
            account_id
          `)
          .eq('entry_id', docData.linked_accounting_entry_id)
          .order('line_order', { ascending: true });

        if (linesData && linesData.length > 0) {
          const accountIds = [...new Set(linesData.map((line: any) => line.account_id))];

          const { data: accountsData } = await supabase
            .from('chart_of_accounts')
            .select('id, code, name')
            .in('id', accountIds);

          const accountsMap = new Map(
            (accountsData || []).map((acc: any) => [acc.id, { code: acc.code, name: acc.name }])
          );

          const mappedLines: AccountingLine[] = linesData.map((line: any) => ({
            id: line.id,
            label: line.label,
            debit: line.debit || 0,
            credit: line.credit || 0,
            line_order: line.line_order,
            chart_of_accounts: accountsMap.get(line.account_id) || null,
          }));
          setAccountingLines(mappedLines);
        }
      }

      if (docData.payment_entry_id) {
        const { data: paymentData } = await supabase
          .from('accounting_entries')
          .select(`
            *,
            journals (code, name)
          `)
          .eq('id', docData.payment_entry_id)
          .maybeSingle();

        if (paymentData) {
          setPaymentEntry(paymentData);
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la dépense:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePaid = async () => {
    if (!canModify || !document) return;
    const newStatus = document.payment_status === 'paid' ? 'unpaid' : 'paid';
    const { error } = await supabase
      .from('expense_documents')
      .update({ payment_status: newStatus })
      .eq('id', documentId);
    if (!error) {
      loadDocument();
    } else {
      alert('Erreur lors de la mise à jour du statut de paiement');
    }
  };

  const handleDelete = () => {
    if (!canModify || !document) return;

    setConfirmModal({
      isOpen: true,
      message: 'Confirmer la suppression de cette dépense ? Cette action est irréversible.',
      onConfirm: async () => {
        setConfirmModal({ isOpen: false, message: '', onConfirm: () => {} });
        try {
          const { error } = await supabase
            .from('expense_documents')
            .delete()
            .eq('id', documentId);

          if (error) throw error;

          navigate(`/app/company/${companyId}/expenses`);
        } catch (error) {
          console.error('Erreur suppression:', error);
          alert('Erreur lors de la suppression');
        }
      },
    });
  };

  const getAttachmentUrl = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('justificatifs')
        .createSignedUrl(filePath, 3600);

      if (error) throw error;
      return data.signedUrl;
    } catch (error) {
      console.error('Erreur récupération URL:', error);
      return null;
    }
  };

  const handleViewAttachment = async (attachment: Attachment) => {
    const url = await getAttachmentUrl(attachment.file_path);
    if (url) {
      window.open(url, '_blank');
    } else {
      alert('Impossible d\'ouvrir le fichier');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#6b7280' }}>
        Chargement...
      </div>
    );
  }

  if (!document) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#6b7280' }}>
        Dépense introuvable
      </div>
    );
  }

  const isLocked =
    !!document.linked_accounting_entry_id ||
    !!document.payment_entry_id;

  return (
    <>
      <div style={{ padding: '32px 20px', maxWidth: '1000px', margin: '0 auto' }}>
        <BackButton to={`/app/company/${companyId}/expenses`} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', gap: '16px', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#111827', margin: 0 }}>
            Dépense du {new Date(document.invoice_date).toLocaleDateString('fr-FR')}
          </h1>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {canModify && !document.payment_entry_id && (
              <button
                onClick={handleTogglePaid}
                style={{
                  padding: '10px 20px',
                  backgroundColor: document.payment_status === 'paid' ? '#fef3c7' : '#d1fae5',
                  color: document.payment_status === 'paid' ? '#92400e' : '#065f46',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                {document.payment_status === 'paid' ? 'Marquer comme non payé' : 'Marquer comme payé'}
              </button>
            )}
            {canModify && !isLocked && (
              <>
                <button
                  onClick={() => navigate(`/app/company/${companyId}/expenses/${documentId}/edit`)}
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
                <button
                  onClick={handleDelete}
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
              </>
            )}
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '12px', textTransform: 'uppercase' }}>
                Informations
              </h3>
              <div style={{ fontSize: '14px', color: '#111827', lineHeight: '1.8' }}>
                <div><strong>Date:</strong> {new Date(document.invoice_date).toLocaleDateString('fr-FR')}</div>
                {document.third_party && (
                  <div>
                    <strong>Fournisseur:</strong>{' '}
                    {document.third_party.code
                      ? `${document.third_party.code} — ${document.third_party.name}`
                      : document.third_party.name}
                  </div>
                )}
                <div>
                  <strong>Statut comptable:</strong>
                  <span style={{ marginLeft: '8px' }}>
                    <StatusBadges accountingStatus={document.accounting_status} paymentStatus={document.payment_status} paymentEntryId={document.payment_entry_id} />
                  </span>
                </div>
                {document.payment_status === 'paid' && document.paid_at && (
                  <div><strong>Date de paiement:</strong> {new Date(document.paid_at).toLocaleDateString('fr-FR')}</div>
                )}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '12px', textTransform: 'uppercase' }}>
                Montants
              </h3>
              <div style={{ fontSize: '14px', color: '#111827', lineHeight: '1.8' }}>
                <div><strong>Total HT:</strong> {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(document.total_excl_vat)}</div>
                <div><strong>Total TVA:</strong> {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(document.total_vat)}</div>
                <div style={{ fontSize: '16px', fontWeight: '600', marginTop: '8px' }}>
                  <strong>Total TTC:</strong> {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(document.total_incl_vat)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
            Lignes de dépense
          </h3>

          {lines.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '24px' }}>
              Aucune ligne de dépense
            </p>
          ) : (
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
                    HT
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    TVA %
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    TVA
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    TTC
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px 8px', fontSize: '14px', color: '#111827' }}>
                      {line.description}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '14px', color: '#6b7280' }}>
                      <div>{line.expense_categories?.name || '—'}</div>
                      {line.expense_subcategories?.name && (
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>{line.expense_subcategories.name}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '14px', color: '#111827', textAlign: 'right' }}>
                      {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(line.amount_excl_vat)}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '14px', color: '#111827', textAlign: 'right' }}>
                      {(line.vat_rate * 100).toFixed(2).replace(/\.00$/, '')}%
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '14px', color: '#111827', textAlign: 'right' }}>
                      {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(line.vat_amount)}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '14px', color: '#111827', textAlign: 'right', fontWeight: '600' }}>
                      {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(line.amount_incl_vat)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
            Justificatifs
          </h3>

          {attachments.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '24px' }}>
              Aucun justificatif
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ fontSize: '14px', color: '#111827' }}>
                    <div style={{ fontWeight: '500' }}>
                      {attachment.file_path.split('/').pop()}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                      {new Date(attachment.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <button
                    onClick={() => handleViewAttachment(attachment)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Voir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
            Comptabilité
          </h3>

          {!accountingEntry && !paymentEntry ? (
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
              Aucune écriture comptable liée
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
              {accountingEntry && (
                <div style={{ padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937', marginBottom: '8px' }}>
                    Écriture d'achat
                  </div>
                  <div style={{ fontSize: '14px', color: '#111827', lineHeight: '1.6' }}>
                    <div><strong>Numéro:</strong> {accountingEntry.entry_number}</div>
                    <div><strong>Date:</strong> {new Date(accountingEntry.entry_date).toLocaleDateString('fr-FR')}</div>
                    <div><strong>Journal:</strong> {accountingEntry.journals?.code} - {accountingEntry.journals?.name}</div>
                    <div>
                      <strong>Statut:</strong>
                      <span style={{
                        marginLeft: '8px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: accountingEntry.is_locked ? '#fee2e2' : '#d1fae5',
                        color: accountingEntry.is_locked ? '#991b1b' : '#065f46',
                      }}>
                        {accountingEntry.is_locked ? 'Verrouillée' : 'Déverrouillée'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {accountingEntry && accountingLines.length > 0 && (
                <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
                    Lignes comptables
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                          <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                            Compte
                          </th>
                          <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                            Libellé
                          </th>
                          <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                            Débit
                          </th>
                          <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                            Crédit
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {accountingLines.map((line) => (
                          <tr key={line.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '10px 8px', fontSize: '13px', color: '#111827', fontWeight: '500' }}>
                              {line.chart_of_accounts?.code || '—'}
                            </td>
                            <td style={{ padding: '10px 8px', fontSize: '13px', color: '#111827' }}>
                              {line.chart_of_accounts?.name || line.label}
                            </td>
                            <td style={{ padding: '10px 8px', fontSize: '13px', color: '#111827', textAlign: 'right', fontFamily: 'monospace' }}>
                              {line.debit > 0 ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(line.debit) : '—'}
                            </td>
                            <td style={{ padding: '10px 8px', fontSize: '13px', color: '#111827', textAlign: 'right', fontFamily: 'monospace' }}>
                              {line.credit > 0 ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(line.credit) : '—'}
                            </td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: '2px solid #1f2937', backgroundColor: '#f3f4f6' }}>
                          <td colSpan={2} style={{ padding: '10px 8px', fontSize: '13px', color: '#111827', fontWeight: '600' }}>
                            Total
                          </td>
                          <td style={{ padding: '10px 8px', fontSize: '13px', color: '#111827', textAlign: 'right', fontWeight: '600', fontFamily: 'monospace' }}>
                            {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
                              accountingLines.reduce((sum, line) => sum + (line.debit || 0), 0)
                            )}
                          </td>
                          <td style={{ padding: '10px 8px', fontSize: '13px', color: '#111827', textAlign: 'right', fontWeight: '600', fontFamily: 'monospace' }}>
                            {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
                              accountingLines.reduce((sum, line) => sum + (line.credit || 0), 0)
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {paymentEntry && (
                <div style={{ padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937', marginBottom: '8px' }}>
                    Écriture de paiement
                  </div>
                  <div style={{ fontSize: '14px', color: '#111827', lineHeight: '1.6' }}>
                    <div><strong>Numéro:</strong> {paymentEntry.entry_number}</div>
                    <div><strong>Date:</strong> {new Date(paymentEntry.entry_date).toLocaleDateString('fr-FR')}</div>
                    <div><strong>Journal:</strong> {paymentEntry.journals?.code} - {paymentEntry.journals?.name}</div>
                    <div>
                      <strong>Statut:</strong>
                      <span style={{
                        marginLeft: '8px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: paymentEntry.is_locked ? '#fee2e2' : '#d1fae5',
                        color: paymentEntry.is_locked ? '#991b1b' : '#065f46',
                      }}>
                        {paymentEntry.is_locked ? 'Verrouillée' : 'Déverrouillée'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => navigate(`/app/company/${companyId}/comptabilite`)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Voir en comptabilité
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ isOpen: false, message: '', onConfirm: () => {} })}
      />
    </>
  );
}
