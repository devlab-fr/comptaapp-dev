import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';

interface VerificationData {
  totalExpensesHT: number;
  totalExpensesTVA: number;
  totalExpensesTTC: number;
  totalRevenuesHT: number;
  totalRevenuesTVA: number;
  totalRevenuesTTC: number;
  resultat: number;
  tvaCollectee: number;
  tvaDeductible: number;
  tvaSolde: number;
  actif: number;
  passif: number;
  bilanEquilibre: boolean;
}

export default function VerificationV1Page() {
  const { companyId } = useParams<{ companyId: string }>();
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!companyId) return;

      const { data: expenseDocs } = await supabase
        .from('expense_documents')
        .select('total_excl_vat, total_vat, total_incl_vat')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid')
        .eq('is_test', false);

      const { data: revenueDocs } = await supabase
        .from('revenue_documents')
        .select('total_excl_vat, total_vat, total_incl_vat')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .eq('payment_status', 'paid')
        .eq('is_test', false);

      const totalExpensesHT = expenseDocs?.reduce((acc, doc) => acc + (Number(doc.total_excl_vat) || 0), 0) || 0;
      const totalExpensesTVA = expenseDocs?.reduce((acc, doc) => acc + (Number(doc.total_vat) || 0), 0) || 0;
      const totalExpensesTTC = expenseDocs?.reduce((acc, doc) => acc + (Number(doc.total_incl_vat) || 0), 0) || 0;

      const totalRevenuesHT = revenueDocs?.reduce((acc, doc) => acc + (Number(doc.total_excl_vat) || 0), 0) || 0;
      const totalRevenuesTVA = revenueDocs?.reduce((acc, doc) => acc + (Number(doc.total_vat) || 0), 0) || 0;
      const totalRevenuesTTC = revenueDocs?.reduce((acc, doc) => acc + (Number(doc.total_incl_vat) || 0), 0) || 0;

      const resultat = Math.round((totalRevenuesHT - totalExpensesHT) * 100) / 100;
      const tvaCollectee = Math.round(totalRevenuesTVA * 100) / 100;
      const tvaDeductible = Math.round(totalExpensesTVA * 100) / 100;
      const tvaSolde = Math.round((tvaCollectee - tvaDeductible) * 100) / 100;

      const actif = Math.round(totalExpensesHT * 100) / 100;
      const passif = Math.round(totalRevenuesHT * 100) / 100;
      const bilanEquilibre = Math.abs(actif - passif) < 0.01;

      setData({
        totalExpensesHT: Math.round(totalExpensesHT * 100) / 100,
        totalExpensesTVA: Math.round(totalExpensesTVA * 100) / 100,
        totalExpensesTTC: Math.round(totalExpensesTTC * 100) / 100,
        totalRevenuesHT: Math.round(totalRevenuesHT * 100) / 100,
        totalRevenuesTVA: Math.round(totalRevenuesTVA * 100) / 100,
        totalRevenuesTTC: Math.round(totalRevenuesTTC * 100) / 100,
        resultat,
        tvaCollectee,
        tvaDeductible,
        tvaSolde,
        actif,
        passif,
        bilanEquilibre,
      });

      setLoading(false);
    };

    loadData();
  }, [companyId]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', color: 'white', fontSize: '18px' }}>
          Chargement...
        </div>
      </div>
    );
  }

  if (!data) return null;

  const tvaCoherente = Math.abs(data.tvaCollectee - data.totalRevenuesTVA) < 0.01 && Math.abs(data.tvaDeductible - data.totalExpensesTVA) < 0.01;
  const resultatCoherent = Math.abs(data.resultat - (data.totalRevenuesHT - data.totalExpensesHT)) < 0.01;
  const allCoherent = tvaCoherente && resultatCoherent && data.bilanEquilibre;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          backgroundColor: 'white',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          padding: '40px',
        }}
      >
        <div style={{ marginBottom: '32px' }}>
          <BackButton to={`/app/company/${companyId}`} label="Retour au Dashboard" />

          <h1
            style={{
              margin: '0 0 12px 0',
              fontSize: '32px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}
          >
            Vérification V1
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '16px',
              color: '#6b7280',
              lineHeight: '1.6',
            }}
          >
            Contrôle de cohérence des données comptables
          </p>
        </div>

        <div
          style={{
            padding: '24px',
            backgroundColor: allCoherent ? '#d1fae5' : '#fed7aa',
            borderRadius: '12px',
            borderLeft: `4px solid ${allCoherent ? '#059669' : '#f97316'}`,
            marginBottom: '32px',
          }}
        >
          <h3
            style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: allCoherent ? '#065f46' : '#9a3412',
            }}
          >
            {allCoherent ? '✓ Vérification réussie' : '⚠ Attention'}
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: '14px',
              color: allCoherent ? '#065f46' : '#9a3412',
              lineHeight: '1.6',
            }}
          >
            {allCoherent
              ? 'Tous les calculs sont cohérents. Les données sont prêtes pour la génération de documents.'
              : 'Certains calculs nécessitent une vérification. Consultez les détails ci-dessous.'}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          <div
            style={{
              padding: '24px',
              backgroundColor: '#fef2f2',
              borderRadius: '12px',
              border: '2px solid #fecaca',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#dc2626',
              }}
            >
              Dépenses
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                  Total HT
                </p>
                <p style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a1a1a' }}>
                  {data.totalExpensesHT.toFixed(2)} €
                </p>
              </div>
              <div>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                  TVA Déductible
                </p>
                <p style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a1a1a' }}>
                  {data.totalExpensesTVA.toFixed(2)} €
                </p>
              </div>
              <div>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                  Total TTC
                </p>
                <p style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a1a1a' }}>
                  {data.totalExpensesTTC.toFixed(2)} €
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '24px',
              backgroundColor: '#ecfdf5',
              borderRadius: '12px',
              border: '2px solid #a7f3d0',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#059669',
              }}
            >
              Revenus
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                  Total HT
                </p>
                <p style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a1a1a' }}>
                  {data.totalRevenuesHT.toFixed(2)} €
                </p>
              </div>
              <div>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                  TVA Collectée
                </p>
                <p style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a1a1a' }}>
                  {data.totalRevenuesTVA.toFixed(2)} €
                </p>
              </div>
              <div>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                  Total TTC
                </p>
                <p style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a1a1a' }}>
                  {data.totalRevenuesTTC.toFixed(2)} €
                </p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          <div
            style={{
              padding: '24px',
              backgroundColor: '#f0f9ff',
              borderRadius: '12px',
              border: '2px solid #bae6fd',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#0369a1',
              }}
            >
              Résultat de l'exercice
            </h3>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: data.resultat >= 0 ? '#059669' : '#dc2626' }}>
              {data.resultat >= 0 ? '+' : ''}{data.resultat.toFixed(2)} €
            </p>
            <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#6b7280' }}>
              {data.resultat >= 0 ? 'Bénéfice' : 'Perte'}
            </p>
          </div>

          <div
            style={{
              padding: '24px',
              backgroundColor: '#fef3c7',
              borderRadius: '12px',
              border: '2px solid #fde68a',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#92400e',
              }}
            >
              TVA
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Collectée:</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>{data.tvaCollectee.toFixed(2)} €</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Déductible:</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>{data.tvaDeductible.toFixed(2)} €</span>
              </div>
              <div style={{ borderTop: '2px solid #fde68a', paddingTop: '8px', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#92400e' }}>Solde:</span>
                <span style={{ fontSize: '18px', fontWeight: '700', color: data.tvaSolde >= 0 ? '#dc2626' : '#059669' }}>
                  {data.tvaSolde >= 0 ? '+' : ''}{data.tvaSolde.toFixed(2)} €
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#78350f' }}>
                {data.tvaSolde >= 0 ? 'À payer' : 'Crédit de TVA'}
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '24px',
            backgroundColor: '#f5f3ff',
            borderRadius: '12px',
            border: '2px solid #ddd6fe',
          }}
        >
          <h3
            style={{
              margin: '0 0 16px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#7c3aed',
            }}
          >
            Bilan (simplifié)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                Actif
              </p>
              <p style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a1a1a' }}>
                {data.actif.toFixed(2)} €
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                Passif
              </p>
              <p style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a1a1a' }}>
                {data.passif.toFixed(2)} €
              </p>
            </div>
          </div>
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: data.bilanEquilibre ? '#d1fae5' : '#fed7aa',
              borderRadius: '8px',
            }}
          >
            <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: data.bilanEquilibre ? '#065f46' : '#9a3412' }}>
              Statut: {data.bilanEquilibre ? '✓ Équilibré' : '⚠ Non équilibré'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
