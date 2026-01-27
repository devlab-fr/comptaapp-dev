import { useParams } from 'react-router-dom';

export function useCurrentCompany(): string | null {
  const { companyId } = useParams<{ companyId: string }>();
  console.log('CURRENT_COMPANY', { companyId: companyId || 'none' });
  return companyId || null;
}
