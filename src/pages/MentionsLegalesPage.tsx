import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

export default function MentionsLegalesPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 flex-1">
        <div className="mb-6">
          <Link to="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Retour à l'accueil
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Mentions légales</h1>

          <div className="prose prose-gray max-w-none space-y-4 text-gray-700">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Éditeur</h2>
              <p>SHOPTOO (société basée aux Émirats Arabes Unis)</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Contact</h2>
              <p>[à compléter]</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Hébergement</h2>
              <p>Supabase</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Responsabilité</h2>
              <p>L'éditeur met à disposition un logiciel SaaS. L'utilisateur reste seul responsable de l'usage, des données saisies et des déclarations réalisées.</p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
