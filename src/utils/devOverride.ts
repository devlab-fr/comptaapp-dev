export function isDevPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') return false;

  const isDev = import.meta.env.DEV;
  const hostname = window.location.hostname;
  const isPreviewHostname = hostname.includes('bolt') || hostname.includes('preview');

  return isDev || isPreviewHostname;
}

export function isDevTestAccount(email?: string | null): boolean {
  return email === 'test@comptaapp.dev';
}

export function shouldApplyDevOverride(email?: string | null): boolean {
  return isDevPreviewEnvironment() && isDevTestAccount(email);
}
