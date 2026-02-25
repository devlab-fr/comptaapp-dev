import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function DevAuthReset() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const isDev = import.meta.env.DEV;

  if (!isDev) return null;

  const handleHardReset = async () => {
    if (!confirm('RESET SESSION DEV: Cela va vous déconnecter et nettoyer le cache. Continuer?')) {
      return;
    }

    setLoading(true);
    console.log('DEV_HARD_RESET_START');

    try {
      await supabase.auth.signOut();
      console.log('DEV_HARD_RESET_SIGNOUT_OK');

      Object.keys(localStorage).forEach((key) => {
        if (key.includes('supabase')) {
          console.log('DEV_HARD_RESET_CLEAR_STORAGE', key);
          localStorage.removeItem(key);
        }
      });

      console.log('DEV_HARD_RESET_COMPLETE');
      alert('Session réinitialisée. Redirection vers login...');
      navigate('/login');
    } catch (error) {
      console.error('DEV_HARD_RESET_ERROR', error);
      alert('Erreur lors du reset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <button
        onClick={handleHardReset}
        disabled={loading}
        className="bg-red-600 text-white px-4 py-2 rounded shadow-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
      >
        {loading ? 'Reset...' : 'DEV: Reset Session'}
      </button>
    </div>
  );
}
