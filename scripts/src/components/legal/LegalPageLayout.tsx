import { Link } from 'react-router-dom';
import Footer from '../Footer';

interface LegalPageLayoutProps {
  title: string;
  updatedAt?: string;
  children: React.ReactNode;
}

export default function LegalPageLayout({ title, updatedAt, children }: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-slate-100 flex flex-col">
      <div className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-6 sm:px-10 lg:px-12 py-12 sm:py-16">
          <div className="mb-8">
            <Link to="/" className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors">
              ← Retour à l'accueil
            </Link>
          </div>

          <div className="bg-white rounded-3xl shadow-xl ring-1 ring-black/5 p-10 sm:p-12 lg:p-14">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight text-gray-900 mb-6">
              {title}
            </h1>

            {updatedAt && (
              <p className="mt-4 text-sm text-slate-600">
                Date de dernière mise à jour : {updatedAt}
              </p>
            )}

            <div className="prose prose-slate prose-lg max-w-none prose-headings:scroll-mt-24 prose-h2:mt-10 prose-h2:mb-4 prose-h3:mt-8 prose-h3:mb-3 prose-p:leading-relaxed prose-li:my-1 mt-10">
              {children}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
