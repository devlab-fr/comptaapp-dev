import type { Entitlements } from './entitlements';

export interface GuardResult {
  ok: boolean;
  reason?: 'quota';
  message?: string;
}

export interface GuardCreateExpenseParams {
  entitlements: Entitlements;
  getCurrentMonthExpenseCount: () => Promise<number>;
}

export async function guardCreateExpenseMonthlyQuota({
  entitlements,
  getCurrentMonthExpenseCount,
}: GuardCreateExpenseParams): Promise<GuardResult> {
  if (entitlements.plan === 'pro' || entitlements.plan === 'pro_plus' || entitlements.plan === 'pro_pp') {
    return { ok: true };
  }

  if (entitlements.limits.maxExpensesPerMonth === null) {
    return { ok: true };
  }

  const count = await getCurrentMonthExpenseCount();
  const limit = entitlements.limits.maxExpensesPerMonth;

  if (count >= limit) {
    return {
      ok: false,
      reason: 'quota',
      message: `Limite gratuite atteinte (30 dépenses / mois). Passez Pro pour continuer.`,
    };
  }

  return { ok: true };
}
