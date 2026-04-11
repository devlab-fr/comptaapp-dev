import { useParams } from 'react-router-dom';

export function useCurrentCompany(): string | null {
  const { companyId } = useParams<{ companyId: string }>();
  return companyId || null;
}
