export type PlanTier = 'FREE' | 'PRO' | 'PRO_PLUS' | 'PRO_PLUS_PLUS';

export type Feature =
  | 'transactions_unlimited'
  | 'exports_csv'
  | 'exports_pdf'
  | 'reports_advanced'
  | 'scan_ocr'
  | 'assistant_ia'
  | 'documents_ag'
  | 'liasse_fiscale';

export function normalizePlanTier(input: string | null | undefined): PlanTier {
  if (!input) return 'FREE';

  const normalized = String(input).trim().toUpperCase().replace(/\s+/g, '_');

  if (normalized === 'FREE' || normalized === 'GRATUIT') return 'FREE';
  if (normalized === 'PRO') return 'PRO';

  if (normalized === 'PRO_PP' || normalized === 'PRO++' || normalized === 'PROPLUSPLUS' || normalized === 'PRO_PLUS_PLUS' || normalized.includes('PLUS_PLUS')) {
    return 'PRO_PLUS_PLUS';
  }

  if (normalized === 'PRO_PLUS' || normalized === 'PRO+' || normalized === 'PROPLUS') {
    return 'PRO_PLUS';
  }

  return 'FREE';
}

const FEATURE_PLAN_MATRIX: Record<Feature, PlanTier> = {
  transactions_unlimited: 'PRO',
  exports_csv: 'PRO',
  exports_pdf: 'PRO',
  reports_advanced: 'PRO_PLUS',
  scan_ocr: 'PRO_PLUS',
  assistant_ia: 'PRO_PLUS_PLUS',
  documents_ag: 'PRO_PLUS_PLUS',
  liasse_fiscale: 'PRO_PLUS_PLUS',
};

const PLAN_RANK: Record<PlanTier, number> = {
  FREE: 0,
  PRO: 1,
  PRO_PLUS: 2,
  PRO_PLUS_PLUS: 3,
};

const PLAN_LABELS: Record<PlanTier, string> = {
  FREE: 'Gratuit',
  PRO: 'Pro',
  PRO_PLUS: 'Pro+',
  PRO_PLUS_PLUS: 'Pro++',
};

export function getRequiredPlan(feature: Feature): PlanTier {
  return FEATURE_PLAN_MATRIX[feature];
}

export function hasFeature(planTier: PlanTier, feature: Feature): boolean {
  const requiredPlan = getRequiredPlan(feature);
  const hasAccess = PLAN_RANK[planTier] >= PLAN_RANK[requiredPlan];
  return hasAccess;
}

export function formatPlanLabel(planTier: PlanTier): string {
  return PLAN_LABELS[planTier];
}

export function getFeatureBlockedMessage(feature: Feature): string {
  const requiredPlan = getRequiredPlan(feature);
  const label = formatPlanLabel(requiredPlan);
  return `Fonction disponible en ${label}`;
}

export function convertEntitlementsPlanToTier(plan: string): PlanTier {
  const normalized = normalizePlanTier(plan);
  return normalized;
}
