export function getCompanyId(): string | null {
  const companyId = localStorage.getItem('selected_company_id');
  return companyId;
}
