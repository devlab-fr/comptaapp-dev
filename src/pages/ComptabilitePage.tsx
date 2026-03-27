import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';
import Toast from '../components/Toast';
import { compareVat, getVatAccountDetails, VatComparison, VatAccountDetail } from '../utils/accountingVat';
import { checkClosureStatus, getAccountingStatements, ClosureStatus, AccountingStatement, ControlStatus } from '../utils/closureControls';
import { exportFECLike, exportBalance, exportVATComptable } from '../utils/closureExports';
import { getFiscalYearStatus, updateFiscalYearStatus, getUserRole, getStatusLabel, getStatusColor, getStatusBgColor, FiscalYearStatusType } from '../utils/cabinetMode';
import { EntryCommentsModal } from '../components/EntryCommentsModal';
import { useEntitlements } from '../billing/useEntitlements';
import { hasFeature, getFeatureBlockedMessage, convertEntitlementsPlanToTier } from '../billing/planRules';

interface Company {
  id: string;
  name: string;
}

type TabType = 'plan' | 'journals' | 'entry' | 'list' | 'balance' | 'vat' | 'closure';

export function ComptabilitePage() {
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();
  const entitlements = useEntitlements();
  const [searchParams] = useSearchParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('plan');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadCompany();

    const tabParam = searchParams.get('tab');
    const sourceParam = searchParams.get('source');

    if (sourceParam && (sourceParam === 'expense' || sourceParam === 'revenue')) {
      setActiveTab('entry');
    } else if (tabParam && ['plan', 'journals', 'entry', 'list', 'balance', 'vat', 'closure'].includes(tabParam)) {
      setActiveTab(tabParam as TabType);
    }
  }, [companyId, searchParams]);

  const loadCompany = async () => {
    if (!companyId) return;

    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .eq('id', companyId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setToast({ message: 'Entreprise introuvable', type: 'error' });
        navigate('/app');
        return;
      }

      setCompany(data);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Chargement...</p>
      </div>
    );
  }

  if (!company) {
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <style>{`
        @media (max-width: 640px) {
          .tabs-container::-webkit-scrollbar {
            display: none;
          }
        }
      `}</style>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        padding: '20px 40px'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <BackButton to={`/app/company/${companyId}`} />
          <h1 style={{
            margin: '0 0 8px 0',
            fontSize: '28px',
            fontWeight: '700',
            color: '#1a1a1a'
          }}>
            Comptabilité
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
            {company.name}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 40px' }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <div className="tabs-container" style={{
            display: 'flex',
            borderBottom: '2px solid #e5e7eb',
            padding: '0 24px',
            gap: '8px',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}>
            <TabButton
              active={activeTab === 'plan'}
              onClick={() => setActiveTab('plan')}
              label="Plan Comptable"
            />
            <TabButton
              active={activeTab === 'journals'}
              onClick={() => setActiveTab('journals')}
              label="Journaux"
            />
            <TabButton
              active={activeTab === 'entry'}
              onClick={() => setActiveTab('entry')}
              label="Saisie"
            />
            <TabButton
              active={activeTab === 'list'}
              onClick={() => setActiveTab('list')}
              label="Journal"
            />
            <TabButton
              active={activeTab === 'balance'}
              onClick={() => setActiveTab('balance')}
              label="Balance"
            />
            <TabButton
              active={activeTab === 'vat'}
              onClick={() => setActiveTab('vat')}
              label="TVA (comptable)"
            />
            <TabButton
              active={activeTab === 'closure'}
              onClick={() => setActiveTab('closure')}
              label="Clôture"
            />
          </div>

          <div style={{ padding: '32px 24px' }}>
            {activeTab === 'plan' && <PlanComptableTab companyId={companyId!} setToast={setToast} />}
            {activeTab === 'journals' && <JournauxTab companyId={companyId!} setToast={setToast} />}
            {activeTab === 'entry' && (
              <SaisieTab
                companyId={companyId!}
                setToast={setToast}
                sourceType={searchParams.get('source') as 'expense' | 'revenue' | null}
                sourceDocumentId={searchParams.get('documentId')}
              />
            )}
            {activeTab === 'list' && <JournalListTab companyId={companyId!} setToast={setToast} />}
            {activeTab === 'balance' && <BalanceTab companyId={companyId!} setToast={setToast} />}
            {activeTab === 'vat' && <VatTab companyId={companyId!} setToast={setToast} />}
            {activeTab === 'closure' && <ClosureTab companyId={companyId!} setToast={setToast} entitlements={entitlements} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '14px 20px',
        border: 'none',
        backgroundColor: 'transparent',
        borderBottom: active ? '2px solid #059669' : '2px solid transparent',
        color: active ? '#059669' : '#6b7280',
        fontWeight: active ? '600' : '500',
        fontSize: '14px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        marginBottom: '-2px'
      }}
    >
      {label}
    </button>
  );
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: 'actif' | 'passif' | 'charge' | 'produit';
  is_default: boolean;
  is_active: boolean;
}

