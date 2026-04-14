import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isRefreshing: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null; data: any }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const expectedUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const expectedProjectRef = expectedUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        try {
          const parts = session.access_token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const iss = payload?.iss || '';
            const issProjectRef = iss.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || null;

            if (issProjectRef && expectedProjectRef && issProjectRef !== expectedProjectRef) {
              console.error('JWT_MISMATCH_SIGNOUT', {
                issProjectRef,
                expectedProjectRef,
                action: 'signing out and redirecting to login',
              });
              supabase.auth.signOut();
              window.location.href = '/login';
              return;
            }
          }
        } catch (e) {
        }
      }

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.location.href = '/reset-password';
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        setIsRefreshing(true);
        if (session?.user) {
          setSession(session);
          setUser(session.user);
        }
        setTimeout(() => setIsRefreshing(false), 300);
        return;
      }

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setSession(session);
        setUser(session?.user ?? null);
        return;
      }

      if (session?.user) {
        setSession(session);
        setUser(session.user);
      } else if (!isRefreshing) {
        setSession(session);
        setUser(session?.user ?? null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      return { error, data };
    } catch (error) {
      return { error: error as Error, data: null };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    loading,
    isRefreshing,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
