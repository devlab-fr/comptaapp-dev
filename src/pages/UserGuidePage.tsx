import { useNavigate, useParams } from 'react-router-dom';

export default function UserGuidePage() {
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();

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
          maxWidth: '900px',
          margin: '0 auto',
          backgroundColor: 'white',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          padding: '40px',
        }}
      >
        <div style={{ marginBottom: '32px' }}>
          <button
            onClick={() => navigate(`/app/company/${companyId}`)}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#667eea',
              backgroundColor: 'white',
              border: '2px solid #667eea',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              marginBottom: '24px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f3ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
            }}
          >
            ← Retour au Dashboard
          </button>

          <h1
            style={{
              margin: '0 0 12px 0',
              fontSize: '32px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}
          >
            Mode d'utilisation – V1
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '16px',
              color: '#6b7280',
              lineHeight: '1.6',
            }}
          >
            Guide rapide pour utiliser ComptaApp (version V1)
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <section>
            <h2
              style={{
                margin: '0 0 16px 0',
                fontSize: '22px',
                fontWeight: '600',
                color: '#1a1a1a',
                borderBottom: '2px solid #e5e7eb',
                paddingBottom: '8px',
              }}
            >
              1. Démarrage
            </h2>
            <ul
              style={{
                margin: 0,
                paddingLeft: '24px',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              <li>Connectez-vous puis sélectionnez l'année de travail (menu Année en haut).</li>
              <li>Ajoutez vos dépenses et revenus dans les écrans dédiés.</li>
              <li>Vérifiez vos synthèses (Compte de résultat, Bilan, TVA) puis générez vos PDF.</li>
            </ul>
          </section>

          <section>
            <h2
              style={{
                margin: '0 0 16px 0',
                fontSize: '22px',
                fontWeight: '600',
                color: '#1a1a1a',
                borderBottom: '2px solid #e5e7eb',
                paddingBottom: '8px',
              }}
            >
              2. Dépenses & Revenus (Saisie)
            </h2>
            <ul
              style={{
                margin: 0,
                paddingLeft: '24px',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              <li>Saisissez vos opérations au fil de l'eau.</li>
              <li>Les montants sont gérés en HT/TVA/TTC selon le mode de saisie prévu par l'application.</li>
              <li>Les catégories servent à ventiler automatiquement vos états (compte de résultat, TVA, bilan).</li>
            </ul>
          </section>

          <section>
            <h2
              style={{
                margin: '0 0 16px 0',
                fontSize: '22px',
                fontWeight: '600',
                color: '#1a1a1a',
                borderBottom: '2px solid #e5e7eb',
                paddingBottom: '8px',
              }}
            >
              3. Compte de résultat (PDF)
            </h2>
            <ul
              style={{
                margin: 0,
                paddingLeft: '24px',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              <li>Compte de résultat simplifié : totaux Produits / Charges / Résultat.</li>
              <li>Compte de résultat détaillé : ventilation par catégories.</li>
              <li>Boutons disponibles : 'Générer Compte de Résultat (simplifié)' et 'Générer Compte de Résultat (détaillé)'.</li>
            </ul>
          </section>

          <section>
            <h2
              style={{
                margin: '0 0 16px 0',
                fontSize: '22px',
                fontWeight: '600',
                color: '#1a1a1a',
                borderBottom: '2px solid #e5e7eb',
                paddingBottom: '8px',
              }}
            >
              4. Bilan (PDF)
            </h2>
            <ul
              style={{
                margin: 0,
                paddingLeft: '24px',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              <li>Bilan simplifié : Actif (immobilisé, circulant, trésorerie) et Passif (capitaux propres, dettes).</li>
              <li>Contrôle de cohérence : Total Actif = Total Passif.</li>
            </ul>
          </section>

          <section>
            <h2
              style={{
                margin: '0 0 16px 0',
                fontSize: '22px',
                fontWeight: '600',
                color: '#1a1a1a',
                borderBottom: '2px solid #e5e7eb',
                paddingBottom: '8px',
              }}
            >
              5. TVA (PDF)
            </h2>
            <ul
              style={{
                margin: 0,
                paddingLeft: '24px',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              <li>Synthèse TVA annuelle : TVA collectée, TVA déductible, solde (à payer / crédit).</li>
              <li>Bouton : 'Générer TVA (annuelle)'.</li>
            </ul>
          </section>

          <section>
            <h2
              style={{
                margin: '0 0 16px 0',
                fontSize: '22px',
                fontWeight: '600',
                color: '#1a1a1a',
                borderBottom: '2px solid #e5e7eb',
                paddingBottom: '8px',
              }}
            >
              6. Liasse fiscale simplifiée (PDF)
            </h2>
            <ul
              style={{
                margin: 0,
                paddingLeft: '24px',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              <li>Document de synthèse : page de garde + synthèse compte de résultat + synthèse bilan + contrôles.</li>
              <li>Bouton : 'Générer Liasse fiscale (simplifiée)'.</li>
            </ul>
          </section>

          <section>
            <h2
              style={{
                margin: '0 0 16px 0',
                fontSize: '22px',
                fontWeight: '600',
                color: '#1a1a1a',
                borderBottom: '2px solid #e5e7eb',
                paddingBottom: '8px',
              }}
            >
              7. Important
            </h2>
            <div
              style={{
                padding: '20px',
                backgroundColor: '#fef9e7',
                borderRadius: '8px',
                borderLeft: '4px solid #f59e0b',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '15px',
                  color: '#92400e',
                  lineHeight: '1.7',
                }}
              >
                <strong>⚠ Avertissement :</strong> Ces documents sont générés automatiquement à titre informatif. Outil d'aide à la gestion uniquement. Consultez votre expert-comptable pour tout usage fiscal ou juridique.
              </p>
            </div>
          </section>

          <section>
            <h2
              style={{
                margin: '0 0 16px 0',
                fontSize: '22px',
                fontWeight: '600',
                color: '#1a1a1a',
                borderBottom: '2px solid #e5e7eb',
                paddingBottom: '8px',
              }}
            >
              8. Support
            </h2>
            <ul
              style={{
                margin: 0,
                paddingLeft: '24px',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              <li>En cas d'écart ou de résultat inattendu : vérifiez l'année sélectionnée et la présence d'écritures (dépenses/revenus).</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