function PlanComptableTab({ companyId, setToast }: { companyId: string; setToast: (t: any) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'charge' as 'actif' | 'passif' | 'charge' | 'produit'
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('code');

      if (error) throw error;
      setAccounts(data || []);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code || !formData.name) {
      setToast({ message: 'Veuillez remplir tous les champs', type: 'error' });
      return;
    }

    try {
      const { error } = await supabase
        .from('chart_of_accounts')
        .insert({
          company_id: companyId,
          code: formData.code,
          name: formData.name,
          type: formData.type,
          is_default: false,
          is_active: true
        });

      if (error) throw error;

      setToast({ message: 'Compte créé avec succès', type: 'success' });
      setShowForm(false);
      setFormData({ code: '', name: '', type: 'charge' });
      loadAccounts();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  if (loading) return <p>Chargement...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Plan Comptable</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '10px 20px',
            backgroundColor: '#059669',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          {showForm ? 'Annuler' : '+ Nouveau compte'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{
          backgroundColor: '#f9fafb',
          padding: '24px',
          borderRadius: '8px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                Code
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="Ex: 411000"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                Libellé
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Clients"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="actif">Actif</option>
                <option value="passif">Passif</option>
                <option value="charge">Charge</option>
                <option value="produit">Produit</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            style={{
              padding: '10px 24px',
              backgroundColor: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Créer le compte
          </button>
        </form>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280' }}>Code</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280' }}>Libellé</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280' }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                  Aucun compte. Créez votre premier compte.
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px', fontSize: '14px', fontFamily: 'monospace' }}>{account.code}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{account.name}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500',
                      backgroundColor: account.type === 'actif' ? '#dbeafe' :
                                      account.type === 'passif' ? '#fce7f3' :
                                      account.type === 'charge' ? '#fee2e2' : '#dcfce7',
                      color: account.type === 'actif' ? '#1e40af' :
                             account.type === 'passif' ? '#9f1239' :
                             account.type === 'charge' ? '#991b1b' : '#166534'
                    }}>
                      {account.type}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface Journal {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

function JournauxTab({ companyId, setToast }: { companyId: string; setToast: (t: any) => void }) {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJournals();
  }, []);

  const loadJournals = async () => {
    try {
      const { data, error } = await supabase
        .from('journals')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('code');

      if (error) throw error;

      if (!data || data.length === 0) {
        await initializeDefaultJournals();
        return;
      }

      setJournals(data || []);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const initializeDefaultJournals = async () => {
    const defaultJournals = [
      { code: 'ACH', name: 'Achats' },
      { code: 'VT', name: 'Ventes' },
      { code: 'BQ', name: 'Banque' },
      { code: 'OD', name: 'Opérations Diverses' }
    ];

    try {
      const { error } = await supabase
        .from('journals')
        .insert(
          defaultJournals.map(j => ({
            company_id: companyId,
            code: j.code,
            name: j.name,
            is_active: true
          }))
        );

      if (error) throw error;
      loadJournals();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  if (loading) return <p>Chargement...</p>;

  return (
    <div>
      <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: '600' }}>Journaux</h2>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280' }}>Code</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280' }}>Nom</th>
            </tr>
          </thead>
          <tbody>
            {journals.map((journal) => (
              <tr key={journal.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontSize: '14px', fontFamily: 'monospace', fontWeight: '600' }}>{journal.code}</td>
                <td style={{ padding: '12px', fontSize: '14px' }}>{journal.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface AccountingLine {
  tempId: string;
  account_id: string;
  label: string;
  debit: string;
  credit: string;
}

interface SaisieTabProps {
  companyId: string;
  setToast: (t: any) => void;
  sourceType?: 'expense' | 'revenue' | null;
  sourceDocumentId?: string | null;
}

function SaisieTab({ companyId, setToast, sourceType, sourceDocumentId }: SaisieTabProps) {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lines, setLines] = useState<AccountingLine[]>([
    { tempId: '1', account_id: '', label: '', debit: '0', credit: '0' },
    { tempId: '2', account_id: '', label: '', debit: '0', credit: '0' }
  ]);
  const [formData, setFormData] = useState({
    journal_id: '',
    entry_date: new Date().toISOString().split('T')[0],
    description: '',
    fiscal_year: new Date().getFullYear()
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [sourceType, sourceDocumentId]);

  const loadData = async () => {
    try {
      const [journalsRes, accountsRes] = await Promise.all([
        supabase.from('journals').select('*').eq('company_id', companyId).eq('is_active', true).order('code'),
        supabase.from('chart_of_accounts').select('*').eq('company_id', companyId).eq('is_active', true).order('code')
      ]);

      if (journalsRes.error) throw journalsRes.error;
      if (accountsRes.error) throw accountsRes.error;

      setJournals(journalsRes.data || []);
      setAccounts(accountsRes.data || []);

      if (sourceType && sourceDocumentId) {
        await loadSourceDocument();
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadSourceDocument = async () => {
    if (!sourceType || !sourceDocumentId) return;

    try {
      const tableName = sourceType === 'expense' ? 'expense_documents' : 'revenue_documents';
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', sourceDocumentId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setToast({ message: 'Document introuvable', type: 'error' });
        return;
      }

      await prefillForm(data);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const prefillForm = async (doc: any) => {
    const targetJournal = journals.find(j =>
      sourceType === 'expense' ? j.code === 'ACH' : j.code === 'VT'
    );

    const docDate = new Date(doc.document_date);
    const fiscalYear = docDate.getFullYear();

    setFormData({
      journal_id: targetJournal?.id || '',
      entry_date: doc.document_date,
      description: `${sourceType === 'expense' ? 'Achat' : 'Vente'} - ${doc.supplier_name || doc.description || 'Document'}`,
      fiscal_year: fiscalYear
    });

    const newLines = await generateAccountingLines(doc);
    setLines(newLines);
  };

  const generateAccountingLines = async (doc: any): Promise<AccountingLine[]> => {
    const lines: AccountingLine[] = [];
    const amountHT = parseFloat(doc.total_ht || '0');
    const amountTVA = parseFloat(doc.total_tva || '0');
    const amountTTC = parseFloat(doc.total_ttc || '0');

    if (sourceType === 'expense') {
      const chargeAccount = accounts.find(a => a.code.startsWith('6'));
      const tvaAccount = accounts.find(a => a.code === '44566');
      const fournisseurAccount = accounts.find(a => a.code === '401' || a.code.startsWith('401'));

      if (chargeAccount) {
        lines.push({
          tempId: '1',
          account_id: chargeAccount.id,
          label: 'Charge',
          debit: amountHT.toFixed(2),
          credit: '0'
        });
      }

      if (amountTVA > 0 && tvaAccount) {
        lines.push({
          tempId: '2',
          account_id: tvaAccount.id,
          label: 'TVA déductible',
          debit: amountTVA.toFixed(2),
          credit: '0'
        });
      }

      if (fournisseurAccount) {
        lines.push({
          tempId: '3',
          account_id: fournisseurAccount.id,
          label: 'Fournisseur',
          debit: '0',
          credit: amountTTC.toFixed(2)
        });
      }
    } else {
      const produitAccount = accounts.find(a => a.code.startsWith('7'));
      const tvaAccount = accounts.find(a => a.code === '44571');
      const clientAccount = accounts.find(a => a.code === '411' || a.code.startsWith('411'));

      if (clientAccount) {
        lines.push({
          tempId: '1',
          account_id: clientAccount.id,
          label: 'Client',
          debit: amountTTC.toFixed(2),
          credit: '0'
        });
      }

      if (produitAccount) {
        lines.push({
          tempId: '2',
          account_id: produitAccount.id,
          label: 'Produit',
          debit: '0',
          credit: amountHT.toFixed(2)
        });
      }

      if (amountTVA > 0 && tvaAccount) {
        lines.push({
          tempId: '3',
          account_id: tvaAccount.id,
          label: 'TVA collectée',
          debit: '0',
          credit: amountTVA.toFixed(2)
        });
      }
    }

    if (lines.length === 0) {
      return [
        { tempId: '1', account_id: '', label: '', debit: '0', credit: '0' },
        { tempId: '2', account_id: '', label: '', debit: '0', credit: '0' }
      ];
    }

    return lines;
  };

  const addLine = () => {
    setLines([...lines, {
      tempId: Date.now().toString(),
      account_id: '',
      label: '',
      debit: '0',
      credit: '0'
    }]);
  };

  const removeLine = (tempId: string) => {
    if (lines.length <= 2) {
      setToast({ message: 'Une écriture doit avoir au moins 2 lignes', type: 'error' });
      return;
    }
    setLines(lines.filter(l => l.tempId !== tempId));
  };

  const updateLine = (tempId: string, field: keyof AccountingLine, value: string) => {
    setLines(lines.map(l => l.tempId === tempId ? { ...l, [field]: value } : l));
  };

  const calculateBalance = () => {
    const totalDebit = lines.reduce((sum, l) => sum + parseFloat(l.debit || '0'), 0);
    const totalCredit = lines.reduce((sum, l) => sum + parseFloat(l.credit || '0'), 0);
    return { totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.journal_id || !formData.description) {
      setToast({ message: 'Veuillez remplir tous les champs obligatoires', type: 'error' });
      return;
    }

    const balance = calculateBalance();
    if (!balance.balanced) {
      setToast({ message: `Écriture déséquilibrée: Débit ${balance.totalDebit.toFixed(2)} ≠ Crédit ${balance.totalCredit.toFixed(2)}`, type: 'error' });
      return;
    }

    if (lines.some(l => !l.account_id || !l.label)) {
      setToast({ message: 'Toutes les lignes doivent avoir un compte et un libellé', type: 'error' });
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();

      const { data: entryData, error: entryError } = await supabase
        .from('accounting_entries')
        .insert({
          company_id: companyId,
          fiscal_year: formData.fiscal_year,
          journal_id: formData.journal_id,
          entry_date: formData.entry_date,
          description: formData.description,
          entry_number: '',
          created_by: userData.user?.id
        })
        .select('id')
        .single();

      if (entryError) throw entryError;

      const { error: linesError } = await supabase
        .from('accounting_lines')
        .insert(
          lines.map((line, index) => ({
            entry_id: entryData.id,
            account_id: line.account_id,
            label: line.label,
            debit: parseFloat(line.debit || '0'),
            credit: parseFloat(line.credit || '0'),
            line_order: index
          }))
        );

      if (linesError) throw linesError;

      if (sourceType && sourceDocumentId) {
        const tableName = sourceType === 'expense' ? 'expense_documents' : 'revenue_documents';
        const { error: linkError } = await supabase
          .from(tableName)
          .update({ linked_accounting_entry_id: entryData.id })
          .eq('id', sourceDocumentId);

        if (linkError) throw linkError;
      }

      setToast({ message: 'Écriture créée avec succès', type: 'success' });

      setFormData({
        journal_id: '',
        entry_date: new Date().toISOString().split('T')[0],
        description: '',
        fiscal_year: new Date().getFullYear()
      });
      setLines([
        { tempId: '1', account_id: '', label: '', debit: '0', credit: '0' },
        { tempId: '2', account_id: '', label: '', debit: '0', credit: '0' }
      ]);

      if (sourceType && sourceDocumentId) {
        window.history.back();
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  if (loading) return <p>Chargement...</p>;

  const balance = calculateBalance();

  return (
    <div>
      <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: '600' }}>Saisie d'écriture</h2>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
              Journal *
            </label>
            <select
              value={formData.journal_id}
              onChange={(e) => setFormData({ ...formData, journal_id: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            >
              <option value="">Sélectionner</option>
              {journals.map((j) => (
                <option key={j.id} value={j.id}>{j.code} - {j.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
              Date *
            </label>
            <input
              type="date"
              value={formData.entry_date}
              onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
              Exercice
            </label>
            <input
              type="number"
              value={formData.fiscal_year}
              onChange={(e) => setFormData({ ...formData, fiscal_year: parseInt(e.target.value) })}
              min="2000"
              max="2100"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
              Description *
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ex: Facture client ABC"
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: '600', width: '25%' }}>Compte</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: '600', width: '30%' }}>Libellé</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: '600', width: '15%' }}>Débit</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: '600', width: '15%' }}>Crédit</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: '600', width: '10%' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.tempId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '8px' }}>
                    <select
                      value={line.account_id}
                      onChange={(e) => updateLine(line.tempId, 'account_id', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '13px'
                      }}
                    >
                      <option value="">Sélectionner</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="text"
                      value={line.label}
                      onChange={(e) => updateLine(line.tempId, 'label', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '13px'
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={line.debit}
                      onChange={(e) => updateLine(line.tempId, 'debit', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '13px',
                        textAlign: 'right'
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={line.credit}
                      onChange={(e) => updateLine(line.tempId, 'credit', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '13px',
                        textAlign: 'right'
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => removeLine(line.tempId)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#f9fafb', fontWeight: '600', borderTop: '2px solid #e5e7eb' }}>
                <td colSpan={2} style={{ padding: '12px', textAlign: 'right' }}>Total:</td>
                <td style={{ padding: '12px', textAlign: 'right', color: balance.balanced ? '#059669' : '#dc2626' }}>
                  {balance.totalDebit.toFixed(2)} €
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: balance.balanced ? '#059669' : '#dc2626' }}>
                  {balance.totalCredit.toFixed(2)} €
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  {balance.balanced ? '✓' : '✗'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={addLine}
            style={{
              padding: '10px 20px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            + Ajouter une ligne
          </button>
          <button
            type="submit"
            disabled={!balance.balanced}
            style={{
              padding: '10px 24px',
              backgroundColor: balance.balanced ? '#059669' : '#d1d5db',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: balance.balanced ? 'pointer' : 'not-allowed'
            }}
          >
            Enregistrer l'écriture
          </button>
        </div>
      </form>
    </div>
  );
}

interface EntryWithDetails {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  locked: boolean;
  journal: { code: string; name: string };
}

function JournalListTab({ companyId, setToast }: { companyId: string; setToast: (t: any) => void }) {
  const [entries, setEntries] = useState<EntryWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedEntryForComments, setSelectedEntryForComments] = useState<EntryWithDetails | null>(null);

  useEffect(() => {
    loadEntries();
  }, [selectedYear]);

  const loadEntries = async () => {
    try {
      const { data, error } = await supabase
        .from('accounting_entries')
        .select(`
          id,
          entry_number,
          entry_date,
          description,
          locked,
          journals!inner(code, name)
        `)
        .eq('company_id', companyId)
        .eq('fiscal_year', selectedYear)
        .order('entry_date', { ascending: false });

      if (error) throw error;

      const transformedData = (data || []).map((entry: any) => ({
        id: entry.id,
        entry_number: entry.entry_number,
        entry_date: entry.entry_date,
        description: entry.description,
        locked: entry.locked,
        journal: entry.journals
      }));

      setEntries(transformedData);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p>Chargement...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Journal des écritures</h2>
        <div>
          <label style={{ marginRight: '8px', fontSize: '14px', fontWeight: '500' }}>Exercice:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          >
            {[2025, 2024, 2023, 2022].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: '600' }}>N° Écriture</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: '600' }}>Date</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: '600' }}>Journal</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: '600' }}>Description</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: '600' }}>Statut</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: '600' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                  Aucune écriture pour {selectedYear}
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px', fontSize: '14px', fontFamily: 'monospace' }}>
                    {entry.entry_number}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    {new Date(entry.entry_date).toLocaleDateString('fr-FR')}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600',
                      backgroundColor: '#dbeafe',
                      color: '#1e40af'
                    }}>
                      {entry.journal.code}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{entry.description}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {entry.locked ? (
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b'
                      }}>
                        🔒 Verrouillée
                      </span>
                    ) : (
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        backgroundColor: '#dcfce7',
                        color: '#166534'
                      }}>
                        ✓ Ouverte
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <button
                      onClick={() => setSelectedEntryForComments(entry)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      💬
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedEntryForComments && (
        <EntryCommentsModal
          entryId={selectedEntryForComments.id}
          entryNumber={selectedEntryForComments.entry_number}
          onClose={() => setSelectedEntryForComments(null)}
          setToast={setToast}
        />
      )}
    </div>
  );
}

interface BalanceRow {
  account_code: string;
  account_name: string;
  total_debit: number;
  total_credit: number;
  solde_debit: number;
  solde_credit: number;
}

function BalanceTab({ companyId, setToast }: { companyId: string; setToast: (t: any) => void }) {
  const [balance, setBalance] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadBalance();
  }, [selectedYear]);

  const loadBalance = async () => {
    try {
      const { data: linesData, error } = await supabase
        .from('accounting_lines')
        .select(`
          debit,
          credit,
          account:chart_of_accounts(code, name),
          entry:accounting_entries!inner(company_id, fiscal_year)
        `)
        .eq('entry.company_id', companyId)
        .eq('entry.fiscal_year', selectedYear);

      if (error) throw error;

      const balanceMap = new Map<string, BalanceRow>();

      linesData?.forEach((line: any) => {
        const code = line.account.code;
        const name = line.account.name;
        const key = code;

        if (!balanceMap.has(key)) {
          balanceMap.set(key, {
            account_code: code,
            account_name: name,
            total_debit: 0,
            total_credit: 0,
            solde_debit: 0,
            solde_credit: 0
          });
        }

        const row = balanceMap.get(key)!;
        row.total_debit += parseFloat(line.debit || '0');
        row.total_credit += parseFloat(line.credit || '0');
      });

      const balanceRows = Array.from(balanceMap.values()).map(row => {
        const diff = row.total_debit - row.total_credit;
        if (diff > 0) {
          row.solde_debit = diff;
          row.solde_credit = 0;
        } else {
          row.solde_debit = 0;
          row.solde_credit = Math.abs(diff);
        }
        return row;
      });

      balanceRows.sort((a, b) => a.account_code.localeCompare(b.account_code));

      setBalance(balanceRows);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p>Chargement...</p>;

  const totalDebit = balance.reduce((sum, r) => sum + r.total_debit, 0);
  const totalCredit = balance.reduce((sum, r) => sum + r.total_credit, 0);
  const totalSoldeDebit = balance.reduce((sum, r) => sum + r.solde_debit, 0);
  const totalSoldeCredit = balance.reduce((sum, r) => sum + r.solde_credit, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Balance</h2>
        <div>
          <label style={{ marginRight: '8px', fontSize: '14px', fontWeight: '500' }}>Exercice:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          >
            {[2025, 2024, 2023, 2022].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>Compte</th>
              <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>Libellé</th>
              <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: '600' }}>Total Débit</th>
              <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: '600' }}>Total Crédit</th>
              <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: '600' }}>Solde Débit</th>
              <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: '600' }}>Solde Crédit</th>
            </tr>
          </thead>
          <tbody>
            {balance.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                  Aucune écriture pour {selectedYear}
                </td>
              </tr>
            ) : (
              balance.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: '600' }}>{row.account_code}</td>
                  <td style={{ padding: '10px' }}>{row.account_name}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    {row.total_debit > 0 ? row.total_debit.toFixed(2) + ' €' : '—'}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    {row.total_credit > 0 ? row.total_credit.toFixed(2) + ' €' : '—'}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: '600', color: '#059669' }}>
                    {row.solde_debit > 0 ? row.solde_debit.toFixed(2) + ' €' : '—'}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: '600', color: '#dc2626' }}>
                    {row.solde_credit > 0 ? row.solde_credit.toFixed(2) + ' €' : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#f9fafb', fontWeight: '600', borderTop: '2px solid #e5e7eb' }}>
              <td colSpan={2} style={{ padding: '12px', textAlign: 'right' }}>Total:</td>
              <td style={{ padding: '12px', textAlign: 'right' }}>{totalDebit.toFixed(2)} €</td>
              <td style={{ padding: '12px', textAlign: 'right' }}>{totalCredit.toFixed(2)} €</td>
              <td style={{ padding: '12px', textAlign: 'right', color: '#059669' }}>{totalSoldeDebit.toFixed(2)} €</td>
              <td style={{ padding: '12px', textAlign: 'right', color: '#dc2626' }}>{totalSoldeCredit.toFixed(2)} €</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{
        marginTop: '24px',
        padding: '16px',
        backgroundColor: '#f0f9ff',
        borderRadius: '8px',
        borderLeft: '4px solid #3b82f6'
      }}>
        <p style={{ margin: 0, fontSize: '13px', color: '#1e3a8a' }}>
          La balance présente les totaux et soldes de chaque compte pour l'exercice {selectedYear}.
          Les totaux débit et crédit doivent toujours être égaux.
        </p>
      </div>
    </div>
  );
}

