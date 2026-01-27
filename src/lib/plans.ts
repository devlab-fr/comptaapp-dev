export type PlanTier = 'FREE' | 'PRO' | 'PRO_PLUS' | 'PRO_PLUS_PLUS';

export interface PlanFeatures {
  exportsCsv: boolean;
  exportsPdf: boolean;
  reportsAdvanced: boolean;
  multiCompany: boolean;
  exercicesMulti: boolean;
  agDocs: boolean;
  assistantIA: boolean;
  ocr: boolean;
  comptabiliteExpertMode: boolean;
}

export interface PlanQuotas {
  maxTransactions: number | null;
  maxCompanies: number;
}

export interface PlanDefinition {
  tier: PlanTier;
  rank: number;
  name: string;
  price: string;
  features: PlanFeatures;
  quotas: PlanQuotas;
}

export const PLAN_RANK: Record<PlanTier, number> = {
  FREE: 0,
  PRO: 1,
  PRO_PLUS: 2,
  PRO_PLUS_PLUS: 3,
};

export const PLANS: Record<PlanTier, PlanDefinition> = {
  FREE: {
    tier: 'FREE',
    rank: 0,
    name: 'Gratuit',
    price: '0€',
    features: {
      exportsCsv: false,
      exportsPdf: false,
      reportsAdvanced: false,
      multiCompany: false,
      exercicesMulti: false,
      agDocs: false,
      assistantIA: false,
      ocr: false,
      comptabiliteExpertMode: false,
    },
    quotas: {
      maxTransactions: 50,
      maxCompanies: 1,
    },
  },
  PRO: {
    tier: 'PRO',
    rank: 1,
    name: 'Pro',
    price: '15€/mois',
    features: {
      exportsCsv: true,
      exportsPdf: true,
      reportsAdvanced: false,
      multiCompany: false,
      exercicesMulti: false,
      agDocs: false,
      assistantIA: false,
      ocr: false,
      comptabiliteExpertMode: false,
    },
    quotas: {
      maxTransactions: null,
      maxCompanies: 1,
    },
  },
  PRO_PLUS: {
    tier: 'PRO_PLUS',
    rank: 2,
    name: 'Pro+',
    price: '30€/mois',
    features: {
      exportsCsv: true,
      exportsPdf: true,
      reportsAdvanced: true,
      multiCompany: false,
      exercicesMulti: true,
      agDocs: false,
      assistantIA: false,
      ocr: true,
      comptabiliteExpertMode: false,
    },
    quotas: {
      maxTransactions: null,
      maxCompanies: 1,
    },
  },
  PRO_PLUS_PLUS: {
    tier: 'PRO_PLUS_PLUS',
    rank: 3,
    name: 'Pro++',
    price: '59€/mois',
    features: {
      exportsCsv: true,
      exportsPdf: true,
      reportsAdvanced: true,
      multiCompany: false,
      exercicesMulti: true,
      agDocs: true,
      assistantIA: true,
      ocr: true,
      comptabiliteExpertMode: true,
    },
    quotas: {
      maxTransactions: null,
      maxCompanies: 1,
    },
  },
};

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLANS[tier];
}

export function isPlanHigherOrEqual(userTier: PlanTier, requiredTier: PlanTier): boolean {
  return PLAN_RANK[userTier] >= PLAN_RANK[requiredTier];
}

export function canUseFeature(userTier: PlanTier, feature: keyof PlanFeatures): boolean {
  const plan = getPlanDefinition(userTier);
  return plan.features[feature];
}

export function getQuotas(tier: PlanTier): PlanQuotas {
  return getPlanDefinition(tier).quotas;
}
