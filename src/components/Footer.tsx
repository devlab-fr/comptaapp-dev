import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-6 text-sm text-gray-600">
          <Link
            to="/legal/mentions-legales"
            className="hover:text-gray-900 transition-colors"
          >
            Mentions légales
          </Link>
          <span className="hidden sm:inline text-gray-300">•</span>
          <Link
            to="/legal/cgu"
            className="hover:text-gray-900 transition-colors"
          >
            CGU
          </Link>
          <span className="hidden sm:inline text-gray-300">•</span>
          <Link
            to="/legal/cgv"
            className="hover:text-gray-900 transition-colors"
          >
            CGV
          </Link>
          <span className="hidden sm:inline text-gray-300">•</span>
          <Link
            to="/legal/confidentialite"
            className="hover:text-gray-900 transition-colors"
          >
            Confidentialité
          </Link>
        </div>
        <div className="text-center text-xs text-gray-500 mt-4">
          © {new Date().getFullYear()} ComptaApp - SHOPTOO
        </div>
      </div>
    </footer>
  );
}
