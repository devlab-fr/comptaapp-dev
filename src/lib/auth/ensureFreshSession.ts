import { supabase } from '../supabase';

export interface FreshSession {
  accessToken: string;
  userId: string;
  expires_at?: number;
}

export async function ensureFreshSession(): Promise<FreshSession> {
  let { data: { session } } = await supabase.auth.getSession();

  if (!session || !session.access_token) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError || !refreshData?.session || !refreshData.session.access_token) {
      throw new Error('AUTH_REQUIRED');
    }

    session = refreshData.session;
  }

  if (!session || !session.access_token) {
    throw new Error('AUTH_REQUIRED');
  }

  return {
    accessToken: session.access_token,
    userId: session.user?.id || '',
    expires_at: session.expires_at,
  };
}
