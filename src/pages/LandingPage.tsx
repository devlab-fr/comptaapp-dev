import { Link } from 'react-router-dom';
import { logoUrl } from '../lib/logoUrl';
import { useEffect, useRef, useState } from 'react';

export default function LandingPage() {
  const [heroVisible, setHeroVisible] = useState(false);
  const sectionsRef = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    setHeroVisible(true);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-in-up');
          }
        });
      },
      { threshold: 0.1 }
    );

    sectionsRef.current.forEach((section) => {
      if (section) observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <img src={logoUrl} alt="ComptaApp Logo" className="h-14 w-auto" />
              <span className="text-xl font-semibold text-gray-900">ComptaApp</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/login"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Connexion
              </Link>
              <Link
                to="/app"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Essayer gratuitement
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className={`text-5xl sm:text-6xl font-bold text-gray-900 mb-6 transition-all duration-800 ease-out ${heroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
            Gérez votre comptabilité simplement,
            <br />
            <span className="text-blue-600">sans complexité</span>
          </h1>
          <p className={`text-xl text-gray-600 mb-8 max-w-3xl mx-auto transition-all duration-800 delay-150 ease-out ${heroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
            ComptaApp automatise vos dépenses, TVA et factures en quelques clics.
          </p>
          <div className={`flex flex-col sm:flex-row gap-4 justify-center transition-all duration-800 delay-300 ease-out ${heroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
            <Link
              to="/app"
              className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Essayer gratuitement
            </Link>
            <a
              href="#features"
              className="bg-white text-gray-700 px-8 py-4 rounded-lg text-lg font-semibold border-2 border-gray-200 hover:border-gray-300 transition-colors"
            >
              Découvrir les fonctionnalités
            </a>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section ref={(el) => sectionsRef.current.push(el)} className="py-20 bg-gray-50 px-4 sm:px-6 lg:px-8 opacity-0 translate-y-16 transition-all duration-800 ease-out">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              La comptabilité traditionnelle, c'est compliqué
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Entre les logiciels complexes, les experts-comptables coûteux et les déclarations chronophages, gérer sa comptabilité devient un casse-tête.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-xl">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">💸</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Coûts élevés
              </h3>
              <p className="text-gray-600">
                Les experts-comptables facturent plusieurs centaines d'euros par mois pour des tâches simples.
              </p>
            </div>
            <div className="bg-white p-8 rounded-xl">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">⏱️</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Perte de temps
              </h3>
              <p className="text-gray-600">
                Saisir manuellement chaque opération, chercher des justificatifs, préparer les déclarations...
              </p>
            </div>
            <div className="bg-white p-8 rounded-xl">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">😵</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Complexité
              </h3>
              <p className="text-gray-600">
                Les logiciels comptables existants sont conçus pour des professionnels, pas pour vous.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section ref={(el) => sectionsRef.current.push(el)} className="py-20 px-4 sm:px-6 lg:px-8 opacity-0 translate-y-16 transition-all duration-800 ease-out">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Une solution pensée pour vous
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              ComptaApp automatise votre comptabilité et vous fait gagner du temps et de l'argent.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">✓</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Saisie simplifiée
                    </h3>
                    <p className="text-gray-600">
                      Enregistrez vos dépenses et recettes en quelques clics. Importez vos relevés bancaires automatiquement.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">✓</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      TVA automatique
                    </h3>
                    <p className="text-gray-600">
                      Calculez votre TVA automatiquement et générez vos déclarations en un clic.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">✓</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Factures professionnelles
                    </h3>
                    <p className="text-gray-600">
                      Créez et envoyez des factures conformes à la loi en quelques secondes.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">✓</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Rapports en temps réel
                    </h3>
                    <p className="text-gray-600">
                      Suivez votre bilan, compte de résultat et trésorerie en direct.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 h-96 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <svg className="w-32 h-32 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-sm">Illustration</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section ref={(el) => sectionsRef.current.push(el)} id="features" className="py-20 bg-gray-50 px-4 sm:px-6 lg:px-8 opacity-0 translate-y-16 transition-all duration-800 ease-out">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Toutes les fonctionnalités dont vous avez besoin
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Une solution simple pour gérer votre comptabilité efficacement.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">📊</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Dépenses et recettes
              </h3>
              <p className="text-gray-600">
                Enregistrez toutes vos opérations avec leurs justificatifs et catégories.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🧾</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Facturation
              </h3>
              <p className="text-gray-600">
                Créez des factures professionnelles conformes et suivez leur paiement.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">📈</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Déclarations TVA
              </h3>
              <p className="text-gray-600">
                Générez vos déclarations de TVA automatiquement avec tous les calculs.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">💰</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Trésorerie
              </h3>
              <p className="text-gray-600">
                Suivez vos flux de trésorerie et synchronisez vos comptes bancaires.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">📑</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Bilan et résultats
              </h3>
              <p className="text-gray-600">
                Consultez votre bilan comptable et compte de résultat en temps réel.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🤖</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Assistant IA
              </h3>
              <p className="text-gray-600">
                Scannez vos tickets et reçus automatiquement avec l'intelligence artificielle.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section ref={(el) => sectionsRef.current.push(el)} className="py-20 bg-gray-50 px-4 sm:px-6 lg:px-8 opacity-0 translate-y-16 transition-all duration-800 ease-out">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-12 text-center">
            Pourquoi choisir ComptaApp ?
          </h2>
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="bg-white rounded-xl p-8 shadow-sm border-2 border-gray-200">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  Expert-comptable
                </h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold text-gray-900">À partir de 200€</span>
                  <span className="text-gray-600">/mois</span>
                </div>
                <p className="text-gray-600">
                  Solution traditionnelle avec des coûts élevés et une dépendance constante
                </p>
              </div>
            </div>
            <div className="bg-blue-600 rounded-xl p-8 shadow-lg border-2 border-blue-700">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-white mb-3">
                  ComptaApp
                </h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold text-white">À partir de 15€</span>
                  <span className="text-blue-100">/mois</span>
                </div>
                <p className="text-blue-50">
                  Automatisation complète pour une gestion autonome et économique
                </p>
              </div>
            </div>
          </div>
          <p className="text-xl text-gray-600 text-center max-w-2xl mx-auto">
            Une solution simple et accessible pour gérer votre comptabilité sans complexité.
          </p>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Tarifs simples et transparents
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Choisissez le plan adapté à vos besoins. Sans engagement.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 transition-all duration-300 ease-out hover:scale-[1.05] hover:shadow-2xl hover:border-gray-300">
              <h3 className="text-2xl font-bold text-gray-900 mb-1">Gratuit</h3>
              <p className="text-sm text-gray-500 mb-4">Pour découvrir</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">0€</span>
                <span className="text-gray-600">/mois</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 flex-shrink-0">✓</span>
                  <span className="text-gray-600">50 transactions/mois</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 flex-shrink-0">✓</span>
                  <span className="text-gray-600">Trésorerie simple</span>
                </li>
              </ul>
              <Link
                to="/app"
                className="block w-full text-center bg-gray-100 text-gray-900 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Créer mon compte gratuit
              </Link>
            </div>

            <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 transition-all duration-300 ease-out hover:scale-[1.05] hover:shadow-2xl hover:border-gray-300">
              <h3 className="text-2xl font-bold text-gray-900 mb-1">Pro</h3>
              <p className="text-sm text-gray-500 mb-4">Idéal pour indépendants</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">15€</span>
                <span className="text-gray-600">/mois</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 flex-shrink-0">✓</span>
                  <span className="text-gray-600">Création de factures</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 flex-shrink-0">✓</span>
                  <span className="text-gray-600">Dépenses & recettes</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 flex-shrink-0">✓</span>
                  <span className="text-gray-600">Export comptable</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 flex-shrink-0">✓</span>
                  <span className="text-gray-600">TVA simplifiée</span>
                </li>
              </ul>
              <Link
                to="/app"
                className="block w-full text-center bg-gray-100 text-gray-900 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Découvrir
              </Link>
            </div>

            <div className="bg-blue-600 text-white rounded-2xl p-8 relative shadow-xl transition-all duration-300 ease-out hover:scale-[1.05] hover:shadow-[0_20px_50px_rgba(37,99,235,0.3)]">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow-400 text-gray-900 px-4 py-1 rounded-full text-sm font-semibold">
                Le plus choisi
              </div>
              <h3 className="text-2xl font-bold mb-1">Pro+</h3>
              <p className="text-sm text-blue-100 mb-4">Le plus choisi</p>
              <div className="mb-6">
                <span className="text-4xl font-bold">30€</span>
                <span className="text-blue-100">/mois</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0">✓</span>
                  <span>Tout Pro</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0">✓</span>
                  <span>Rapports avancés</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0">✓</span>
                  <span>Scan automatique (OCR)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0">✓</span>
                  <span>Import bancaire</span>
                </li>
              </ul>
              <Link
                to="/app"
                className="block w-full text-center bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              >
                Découvrir
              </Link>
            </div>

            <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 transition-all duration-300 ease-out hover:scale-[1.05] hover:shadow-2xl hover:border-gray-300">
              <h3 className="text-2xl font-bold text-gray-900 mb-1">Pro++</h3>
              <p className="text-sm text-gray-500 mb-4">Pour gestion avancée</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">59€</span>
                <span className="text-gray-600">/mois</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 flex-shrink-0">✓</span>
                  <span className="text-gray-600">Tout Pro+</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 flex-shrink-0">✓</span>
                  <span className="text-gray-600">Assistant IA</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-600 flex-shrink-0">✓</span>
                  <span className="text-gray-600">Documents officiels AG</span>
                </li>
              </ul>
              <Link
                to="/app"
                className="block w-full text-center bg-gray-100 text-gray-900 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Découvrir
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Créez votre compte en 30 secondes — Gratuit
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Rejoignez des centaines d'entrepreneurs qui gèrent leur comptabilité en toute autonomie.
          </p>
          <Link
            to="/app"
            className="inline-block bg-white text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            Essayer gratuitement
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src={logoUrl} alt="ComptaApp Logo" className="h-8 w-auto" />
                <span className="text-lg font-semibold text-white">ComptaApp</span>
              </div>
              <p className="text-sm">
                La comptabilité simplifiée pour les entrepreneurs.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Produit</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Fonctionnalités</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Tarifs</a></li>
                <li><Link to="/app" className="hover:text-white transition-colors">Application</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Ressources</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/app/guide" className="hover:text-white transition-colors">Guide utilisateur</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Légal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/legal/mentions-legales" className="hover:text-white transition-colors">Mentions légales</Link></li>
                <li><Link to="/legal/cgu" className="hover:text-white transition-colors">CGU</Link></li>
                <li><Link to="/legal/cgv" className="hover:text-white transition-colors">CGV</Link></li>
                <li><Link to="/legal/confidentialite" className="hover:text-white transition-colors">Confidentialité</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-sm text-center">
            <p>&copy; {new Date().getFullYear()} ComptaApp. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
