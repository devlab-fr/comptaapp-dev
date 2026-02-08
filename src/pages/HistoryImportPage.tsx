import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePlan } from '../lib/usePlan';
import AppHeader from '../components/AppHeader';
import BackButton from '../components/BackButton';
import Toast from '../components/Toast';

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface CatchupLine {
  id: string;
  category_id: string;
  category_type: 'expense' | 'revenue';
  category_name: string;
  total_ht: string;
  total_tva: string;
  total_ttc: string;
}

interface OpeningEntry {
  id?: string;
  date_reprise: string;
  tresorerie: string;
  creances_clients: string;
  dettes_fournisseurs: string;
  tva_solde: string;
  tva_sens: 'payer' | 'credit';
}

export default function HistoryImportPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { effectiveTier } = usePlan(companyId);

  const currentYear = new Date().getFullYear();
  const isFree = effectiveTier === 'FREE';

  // Opening entry state
  const [openingEntry, setOpeningEntry] = useState<OpeningEntry>({
    date_reprise: new Date().toISOString().split('T')[0],
    tresorerie: '0',
    creances_clients: '0',
    dettes_fournisseurs: '0',
    tva_solde: '0',
    tva_sens: 'payer',
  });

  // Catchup totals state
  const [periodFrom, setPeriodFrom] = useState(`${currentYear}-01-01`);
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().split('T')[0]);
  const [categoryType, setCategoryType] = useState<'expense' | 'revenue'>('expense');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [lineHT, setLineHT] = useState('');
  const [lineTVA, setLineTVA] = useState('');
  const [lineTTC, setLineTTC] = useState('');

  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);
  const [revenueCategories, setRevenueCategories] = useState<Category[]>([]);
  const [catchupLines, setCatchupLines] = useState<CatchupLine[]>([]);

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  useEffect(() => {
    loadData();
  }, [companyId, currentYear]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const loadData = async () => {
    if (!companyId || !user) return;

    // Load expense categories
    const { data: expCat } = await supabase
      .from('expense_categories')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (expCat) setExpenseCategories(expCat);

    // Load revenue categories
    const { data: revCat } = await supabase
      .from('revenue_categories')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (revCat) setRevenueCategories(revCat);

    // Load existing opening entry
    const { data: openingData } = await supabase
      .from('opening_entries')
      .select('*')
      .eq('company_id', companyId)
      .eq('year', currentYear)
      .maybeSingle();

    if (openingData) {
      setOpeningEntry({
        id: openingData.id,
        date_reprise: openingData.date_reprise,
        tresorerie: String(openingData.tresorerie),
        creances_clients: String(openingData.creances_clients),
        dettes_fournisseurs: String(openingData.dettes_fournisseurs),
        tva_solde: String(openingData.tva_solde),
        tva_sens: openingData.tva_sens,
      });
    }

    // Load existing catchup totals
    const { data: catchupData } = await supabase
      .from('catchup_totals')
      .select('*')
      .eq('company_id', companyId)
      .eq('year', currentYear)
      .order('created_at', { ascending: true });

    if (catchupData) {
      const lines: CatchupLine[] = [];
      for (const row of catchupData) {
        let catName = 'Catégorie inconnue';
        if (row.category_type === 'expense') {
          const cat = expCat?.find(c => c.id === row.category_id);
          if (cat) catName = cat.name;
        } else {
          const cat = revCat?.find(c => c.id === row.category_id);
          if (cat) catName = cat.name;
        }
        lines.push({
          id: row.id,
          category_id: row.category_id,
          category_type: row.category_type,
          category_name: catName,
          total_ht: String(row.total_ht),
          total_tva: String(row.total_tva),
          total_ttc: String(row.total_ttc),
        });
      }
      setCatchupLines(lines);
    }
  };

  const handleSaveOpeningEntry = async () => {
    if (!companyId || !user) return;
    setLoading(true);

    try {
      const payload = {
        user_id: user.id,
        company_id: companyId,
        year: currentYear,
        date_reprise: openingEntry.date_reprise,
        tresorerie: parseFloat(openingEntry.tresorerie || '0'),
        creances_clients: parseFloat(openingEntry.creances_clients || '0'),
        dettes_fournisseurs: parseFloat(openingEntry.dettes_fournisseurs || '0'),
        tva_solde: parseFloat(openingEntry.tva_solde || '0'),
        tva_sens: openingEntry.tva_sens,
      };

      if (openingEntry.id) {
        // Update
        const { error } = await supabase
          .from('opening_entries')
          .update(payload)
          .eq('id', openingEntry.id);
        if (error) throw error;
        setToast({ message: 'Reprise d\'ouverture mise à jour avec succès', type: 'success' });
      } else {
        // Insert
        const { data, error } = await supabase
          .from('opening_entries')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setOpeningEntry({ ...openingEntry, id: data.id });
        }
        setToast({ message: 'Reprise d\'ouverture enregistrée avec succès', type: 'success' });
      }
    } catch (error: any) {
      console.error('Error saving opening entry:', error);
      setToast({ message: error.message || 'Erreur lors de l\'enregistrement', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCatchupLine = async () => {
    if (!companyId || !user) return;
    if (!selectedCategoryId || !lineHT) {
      setToast({ message: 'Veuillez renseigner la catégorie et le montant HT', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        user_id: user.id,
        company_id: companyId,
        year: currentYear,
        period_from: periodFrom,
        period_to: periodTo,
        category_id: selectedCategoryId,
        category_type: categoryType,
        total_ht: parseFloat(lineHT),
        total_tva: parseFloat(lineTVA || '0'),
        total_ttc: parseFloat(lineTTC || '0'),
      };

      const { error } = await supabase
        .from('catchup_totals')
        .insert(payload);

      if (error) throw error;

      setToast({ message: 'Ligne de rattrapage ajoutée avec succès', type: 'success' });

      // Reset form
      setSelectedCategoryId('');
      setLineHT('');
      setLineTVA('');
      setLineTTC('');

      // Reload
      await loadData();
    } catch (error: any) {
      console.error('Error adding catchup line:', error);
      setToast({ message: error.message || 'Erreur lors de l\'ajout', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCatchupLine = async (id: string) => {
    if (!window.confirm('Supprimer cette ligne de rattrapage ?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('catchup_totals')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setToast({ message: 'Ligne supprimée', type: 'success' });
      await loadData();
    } catch (error: any) {
      setToast({ message: 'Erreur lors de la suppression', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const currentCategories = categoryType === 'expense' ? expenseCategories : revenueCategories;

  return (
    <>
      <AppHeader onSignOut={handleSignOut} />

      <div className="min-h-screen w-full bg-slate-100 flex flex-col pt-16">
        {/* Sticky Back Button Bar */}
        <div className="sticky top-16 z-40">
          <div className="mx-auto w-full max-w-5xl px-6 sm:px-10 lg:px-12 py-2">
            <BackButton />
          </div>
        </div>

        <div className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-6 sm:px-10 lg:px-12 py-4 sm:py-6">
            <div className="bg-white rounded-3xl shadow-xl ring-1 ring-black/5 p-10 sm:p-12 lg:p-14">
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight text-gray-900 mb-6">
                Reprise d'historique
              </h1>

              {/* Encart Information */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-6">
                <h2 className="text-lg font-bold text-blue-900 mb-3 flex items-center gap-2">
                  <span>ℹ️</span>
                  <span>Information</span>
                </h2>
                <ul className="space-y-2 text-slate-700 leading-relaxed">
                  <li>• Vous commencez ComptaApp en cours d'année ? Cette rubrique vous permet d'intégrer votre historique.</li>
                  <li>• Ces données alimentent automatiquement vos rapports (TVA, compte de résultat, bilan).</li>
                  <li>• Choisissez UNE méthode ci-dessous (Option 1, 2 ou 3).</li>
                </ul>
              </div>

              {/* Encart Important */}
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6 mb-6">
                <h2 className="text-lg font-bold text-amber-900 mb-3 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>Important</span>
                </h2>
                <ul className="space-y-2 text-slate-700 leading-relaxed">
                  <li>• Cette rubrique ne remplace pas un conseil comptable/fiscal.</li>
                  <li>• Vous êtes responsable des montants saisis.</li>
                  <li>• Les montants saisis servent à démarrer votre suivi : ils ne constituent pas une comptabilité complète rétroactive.</li>
                </ul>
              </div>

              {/* Plan restriction banner for FREE users */}
              {isFree && (
                <div className="bg-gradient-to-r from-slate-100 to-slate-50 border-2 border-slate-300 rounded-xl p-6 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 text-3xl">🔒</div>
                    <div className="flex-1">
                      <h2 className="text-lg font-bold text-slate-900 mb-2">
                        Fonctionnalité réservée aux plans payants
                      </h2>
                      <p className="text-slate-700 mb-4">
                        La reprise d'historique est disponible à partir du plan Pro.
                        Les options 2 et 3 ci-dessous sont désactivées pour le plan Gratuit.
                      </p>
                      <button
                        onClick={() => navigate(`/app/company/${companyId}/subscription`)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
                      >
                        Voir les plans
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Configuration note */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-8">
                <p className="text-sm text-slate-700 leading-relaxed">
                  <strong>Note :</strong> À configurer une seule fois au démarrage (modifiable ensuite mais déconseillé).
                  Si vous changez de méthode, vos valeurs précédentes peuvent être remplacées.
                </p>
              </div>

              {/* Option 1 - Full Import (Info Only) */}
              <section className="mb-12 bg-green-50 border-2 border-green-200 rounded-xl p-6">
                <h2 className="text-2xl font-bold text-green-900 mb-4 flex items-center gap-2">
                  <span>✓</span>
                  <span>Option 1 — Import complet (recommandé)</span>
                </h2>
                <p className="text-slate-700 mb-3 leading-relaxed">
                  Saisissez toutes vos opérations depuis le début de l'année (dépenses et revenus).
                </p>
                <p className="text-slate-700 mb-4 leading-relaxed">
                  Aucune configuration spéciale : il suffit d'ajouter les écritures dans Dépenses et Revenus.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => navigate(`/app/company/${companyId}/expenses`)}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
                  >
                    → Aller aux Dépenses
                  </button>
                  <button
                    onClick={() => navigate(`/app/company/${companyId}/revenues`)}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
                  >
                    → Aller aux Revenus
                  </button>
                </div>
              </section>

              {/* Option 2 - Opening Entry */}
              <section className="mb-12">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-gray-200 pb-3">
                  Option 2 — Reprise d'ouverture (soldes à la date d'entrée)
                </h2>
                <p className="text-slate-600 mb-6">
                  Enregistrez les soldes au moment de votre abonnement (trésorerie, créances, dettes, TVA).
                </p>

                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 ${isFree ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date de reprise
                    </label>
                    <input
                      type="date"
                      value={openingEntry.date_reprise}
                      onChange={(e) => setOpeningEntry({ ...openingEntry, date_reprise: e.target.value })}
                      disabled={isFree}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Trésorerie (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={openingEntry.tresorerie}
                      onChange={(e) => setOpeningEntry({ ...openingEntry, tresorerie: e.target.value })}
                      disabled={isFree}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Créances clients (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={openingEntry.creances_clients}
                      onChange={(e) => setOpeningEntry({ ...openingEntry, creances_clients: e.target.value })}
                      disabled={isFree}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Dettes fournisseurs (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={openingEntry.dettes_fournisseurs}
                      onChange={(e) => setOpeningEntry({ ...openingEntry, dettes_fournisseurs: e.target.value })}
                      disabled={isFree}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Solde TVA (€, valeur positive)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={openingEntry.tva_solde}
                      onChange={(e) => setOpeningEntry({ ...openingEntry, tva_solde: e.target.value })}
                      disabled={isFree}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sens TVA
                    </label>
                    <select
                      value={openingEntry.tva_sens}
                      onChange={(e) => setOpeningEntry({ ...openingEntry, tva_sens: e.target.value as 'payer' | 'credit' })}
                      disabled={isFree}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    >
                      <option value="payer">À payer</option>
                      <option value="credit">Crédit de TVA</option>
                    </select>
                  </div>
                </div>

                <div className="relative inline-block">
                  <button
                    onClick={handleSaveOpeningEntry}
                    disabled={loading || isFree}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isFree ? 'Disponible à partir du plan Pro' : ''}
                  >
                    {openingEntry.id ? 'Mettre à jour' : 'Enregistrer'} la reprise d'ouverture
                  </button>
                  {isFree && (
                    <div className="mt-2 text-sm text-slate-600">
                      Disponible à partir du plan Pro
                    </div>
                  )}
                </div>
              </section>

              {/* Option 3 - Catchup Totals */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-gray-200 pb-3">
                  Option 3 — Rattrapage par totaux (par catégorie)
                </h2>
                <p className="text-slate-600 mb-6">
                  Saisissez des totaux par catégorie pour la période écoulée avant votre abonnement.
                </p>

                <div className={`bg-slate-50 rounded-xl p-6 mb-6 ${isFree ? 'opacity-50 pointer-events-none' : ''}`}>
                  <h3 className="font-semibold text-gray-900 mb-4">Ajouter une ligne de rattrapage</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Période du
                      </label>
                      <input
                        type="date"
                        value={periodFrom}
                        onChange={(e) => setPeriodFrom(e.target.value)}
                        disabled={isFree}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Période au
                      </label>
                      <input
                        type="date"
                        value={periodTo}
                        onChange={(e) => setPeriodTo(e.target.value)}
                        disabled={isFree}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Type
                      </label>
                      <select
                        value={categoryType}
                        onChange={(e) => {
                          setCategoryType(e.target.value as 'expense' | 'revenue');
                          setSelectedCategoryId('');
                        }}
                        disabled={isFree}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      >
                        <option value="expense">Dépense</option>
                        <option value="revenue">Revenu</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Catégorie
                      </label>
                      <select
                        value={selectedCategoryId}
                        onChange={(e) => setSelectedCategoryId(e.target.value)}
                        disabled={isFree}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      >
                        <option value="">-- Sélectionner --</option>
                        {currentCategories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Total HT (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={lineHT}
                        onChange={(e) => setLineHT(e.target.value)}
                        disabled={isFree}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Total TVA (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={lineTVA}
                        onChange={(e) => setLineTVA(e.target.value)}
                        disabled={isFree}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Total TTC (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={lineTTC}
                        onChange={(e) => setLineTTC(e.target.value)}
                        disabled={isFree}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      />
                    </div>
                  </div>

                  <div className="relative inline-block">
                    <button
                      onClick={handleAddCatchupLine}
                      disabled={loading || isFree}
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={isFree ? 'Disponible à partir du plan Pro' : ''}
                    >
                      Ajouter cette ligne
                    </button>
                    {isFree && (
                      <div className="mt-2 text-sm text-slate-600">
                        Disponible à partir du plan Pro
                      </div>
                    )}
                  </div>
                </div>

                {/* Display existing lines */}
                {catchupLines.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-semibold text-gray-900 mb-3">Lignes de rattrapage enregistrées</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Catégorie</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total HT</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total TVA</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total TTC</th>
                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {catchupLines.map(line => (
                            <tr key={line.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {line.category_type === 'expense' ? 'Dépense' : 'Revenu'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">{line.category_name}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                {parseFloat(line.total_ht).toFixed(2)} €
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                {parseFloat(line.total_tva).toFixed(2)} €
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                {parseFloat(line.total_ttc).toFixed(2)} €
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => handleDeleteCatchupLine(line.id)}
                                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                                >
                                  Supprimer
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
