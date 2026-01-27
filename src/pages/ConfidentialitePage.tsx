import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 flex-1">
        <div className="mb-6">
          <Link to="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Retour à l'accueil
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Politique de confidentialité (RGPD)</h1>

          <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Données comptables sensibles</h2>
              <p>ComptaApp traite des données comptables qui peuvent contenir des informations sensibles sur votre activité professionnelle. Nous nous engageons à protéger ces données avec le plus haut niveau de sécurité.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Aucune revente</h2>
              <p>Vos données ne sont jamais vendues, louées ou partagées avec des tiers à des fins commerciales. Elles sont uniquement utilisées pour le fonctionnement de l'application et l'amélioration de nos services.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Hébergement sécurisé</h2>
              <p>Les données sont hébergées sur Supabase, une plateforme sécurisée qui respecte les normes internationales de sécurité et de confidentialité. Toutes les données sont chiffrées en transit et au repos.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Droits des utilisateurs</h2>
              <p>Conformément au RGPD, vous disposez des droits suivants concernant vos données personnelles :</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li><strong>Droit d'accès</strong> : Vous pouvez demander une copie de toutes vos données</li>
                <li><strong>Droit de rectification</strong> : Vous pouvez modifier vos données à tout moment</li>
                <li><strong>Droit à l'effacement</strong> : Vous pouvez demander la suppression complète de vos données</li>
                <li><strong>Droit à la portabilité</strong> : Vous pouvez exporter vos données dans un format standard</li>
                <li><strong>Droit d'opposition</strong> : Vous pouvez vous opposer au traitement de vos données</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Contact RGPD</h2>
              <p>Pour toute question concernant la protection de vos données ou pour exercer vos droits, vous pouvez nous contacter à : [à compléter]</p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
