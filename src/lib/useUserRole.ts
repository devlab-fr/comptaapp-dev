import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';

type MembershipRole = 'owner' | 'admin' | 'accountant' | 'viewer';

export function useUserRole(companyId: string | undefined) {
  const { user } = useAuth();
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !companyId) {
      setRole(null);
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      try {
        const { data, error } = await supabase
          .from('memberships')
          .select('role')
          .eq('company_id', companyId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching user role:', error);
          setRole(null);
        } else {
          setRole(data?.role || null);
        }
      } catch (err) {
        console.error('Unexpected error fetching role:', err);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [user, companyId]);

  const canModify = role === 'owner' || role === 'admin';
  const isReadOnly = role === 'accountant' || role === 'viewer';
  const isOwner = role === 'owner';
  const isAccountant = role === 'accountant';

  return {
    role,
    loading,
    canModify,
    isReadOnly,
    isOwner,
    isAccountant,
  };
}
