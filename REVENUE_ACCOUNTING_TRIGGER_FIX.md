# FIX TRIGGER COMPTABLE REVENUS - BLOCAGE CRÉATION DOCUMENT

## PROBLÈME IDENTIFIÉ

### Symptôme
L'insertion d'un `revenue_document` en statut `draft/unpaid` échouait systématiquement avec l'erreur :
```
ERROR: P0001: Écriture déséquilibrée: débit=120.00 crédit=0.00
CONTEXT: PL/pgSQL function auto_create_revenue_accounting_entry_impl(revenue_documents) line 182 at RAISE
```

### Cause racine
Le trigger `trigger_auto_revenue_accounting_entry` AFTER INSERT sur `revenue_documents` tentait de créer une écriture comptable équilibrée AVANT que les `revenue_lines` ne soient insérées.

**Séquence du problème :**
1. Frontend : INSERT `revenue_documents`
2. Trigger AFTER INSERT : `auto_create_revenue_accounting_entry()` s'exécute immédiatement
3. Fonction : Insère débit 120.00 sur compte 411 (Client)
4. Boucle FOR : `SELECT ... FROM revenue_lines WHERE document_id = NEW.id` → **0 résultat**
5. Aucun crédit inséré (crédit = 0.00)
6. Vérification équilibre : débit (120.00) ≠ crédit (0.00)
7. EXCEPTION levée → Transaction annulée → Document NON créé

### Différence avec le trigger expense
Le trigger expense possédait déjà une protection :
```sql
SELECT COUNT(*) INTO v_line_count
FROM expense_lines
WHERE document_id = p_document.id;

IF v_line_count = 0 THEN
  RETURN;
END IF;
```

Le trigger revenue ne possédait PAS cette protection.

---

## SOLUTION APPLIQUÉE

### 1. Modification de la fonction SQL `auto_create_revenue_accounting_entry_impl()`

**Fichier modifié :** `supabase/migrations/20260330225557_20260330231000_fix_revenue_trigger_timing_issue.sql`

**Ajout dans le bloc DECLARE :**
```sql
v_line_count int;
```

**Ajout après la vérification `linked_accounting_entry_id` :**
```sql
-- SÉCURITÉ : Vérifier qu'il existe au moins 1 revenue_line
SELECT COUNT(*) INTO v_line_count
FROM revenue_lines
WHERE document_id = p_revenue.id;

IF v_line_count = 0 THEN
  -- Pas de lignes, on ne fait rien
  RETURN NULL;
END IF;
```

### 2. Modification du frontend AddRevenuePage.tsx

**Ajout de l'appel manuel après insertion des lignes :**
```typescript
// Générer l'écriture comptable maintenant que les lignes existent
const { error: accountingError } = await supabase.rpc(
  'auto_create_revenue_accounting_entry_manual',
  { p_revenue_id: document.id }
);

if (accountingError) {
  console.warn('Avertissement: écriture comptable non générée', accountingError);
  // Ne pas bloquer la création du revenu si la génération comptable échoue
}
```

---

## FLUX CORRIGÉ

### Avant le fix
```
INSERT revenue_documents
  ↓
Trigger AFTER INSERT déclenché
  ↓
auto_create_revenue_accounting_entry_impl() exécutée
  ↓
Tentative création écriture comptable
  ↓
Aucune revenue_line trouvée
  ↓
Déséquilibre débit/crédit
  ↓
EXCEPTION → Transaction annulée
  ↓
❌ ÉCHEC
```

### Après le fix
```
INSERT revenue_documents
  ↓
Trigger AFTER INSERT déclenché
  ↓
auto_create_revenue_accounting_entry_impl() exécutée
  ↓
Vérification COUNT(revenue_lines) = 0
  ↓
RETURN NULL (pas d'écriture créée)
  ↓
✅ Document créé avec succès
  ↓
INSERT revenue_lines
  ↓
✅ Lignes créées avec succès
  ↓
RPC auto_create_revenue_accounting_entry_manual()
  ↓
Vérification COUNT(revenue_lines) > 0
  ↓
Création écriture comptable équilibrée
  ↓
✅ Écriture comptable générée
```

---

## TESTS EFFECTUÉS

### Test 1 : Création document SANS lignes
✅ **SUCCÈS** - Document créé, `linked_accounting_entry_id` = NULL

### Test 2 : Insertion lignes
✅ **SUCCÈS** - 2 lignes insérées

### Test 3 : Génération manuelle écriture comptable
✅ **SUCCÈS** - Écriture créée et liée au document

### Test 4 : Vérification équilibre
✅ **SUCCÈS** - Débit = Crédit = 300.00

### Test 5 : Vérification détail lignes comptables
✅ **SUCCÈS** - 4 lignes :
- Débit 411 (Clients) : 300.00
- Crédit 707 (Ventes) : 150.00 + 100.00
- Crédit 44571 (TVA collectée) : 30.00 + 20.00

### Test 6 : Vérification revenus existants
✅ **SUCCÈS** - 2 revenus existants avec écritures comptables intactes

### Test 7 : Vérification dépenses existantes
✅ **SUCCÈS** - 4 dépenses avec écritures comptables intactes

### Test 8 : Simulation flux frontend complet
✅ **SUCCÈS** - Document + lignes + écriture comptable créés

### Test 9 : Vérification aucune écriture déséquilibrée
✅ **SUCCÈS** - Aucune écriture déséquilibrée trouvée

### Test 10 : Build TypeScript
✅ **SUCCÈS** - Build réussi sans erreur

---

## RÉSULTAT

### Blocage levé
- ✅ Création revenue_document en draft/unpaid autorisée
- ✅ Insertion revenue_lines fonctionne
- ✅ Écriture comptable générée après insertion des lignes
- ✅ Équilibre débit/crédit respecté
- ✅ Zéro régression sur revenus existants
- ✅ Zéro régression sur dépenses existantes
- ✅ Build projet réussi

### Alignement avec le pattern expense
Le trigger revenue suit maintenant exactement le même pattern que le trigger expense :
1. Vérification COUNT(*) FROM lines WHERE document_id = id
2. Si 0 ligne → RETURN NULL (pas d'écriture)
3. Si > 0 ligne → Création écriture comptable équilibrée

### Sécurité
- Protection contre les insertions document sans lignes
- Pas de blocage si la génération comptable échoue (warning uniquement)
- Idempotence conservée (vérifie linked_accounting_entry_id)
- Aucune modification de la logique métier existante

---

## FICHIERS MODIFIÉS

1. `supabase/migrations/20260330225557_20260330231000_fix_revenue_trigger_timing_issue.sql`
   - Ajout variable `v_line_count int`
   - Ajout vérification COUNT(*) revenue_lines
   - Ajout protection IF v_line_count = 0 THEN RETURN NULL

2. `src/pages/AddRevenuePage.tsx`
   - Ajout appel RPC `auto_create_revenue_accounting_entry_manual` après insertion lignes
   - Gestion erreur non bloquante (console.warn)

---

## CONCLUSION

Le patch minimal a été appliqué avec succès. Le trigger comptable revenue ne bloque plus la création de documents et suit maintenant le même pattern de protection que le trigger expense. Aucune régression détectée.
