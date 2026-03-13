import { useParams } from 'react-router-dom';
import BackButton from '../components/BackButton';

export default function UserGuidePage() {
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
          <BackButton to={`/app/company/${companyId}`} label="Retour au tableau de bord" />

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
              1. Prérequis avant utilisation
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
              <li>Votre entreprise doit être créée et les informations de base renseignées (nom, SIREN, adresse, etc.).</li>
              <li>Sélectionnez l'année de travail dans le menu déroulant en haut de l'écran.</li>
              <li>Vérifiez que les catégories de dépenses et revenus correspondent à votre activité.</li>
              <li>Assurez-vous que les taux de TVA configurés sont corrects pour votre entreprise.</li>
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
              2. Ordre recommandé d'utilisation
            </h2>
            <ol
              style={{
                margin: 0,
                paddingLeft: '24px',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              <li><strong>Paramètres de l'entreprise</strong> : vérifiez ou complétez les informations de votre société.</li>
              <li><strong>Sélection de l'année</strong> : choisissez l'année comptable sur laquelle vous souhaitez travailler.</li>
              <li><strong>Saisie des opérations</strong> : enregistrez vos dépenses et revenus au fur et à mesure.</li>
              <li><strong>Vérification des synthèses</strong> : consultez le compte de résultat, le bilan et la TVA pour détecter d'éventuelles anomalies.</li>
              <li><strong>Génération des PDF</strong> : une fois les données validées, générez les documents de synthèse.</li>
            </ol>
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
              3. Dépenses & Revenus (Saisie)
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
              <li><strong>Saisie au fil de l'eau</strong> : enregistrez vos opérations dès réception ou émission des documents.</li>
              <li><strong>Règles HT / TVA / TTC</strong> : l'application calcule automatiquement la TVA en fonction du montant saisi et du taux appliqué. Vérifiez toujours la cohérence entre HT, TVA et TTC.</li>
              <li><strong>Importance des catégories</strong> : chaque dépense ou revenu doit être affecté à une catégorie. Ces catégories déterminent la ventilation dans le compte de résultat, le bilan et la déclaration de TVA.</li>
              <li><strong>Modifications et suppressions</strong> : toute modification ou suppression d'une écriture impacte immédiatement les synthèses comptables. Veillez à vérifier les totaux après chaque changement.</li>
              <li><strong>Justificatifs</strong> : vous pouvez attacher des fichiers (factures, tickets) à chaque opération pour faciliter les vérifications ultérieures.</li>
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
              4. Compte de résultat (PDF)
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
              5. Bilan (PDF)
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
              6. TVA (PDF)
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
              7. Liasse fiscale simplifiée (PDF)
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
              8. Abonnements et Plans
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
              <li><strong>Où voir votre plan</strong> : rendez-vous dans Paramètres → Abonnement pour consulter votre plan actuel et les fonctionnalités disponibles.</li>
              <li><strong>Plan Gratuit (FREE)</strong> : permet de saisir jusqu'à 50 opérations. Les exports PDF et CSV ne sont pas disponibles.</li>
              <li><strong>Plan Pro (15€/mois)</strong> : opérations illimitées, exports PDF et CSV activés.</li>
              <li><strong>Plan Pro+ (30€/mois)</strong> : ajoute les rapports avancés, gestion multi-exercices et scan automatique des justificatifs (OCR).</li>
              <li><strong>Plan Pro++ (59€/mois)</strong> : accès complet avec assistant IA, module de facturation, gestion des AG et comptabilité en mode expert.</li>
              <li><strong>Upgrade / Downgrade</strong> : vous pouvez changer de plan à tout moment depuis la page Abonnement. Les changements prennent effet immédiatement.</li>
              <li><strong>Rappel important</strong> : quel que soit le plan choisi, ComptaApp reste un outil informatif et pédagogique. Il ne fournit aucun conseil fiscal, juridique ou comptable.</li>
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
              9. Factures (module Pro++)
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
              <li><strong>Accès au module</strong> : le module de facturation est disponible uniquement avec le plan Pro++. Accédez-y via le menu principal.</li>
              <li><strong>Créer une facture</strong> : cliquez sur "Nouvelle facture" pour créer un document. Vous pouvez ajouter un client existant ou en créer un nouveau (particulier ou entreprise).</li>
              <li><strong>Champs essentiels</strong> : date de facture, client, lignes de facturation (description, quantité, prix unitaire HT, taux de TVA), statut de paiement.</li>
              <li><strong>Calculs automatiques</strong> : l'application calcule automatiquement les totaux HT, TVA et TTC pour chaque ligne et pour l'ensemble de la facture.</li>
              <li><strong>Gestion des clients</strong> : enregistrez vos clients (nom, adresse, SIREN, numéro de TVA intracommunautaire) pour les retrouver facilement lors de la création de nouvelles factures.</li>
              <li><strong>Export PDF</strong> : générez un PDF professionnel de votre facture avec toutes les mentions légales nécessaires.</li>
              <li><strong>Suivi des paiements</strong> : marquez vos factures comme payées ou non payées et suivez votre chiffre d'affaires en temps réel.</li>
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
              10. Reprise d'historique
            </h2>
            <p
              style={{
                margin: '0 0 16px 0',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              La reprise d'historique permet d'intégrer vos données existantes lorsque vous commencez à utiliser ComptaApp en cours d'année.
            </p>
            <p
              style={{
                margin: '0 0 16px 0',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              Cette fonctionnalité sert à amorcer votre suivi comptable dans l'application. Les données saisies sont automatiquement prises en compte dans vos rapports (TVA, compte de résultat, bilan).
            </p>
            <p
              style={{
                margin: '0 0 12px 0',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
                fontWeight: '600',
              }}
            >
              Méthodes disponibles :
            </p>
            <ul
              style={{
                margin: '0 0 16px 0',
                paddingLeft: '24px',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              <li><strong>Option 1 — Import complet (recommandé)</strong> : Ajoutez simplement vos dépenses et revenus depuis le début de l'année. Aucune configuration spécifique n'est requise.</li>
              <li><strong>Option 2 — Reprise d'ouverture</strong> : Saisissez vos soldes au moment de votre abonnement (trésorerie, créances, dettes, TVA).</li>
              <li><strong>Option 3 — Rattrapage par totaux</strong> : Saisissez des montants globaux par catégorie pour la période écoulée.</li>
            </ul>
            <p
              style={{
                margin: '0 0 12px 0',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
                fontWeight: '600',
              }}
            >
              Bonnes pratiques :
            </p>
            <ul
              style={{
                margin: '0 0 16px 0',
                paddingLeft: '24px',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              <li>Choisissez une seule méthode.</li>
              <li>L'option 1 est recommandée dans la majorité des cas.</li>
              <li>Changer de méthode peut modifier les données précédentes.</li>
            </ul>
            <p
              style={{
                margin: '0 0 12px 0',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
                fontWeight: '600',
              }}
            >
              Limitations par abonnement :
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: '24px',
                color: '#374151',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              <li>Plan Gratuit : seule l'option 1 est accessible.</li>
              <li>Plans Pro et supérieurs : toutes les options sont disponibles.</li>
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
              11. Bon réflexe : vérifications essentielles
            </h2>
            <div
              style={{
                padding: '20px',
                backgroundColor: '#f0f9ff',
                borderRadius: '8px',
                borderLeft: '4px solid #3b82f6',
              }}
            >
              <p
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '15px',
                  color: '#1e40af',
                  lineHeight: '1.7',
                  fontWeight: '600',
                }}
              >
                Avant toute opération importante, prenez le réflexe de vérifier :
              </p>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: '20px',
                  color: '#1e3a8a',
                  fontSize: '15px',
                  lineHeight: '1.8',
                }}
              >
                <li>L'année sélectionnée dans le menu déroulant en haut de l'écran</li>
                <li>Les catégories affectées à vos opérations (impact sur le compte de résultat et le bilan)</li>
                <li>Les taux de TVA appliqués (un taux incorrect fausse toute la déclaration)</li>
                <li>Avant de générer un PDF : contrôlez la cohérence de la TVA et vérifiez que le bilan est équilibré (Actif = Passif)</li>
              </ul>
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
              12. Contrôles à effectuer avant génération des PDF
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
              <li><strong>Année correcte</strong> : vérifiez que vous avez bien sélectionné la bonne année avant de générer vos documents.</li>
              <li><strong>Données présentes</strong> : assurez-vous que toutes vos dépenses et revenus de la période ont été saisis.</li>
              <li><strong>TVA cohérente</strong> : vérifiez que les montants de TVA collectée et déductible correspondent à vos attentes.</li>
              <li><strong>Bilan équilibré</strong> : contrôlez que le total de l'actif est égal au total du passif. Un déséquilibre indique une erreur de saisie ou de paramétrage.</li>
              <li><strong>Catégories correctes</strong> : vérifiez que chaque opération est bien affectée à la bonne catégorie comptable.</li>
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
              13. Limitations de l'outil
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
              <li><strong>Outil d'aide à la gestion uniquement</strong> : ComptaApp vous aide à suivre vos dépenses et revenus, mais ne remplace pas un logiciel de comptabilité certifié.</li>
              <li><strong>Pas de télédéclaration</strong> : l'outil ne permet pas de transmettre directement vos déclarations aux administrations fiscales.</li>
              <li><strong>Pas de conseil fiscal, juridique ou comptable</strong> : ComptaApp ne fournit aucune consultation ni validation de vos choix fiscaux ou comptables.</li>
              <li><strong>Responsabilité de l'utilisateur</strong> : vous restez responsable de l'exactitude des données saisies et de leur conformité avec la réglementation en vigueur.</li>
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
              14. Problèmes fréquents
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
              <li><strong>Résultats à zéro</strong> : vérifiez que vous avez sélectionné la bonne année et que des opérations ont bien été saisies pour cette période.</li>
              <li><strong>TVA incorrecte</strong> : contrôlez les taux de TVA appliqués sur chaque opération. Un taux incorrect fausse l'ensemble de la déclaration.</li>
              <li><strong>Bilan déséquilibré</strong> : si l'actif ne correspond pas au passif, revérifiez vos catégories de dépenses et revenus, ainsi que les éventuelles écritures de capital ou d'apport.</li>
              <li><strong>Année mal sélectionnée</strong> : si vos totaux semblent anormaux, vérifiez que le menu déroulant de sélection de l'année affiche bien la période souhaitée.</li>
              <li><strong>Documents PDF vides ou incomplets</strong> : assurez-vous d'avoir saisi au moins une opération pour la période concernée avant de générer un document.</li>
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
              15. Avertissement important
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
        </div>
      </div>
    </div>
  );
}
