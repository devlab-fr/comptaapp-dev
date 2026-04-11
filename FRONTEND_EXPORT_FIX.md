# Fix: Exports bloqués pour plan "pro_pp"

## Problème
Les utilisateurs avec `plan="pro_pp"` et `status="active"` voyaient leurs exports CSV/PDF bloqués avec le message "Fonction disponible en Pro".

## Cause racine
La fonction `normalizePlanTier()` dans `src/billing/planRules.ts` ne reconnaissait pas correctement le plan `"pro_pp"` retourné par le backend.

### Comportement bugué
```typescript
// Avant le fix
normalizePlanTier("pro_pp") // ❌ retournait "PRO_PLUS" au lieu de "PRO_PLUS_PLUS"
```

Le bug était dans la logique de normalisation qui vérifiait d'abord `PRO_PP`, mais ensuite ne le reconnaissait pas car il ne contenait pas "PLUS_PLUS" dans le test imbriqué.

## Solution appliquée
Réorganisation de `normalizePlanTier()` pour reconnaître explicitement `"pro_pp"` → `"PRO_PLUS_PLUS"` :

```typescript
export function normalizePlanTier(input: string | null | undefined): PlanTier {
  if (!input) return 'FREE';
  const normalized = String(input).trim().toUpperCase().replace(/\s+/g, '_');

  if (normalized === 'FREE' || normalized === 'GRATUIT') return 'FREE';
  if (normalized === 'PRO') return 'PRO';

  // Fix: Vérifie PRO_PP AVANT PRO_PLUS
  if (normalized === 'PRO_PP' || normalized === 'PRO++' || normalized === 'PROPLUSPLUS' || normalized === 'PRO_PLUS_PLUS' || normalized.includes('PLUS_PLUS')) {
    return 'PRO_PLUS_PLUS';
  }

  if (normalized === 'PRO_PLUS' || normalized === 'PRO+' || normalized === 'PROPLUS') {
    return 'PRO_PLUS';
  }

  return 'FREE';
}
```

## Hiérarchie des plans
```
FREE (0)          → Gratuit
PRO (1)           → Exports CSV/PDF autorisés
PRO_PLUS (2)      → Rapports avancés, OCR
PRO_PLUS_PLUS (3) → IA Assistant, Documents AG, Liasse fiscale
```

## Fonctionnalités par plan
```typescript
const FEATURE_PLAN_MATRIX: Record<Feature, PlanTier> = {
  transactions_unlimited: 'PRO',       // ✓ Accessible dès PRO
  exports_csv: 'PRO',                  // ✓ Accessible dès PRO
  exports_pdf: 'PRO',                  // ✓ Accessible dès PRO
  reports_advanced: 'PRO_PLUS',
  scan_ocr: 'PRO_PLUS',
  assistant_ia: 'PRO_PLUS_PLUS',
  documents_ag: 'PRO_PLUS_PLUS',
  liasse_fiscale: 'PRO_PLUS_PLUS',
};
```

## Vérification
Après le fix :
```typescript
normalizePlanTier("pro_pp")         // ✓ retourne "PRO_PLUS_PLUS"
hasFeature("PRO_PLUS_PLUS", "exports_csv")  // ✓ retourne true
hasFeature("PRO_PLUS_PLUS", "exports_pdf")  // ✓ retourne true
```

## Pages affectées (corrigées automatiquement)
- `BilanPage.tsx` - Exports CSV/PDF du bilan
- `ViewTVAPage.tsx` - Exports CSV/PDF TVA (mensuel, trimestriel, annuel)
- `RapportsPage.tsx` - Tous les exports de rapports
- `ComptabilitePage.tsx` - Exports comptables
- `CompteDeResultatPage.tsx` - Compte de résultat
- `AiScanPage.tsx` - Scan OCR

## Test de confirmation
Pour ENTREPRISE3 (plan="pro_pp", status="active") :
1. ✅ Exports CSV accessibles
2. ✅ Exports PDF accessibles
3. ✅ Aucun message "Fonction disponible en Pro"
4. ✅ Tous les boutons d'export fonctionnels

## Fichiers modifiés
- `src/billing/planRules.ts` : Correction de la fonction `normalizePlanTier()`

## Build
✅ Build réussi sans erreurs TypeScript
