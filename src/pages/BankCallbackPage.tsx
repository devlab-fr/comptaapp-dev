import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function BankCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const state = searchParams.get('state');
    const connection_id = searchParams.get('connection_id');
    const error = searchParams.get('error');
    const error_description = searchParams.get('error_description');

    if (!state) {
      navigate('/banque?powens=error', { replace: true });
      return;
    }

    const companyId = sessionStorage.getItem('powens_callback_company_id');
    const bankUrl = companyId ? `/app/company/${companyId}/banque` : '/app';

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/powens-connect-callback`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ state, connection_id, error, error_description }),
          }
        );

        if (response.ok) {
          sessionStorage.removeItem('powens_callback_company_id');
          navigate(`${bankUrl}?powens=success`, { replace: true });
        } else if (response.status === 409) {
          const json = await response.json().catch(() => ({}));
          if (json.error === 'Connection already processed' && json.current_status === 'connected') {
            sessionStorage.removeItem('powens_callback_company_id');
            navigate(`${bankUrl}?powens=success`, { replace: true });
          } else {
            sessionStorage.removeItem('powens_callback_company_id');
            navigate(`${bankUrl}?powens=error`, { replace: true });
          }
        } else {
          sessionStorage.removeItem('powens_callback_company_id');
          navigate(`${bankUrl}?powens=error`, { replace: true });
        }
      } catch {
        sessionStorage.removeItem('powens_callback_company_id');
        navigate(`${bankUrl}?powens=error`, { replace: true });
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600 text-base">Connexion bancaire en cours...</p>
      </div>
    </div>
  );
}