function VatTab({ companyId, setToast }: { companyId: string; setToast: (t: any) => void }) {
  const [comparison, setComparison] = useState<VatComparison | null>(null);
  const [accountDetails, setAccountDetails] = useState<VatAccountDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadVatData();
  }, [selectedYear]);

  const loadVatData = async () => {
    setLoading(true);
    try {
      const [comparisonData, details] = await Promise.all([
        compareVat(companyId, selectedYear),
        getVatAccountDetails(companyId, selectedYear)
      ]);

      setComparison(comparisonData);
      setAccountDetails(details);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <p>Chargement...</p>;
  }

  if (!comparison) {
    return <p>Erreur lors du chargement des données TVA</p>;
  }

  const hasAccountingEntries = comparison.accounting.tvaCollectee !== 0 ||
                                 comparison.accounting.tvaDeductible !== 0;

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
          TVA Comptable
        </h2>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          {[2024, 2025, 2026].map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>

      {!hasAccountingEntries && (
        <div style={{
          padding: '24px',
          backgroundColor: '#fef3c7',
          borderRadius: '8px',
          borderLeft: '4px solid #f59e0b',
          marginBottom: '24px'
        }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#92400e', fontWeight: '500' }}>
            Aucune écriture comptable verrouillée pour l'exercice {selectedYear}.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#92400e' }}>
            La TVA comptable est calculée uniquement à partir des écritures verrouillées.
          </p>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div style={{
          padding: '20px',
          backgroundColor: '#dcfce7',
          borderRadius: '8px',
          border: '1px solid #86efac'
        }}>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#166534', fontWeight: '600' }}>
            TVA Collectée (comptable)
          </p>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#166534' }}>
            {comparison.accounting.tvaCollectee.toFixed(2)} €
          </p>
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: '#dbeafe',
          borderRadius: '8px',
          border: '1px solid #93c5fd'
        }}>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#1e40af', fontWeight: '600' }}>
            TVA Déductible (comptable)
          </p>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1e40af' }}>
            {comparison.accounting.tvaDeductible.toFixed(2)} €
          </p>
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: comparison.accounting.soldeTVA >= 0 ? '#fee2e2' : '#d1fae5',
          borderRadius: '8px',
          border: `1px solid ${comparison.accounting.soldeTVA >= 0 ? '#fecaca' : '#86efac'}`
        }}>
          <p style={{
            margin: '0 0 8px',
            fontSize: '13px',
            color: comparison.accounting.soldeTVA >= 0 ? '#991b1b' : '#166534',
            fontWeight: '600'
          }}>
            Solde {comparison.accounting.soldeTVA >= 0 ? '(à payer)' : '(crédit)'}
          </p>
          <p style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: '700',
            color: comparison.accounting.soldeTVA >= 0 ? '#991b1b' : '#166534'
          }}>
            {Math.abs(comparison.accounting.soldeTVA).toFixed(2)} €
          </p>
        </div>
      </div>

      <div style={{
        padding: '24px',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '2px solid #e5e7eb',
        marginBottom: '24px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            Comparaison Gestion ↔ Comptabilité
          </h3>
          {comparison.coherent ? (
            <span style={{
              padding: '6px 12px',
              backgroundColor: '#dcfce7',
              color: '#166534',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600'
            }}>
              ✅ Cohérent
            </span>
          ) : (
            <span style={{
              padding: '6px 12px',
              backgroundColor: '#fef3c7',
              color: '#92400e',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600'
            }}>
              ⚠️ À vérifier
            </span>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', color: '#6b7280' }}></th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>Gestion</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>Comptable</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>Écart</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontSize: '14px', fontWeight: '500' }}>TVA Collectée</td>
                <td style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>
                  {comparison.management.tvaCollectee.toFixed(2)} €
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>
                  {comparison.accounting.tvaCollectee.toFixed(2)} €
                </td>
                <td style={{
                  padding: '12px',
                  textAlign: 'right',
                  fontSize: '14px',
                  color: Math.abs(comparison.ecartCollectee) < 0.01 ? '#166534' : '#dc2626',
                  fontWeight: '600'
                }}>
                  {comparison.ecartCollectee > 0 ? '+' : ''}{comparison.ecartCollectee.toFixed(2)} €
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontSize: '14px', fontWeight: '500' }}>TVA Déductible</td>
                <td style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>
                  {comparison.management.tvaDeductible.toFixed(2)} €
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>
                  {comparison.accounting.tvaDeductible.toFixed(2)} €
                </td>
                <td style={{
                  padding: '12px',
                  textAlign: 'right',
                  fontSize: '14px',
                  color: Math.abs(comparison.ecartDeductible) < 0.01 ? '#166534' : '#dc2626',
                  fontWeight: '600'
                }}>
                  {comparison.ecartDeductible > 0 ? '+' : ''}{comparison.ecartDeductible.toFixed(2)} €
                </td>
              </tr>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600' }}>Solde TVA</td>
                <td style={{ padding: '12px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>
                  {comparison.management.soldeTVA.toFixed(2)} €
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>
                  {comparison.accounting.soldeTVA.toFixed(2)} €
                </td>
                <td style={{
                  padding: '12px',
                  textAlign: 'right',
                  fontSize: '14px',
                  color: Math.abs(comparison.ecartSolde) < 0.01 ? '#166534' : '#dc2626',
                  fontWeight: '700'
                }}>
                  {comparison.ecartSolde > 0 ? '+' : ''}{comparison.ecartSolde.toFixed(2)} €
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {accountDetails.length > 0 && (
        <div style={{
          padding: '24px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '2px solid #e5e7eb'
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>
            Détail des comptes TVA
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', color: '#6b7280' }}>Compte</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', color: '#6b7280' }}>Libellé</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>Débit</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>Crédit</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>Solde</th>
                </tr>
              </thead>
              <tbody>
                {accountDetails.map((detail) => (
                  <tr key={detail.accountId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontSize: '14px', fontFamily: 'monospace', fontWeight: '600' }}>
                      {detail.code}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px' }}>
                      {detail.name}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>
                      {detail.totalDebit.toFixed(2)} €
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>
                      {detail.totalCredit.toFixed(2)} €
                    </td>
                    <td style={{
                      padding: '12px',
                      textAlign: 'right',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: detail.solde >= 0 ? '#166534' : '#dc2626'
                    }}>
                      {detail.solde.toFixed(2)} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{
        marginTop: '24px',
        padding: '16px',
        backgroundColor: '#f0f9ff',
        borderRadius: '8px',
        borderLeft: '4px solid #3b82f6'
      }}>
        <p style={{ margin: 0, fontSize: '13px', color: '#1e3a8a' }}>
          La TVA comptable est calculée uniquement à partir des écritures verrouillées de l'exercice {selectedYear}.
          La comparaison avec la TVA gestion permet de vérifier la cohérence entre les deux systèmes.
        </p>
      </div>
    </div>
  );
}

function ClosureTab({ companyId, setToast, entitlements }: { companyId: string; setToast: (t: any) => void; entitlements: any }) {
  const [closureStatus, setClosureStatus] = useState<ClosureStatus | null>(null);
  const [statements, setStatements] = useState<AccountingStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [fiscalYearStatus, setFiscalYearStatus] = useState<FiscalYearStatusType>('en_cours');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showExportFilters, setShowExportFilters] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportJournalId, setExportJournalId] = useState('');
  const [journals, setJournals] = useState<any[]>([]);

  useEffect(() => {
    loadClosureData();
    loadJournals();
  }, [selectedYear]);

  const loadClosureData = async () => {
    setLoading(true);
    try {
      const [status, accountingStatements, fiscalStatus, role] = await Promise.all([
        checkClosureStatus(companyId, selectedYear),
        getAccountingStatements(companyId, selectedYear),
        getFiscalYearStatus(companyId, selectedYear),
        getUserRole(companyId)
      ]);

      setClosureStatus(status);
      setStatements(accountingStatements);
      setFiscalYearStatus(fiscalStatus?.status || 'en_cours');
      setUserRole(role);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadJournals = async () => {
    const { data } = await supabase
      .from('journals')
      .select('id, code, name')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('code');

    setJournals(data || []);
  };

  const handleStatusChange = async (newStatus: FiscalYearStatusType) => {
    try {
      await updateFiscalYearStatus(companyId, selectedYear, newStatus);
      setFiscalYearStatus(newStatus);
      setToast({ message: 'Statut mis à jour avec succès', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const getStatusBadge = (status: ControlStatus) => {
    if (status === 'ok') {
      return (
        <span style={{
          padding: '8px 16px',
          backgroundColor: '#dcfce7',
          color: '#166534',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: '600'
        }}>
          Prêt pour export cabinet
        </span>
      );
    } else if (status === 'warning') {
      return (
        <span style={{
          padding: '8px 16px',
          backgroundColor: '#fef3c7',
          color: '#92400e',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: '600'
        }}>
          À vérifier
        </span>
      );
    } else {
      return (
        <span style={{
          padding: '8px 16px',
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: '600'
        }}>
          Incomplet
        </span>
      );
    }
  };

  const getControlStatusIcon = (status: ControlStatus) => {
    if (status === 'ok') return '✓';
    if (status === 'warning') return '⚠️';
    return '✗';
  };

  const getControlStatusColor = (status: ControlStatus) => {
    if (status === 'ok') return '#166534';
    if (status === 'warning') return '#92400e';
    return '#991b1b';
  };

  const getControlStatusBg = (status: ControlStatus) => {
    if (status === 'ok') return '#dcfce7';
    if (status === 'warning') return '#fef3c7';
    return '#fee2e2';
  };

  if (loading) {
    return <p>Chargement...</p>;
  }

  if (!closureStatus || !statements) {
    return <p>Erreur lors du chargement des données de clôture</p>;
  }

  return (
    <div>
      <div style={{
        padding: '16px 24px',
        backgroundColor: '#fffbeb',
        borderRadius: '8px',
        border: '2px solid #fbbf24',
        marginBottom: '24px'
      }}>
        <p style={{ margin: 0, fontSize: '14px', color: '#78350f', fontWeight: '600' }}>
          État informatif basé sur les écritures verrouillées. Ne constitue pas une déclaration fiscale.
        </p>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '600' }}>
            Clôture Comptable (Pré-liasse)
          </h2>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
            {getStatusBadge(closureStatus.overall)}
            <span style={{
              padding: '6px 12px',
              backgroundColor: getStatusBgColor(fiscalYearStatus),
              color: getStatusColor(fiscalYearStatus),
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600'
            }}>
              {getStatusLabel(fiscalYearStatus)}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {(userRole === 'owner' || userRole === 'accountant') && (
            <select
              value={fiscalYearStatus}
              onChange={(e) => handleStatusChange(e.target.value as FiscalYearStatusType)}
              disabled={fiscalYearStatus === 'cloture'}
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: fiscalYearStatus === 'cloture' ? 'not-allowed' : 'pointer',
                backgroundColor: fiscalYearStatus === 'cloture' ? '#f3f4f6' : 'white'
              }}
            >
              <option value="en_cours">En cours</option>
              <option value="a_corriger">À corriger</option>
              <option value="pret_cabinet">Prêt cabinet</option>
              <option value="cloture">Clôturé</option>
            </select>
          )}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            {[2024, 2025, 2026].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{
        padding: '24px',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '2px solid #e5e7eb',
        marginBottom: '32px'
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>
          Checklist de Clôture
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {closureStatus.controls.map((control) => (
            <div
              key={control.id}
              style={{
                padding: '16px',
                backgroundColor: getControlStatusBg(control.status),
                borderRadius: '6px',
                border: `1px solid ${getControlStatusColor(control.status)}20`
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    fontSize: '18px',
                    fontWeight: '700',
                    color: getControlStatusColor(control.status)
                  }}>
                    {getControlStatusIcon(control.status)}
                  </span>
                  <div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                      {control.label}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                      {control.details}
                    </p>
                  </div>
                </div>
                {control.count !== undefined && (
                  <span style={{
                    padding: '4px 12px',
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: getControlStatusColor(control.status)
                  }}>
                    {control.count}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        padding: '24px',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '2px solid #e5e7eb',
        marginBottom: '32px'
      }}>
        <h3 style={{ margin: '0 0 24px', fontSize: '16px', fontWeight: '600' }}>
          États Comptables (Informatifs)
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '32px'
        }}>
          <div style={{
            padding: '20px',
            backgroundColor: '#dcfce7',
            borderRadius: '8px',
            border: '1px solid #86efac'
          }}>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#166534', fontWeight: '600' }}>
              Total Produits
            </p>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#166534' }}>
              {statements.totalProduits.toFixed(2)} €
            </p>
          </div>

          <div style={{
            padding: '20px',
            backgroundColor: '#fee2e2',
            borderRadius: '8px',
            border: '1px solid #fecaca'
          }}>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#991b1b', fontWeight: '600' }}>
              Total Charges
            </p>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#991b1b' }}>
              {statements.totalCharges.toFixed(2)} €
            </p>
          </div>

          <div style={{
            padding: '20px',
            backgroundColor: statements.resultat >= 0 ? '#dbeafe' : '#fee2e2',
            borderRadius: '8px',
            border: `1px solid ${statements.resultat >= 0 ? '#93c5fd' : '#fecaca'}`
          }}>
            <p style={{
              margin: '0 0 8px',
              fontSize: '13px',
              color: statements.resultat >= 0 ? '#1e40af' : '#991b1b',
              fontWeight: '600'
            }}>
              Résultat
            </p>
            <p style={{
              margin: 0,
              fontSize: '24px',
              fontWeight: '700',
              color: statements.resultat >= 0 ? '#1e40af' : '#991b1b'
            }}>
              {statements.resultat.toFixed(2)} €
            </p>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            padding: '20px',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            border: '1px solid #d1d5db'
          }}>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#374151', fontWeight: '600' }}>
              Total Actif
            </p>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#374151' }}>
              {statements.totalActif.toFixed(2)} €
            </p>
          </div>

          <div style={{
            padding: '20px',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            border: '1px solid #d1d5db'
          }}>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#374151', fontWeight: '600' }}>
              Total Passif
            </p>
            <p style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#374151' }}>
              {statements.totalPassif.toFixed(2)} €
            </p>
          </div>

          <div style={{
            padding: '20px',
            backgroundColor: statements.balanceEquilibree ? '#dcfce7' : '#fef3c7',
            borderRadius: '8px',
            border: `1px solid ${statements.balanceEquilibree ? '#86efac' : '#fde047'}`
          }}>
            <p style={{
              margin: '0 0 8px',
              fontSize: '13px',
              color: statements.balanceEquilibree ? '#166534' : '#92400e',
              fontWeight: '600'
            }}>
              Balance
            </p>
            <p style={{
              margin: 0,
              fontSize: '14px',
              fontWeight: '700',
              color: statements.balanceEquilibree ? '#166534' : '#92400e'
            }}>
              {statements.balanceEquilibree ? 'Équilibrée' : 'À vérifier'}
            </p>
          </div>
        </div>

        <div style={{
          padding: '12px',
          backgroundColor: '#f0f9ff',
          borderRadius: '6px',
          fontSize: '13px',
          color: '#1e3a8a'
        }}>
          États calculés à partir des écritures verrouillées de l'exercice {selectedYear}
        </div>
      </div>

      <div style={{
        padding: '24px',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '2px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            Exports Cabinet (Non officiels)
          </h3>
          <button
            onClick={() => setShowExportFilters(!showExportFilters)}
            style={{
              padding: '8px 16px',
              backgroundColor: showExportFilters ? '#3b82f6' : 'white',
              color: showExportFilters ? 'white' : '#3b82f6',
              border: '1px solid #3b82f6',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {showExportFilters ? 'Masquer les filtres' : 'Filtres avancés'}
          </button>
        </div>

        {showExportFilters && (
          <div style={{
            padding: '16px',
            backgroundColor: '#f9fafb',
            borderRadius: '6px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: '#374151' }}>
                  Date début
                </label>
                <input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: '#374151' }}>
                  Date fin
                </label>
                <input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: '#374151' }}>
                  Journal
                </label>
                <select
                  value={exportJournalId}
                  onChange={(e) => setExportJournalId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                >
                  <option value="">Tous les journaux</option>
                  {journals.map(j => (
                    <option key={j.id} value={j.id}>{j.code} - {j.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {(exportStartDate || exportEndDate || exportJournalId) && (
              <button
                onClick={() => {
                  setExportStartDate('');
                  setExportEndDate('');
                  setExportJournalId('');
                }}
                style={{
                  marginTop: '12px',
                  padding: '6px 12px',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <button
            onClick={() => {
              const planTier = convertEntitlementsPlanToTier(entitlements.plan);
              if (!hasFeature(planTier, 'exports_csv')) {
                setToast({ message: getFeatureBlockedMessage('exports_csv'), type: 'error' });
                return;
              }
              const filters: any = {};
              if (exportStartDate) filters.startDate = exportStartDate;
              if (exportEndDate) filters.endDate = exportEndDate;
              if (exportJournalId) filters.journalId = exportJournalId;
              exportFECLike(companyId, selectedYear, filters);
            }}
            style={{
              padding: '12px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Export Cabinet (Format tableur)
          </button>

          <button
            onClick={() => {
              const planTier = convertEntitlementsPlanToTier(entitlements.plan);
              if (!hasFeature(planTier, 'exports_csv')) {
                setToast({ message: getFeatureBlockedMessage('exports_csv'), type: 'error' });
                return;
              }
              exportBalance(companyId, selectedYear);
            }}
            style={{
              padding: '12px 20px',
              backgroundColor: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Balance CSV
          </button>

          <button
            onClick={() => {
              const planTier = convertEntitlementsPlanToTier(entitlements.plan);
              if (!hasFeature(planTier, 'exports_csv')) {
                setToast({ message: getFeatureBlockedMessage('exports_csv'), type: 'error' });
                return;
              }
              exportVATComptable(companyId, selectedYear);
            }}
            style={{
              padding: '12px 20px',
              backgroundColor: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            TVA Comptable CSV
          </button>
        </div>

        <p style={{ margin: '16px 0 0', fontSize: '13px', color: '#6b7280' }}>
          Ces exports sont destinés à votre expert-comptable et ne constituent pas des déclarations officielles.
        </p>
      </div>
    </div>
  );
}
