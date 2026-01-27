import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

export default function CgvPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 flex-1">
        <div className="mb-6">
          <Link to="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Retour à l'accueil
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Conditions Générales de Vente (CGV)</h1>

          <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Abonnements</h2>
              <p>ComptaApp propose plusieurs formules d'abonnement :</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li><strong>FREE</strong> : Accès gratuit avec fonctionnalités limitées</li>
                <li><strong>PRO</strong> : Abonnement mensuel avec fonctionnalités avancées</li>
                <li><strong>PRO+</strong> : Abonnement mensuel avec fonctionnalités étendues</li>
                <li><strong>PRO++</strong> : Abonnement mensuel avec toutes les fonctionnalités</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Paiement via Stripe</h2>
              <p>Les paiements sont traités de manière sécurisée via Stripe. L'utilisateur doit fournir des informations de paiement valides pour souscrire à un abonnement payant.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Renouvellement</h2>
              <p>Les abonnements sont renouvelés automatiquement chaque mois jusqu'à résiliation par l'utilisateur. Le montant de l'abonnement est prélevé automatiquement à chaque échéance.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Résiliation</h2>
              <p>L'utilisateur peut résilier son abonnement à tout moment depuis son espace personnel. La résiliation prend effet à la fin de la période en cours, sans remboursement au prorata.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Absence de remboursement abusif</h2>
              <p>Aucun remboursement ne sera effectué en cas de résiliation en cours de période d'abonnement. L'utilisateur conserve l'accès aux fonctionnalités jusqu'à la fin de la période payée.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Évolution des prix</h2>
              <p>L'éditeur se réserve le droit de modifier les tarifs des abonnements. Les utilisateurs existants seront informés au moins 30 jours avant l'application de nouveaux tarifs.</p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
