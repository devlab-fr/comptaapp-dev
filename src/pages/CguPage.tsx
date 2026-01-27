import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

export default function CguPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 flex-1">
        <div className="mb-6">
          <Link to="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Retour à l'accueil
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Conditions Générales d'Utilisation (CGU)</h1>

          <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Accès à l'application</h2>
              <p>ComptaApp est une application SaaS accessible en ligne. L'utilisateur doit créer un compte pour accéder aux fonctionnalités de l'application.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Création de compte</h2>
              <p>L'utilisateur doit fournir des informations exactes lors de la création de son compte. Il est responsable de la confidentialité de ses identifiants de connexion.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Utilisation des fonctionnalités</h2>
              <p>L'utilisateur s'engage à utiliser l'application de manière conforme à sa destination et aux lois en vigueur. Les fonctionnalités disponibles dépendent du plan d'abonnement souscrit.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Limites de responsabilité</h2>
              <p>L'éditeur met à disposition un outil de gestion comptable. L'utilisateur reste seul responsable de l'exactitude des données saisies, de leur conformité légale et des déclarations effectuées auprès des administrations.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Suspension / clôture</h2>
              <p>L'éditeur se réserve le droit de suspendre ou de clôturer un compte en cas de non-respect des présentes conditions ou de non-paiement des abonnements souscrits.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Sécurité & disponibilité</h2>
              <p>L'éditeur met en œuvre les moyens nécessaires pour assurer la sécurité et la disponibilité de l'application. Toutefois, aucune garantie absolue ne peut être fournie concernant l'absence d'interruption ou de dysfonctionnement.</p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
