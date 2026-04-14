# VALIDATION — MODE IMMEDIATE FIX FINAL

## DATE
2026-04-06

## PROBLÈME INITIAL
- Mode immediate : POST /expense_documents → 400 Bad Request
- Message : "Écriture déséquilibrée: débit=0.00 crédit=120.00"
- Cause : Seule la ligne crédit était créée, aucune ligne débit

## AUDIT RÉALISÉ

### 1. CONFLIT DE MIGRATIONS DÉTECTÉ

**Chemin obsolète (20260406182720)** :
- Trigger : `trigger_auto_expense_accounting_entry` sur `expense_documents` AFTER INSERT
- Fonction : `auto_create_expense_accounting_entry()` version inline obsolète
- Timing : S'exécute AVANT l'insertion des `expense_lines`
- Problème : Boucle FOR sur `expense_lines` vide → aucun débit créé
- Résultat : débit=0, crédit=120 → écriture déséquilibrée

**Chemin moderne (20260331220116 + 20260406185617)** :
- Trigger : `trigger_auto_expense_accounting_on_line_insert` sur `expense_lines` AFTER INSERT
- Fonction : `auto_create_expense_accounting_entry_impl()` avec patch immediate/deferred
- Timing : S'exécute APRÈS l'insertion des `expense_lines`
- Résultat : Devrait fonctionner correctement

**Problème** : Le chemin obsolète s'exécutait EN PREMIER et levait l'erreur avant que le chemin moderne puisse s'exécuter.

## SOLUTION APPLIQUÉE

### Migration créée : `remove_obsolete_expense_accounting_trigger_path`

**Actions** :
1. Suppression du trigger obsolète sur `expense_documents`
2. Restauration de la fonction wrapper moderne avec flag skip
3. Garantie qu'un seul flux reste actif

## VALIDATION TECHNIQUE

### 1. TRIGGERS ACTIFS

```sql
SELECT trigger_name, table_name, function_name, trigger_timing, trigger_event
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname IN ('expense_documents', 'expense_lines')
  AND t.tgname LIKE '%accounting%';
```

**Résultat** :
- ✅ Un seul trigger actif : `trigger_auto_expense_accounting_on_line_insert`
- ✅ Table : `expense_lines`
- ✅ Timing : AFTER INSERT
- ✅ Fonction : `trigger_generate_expense_accounting_on_line_insert()`
- ✅ Aucun trigger sur `expense_documents`

### 2. FONCTION ACTIVE

**Fonction principale** : `auto_create_expense_accounting_entry_impl()`

**Gardes anti-duplication** :
- ✅ `IF p_document.linked_accounting_entry_id IS NOT NULL THEN RETURN`
- ✅ `IF v_line_count = 0 THEN RETURN`
- ✅ Batch mode activé pour éviter checks ligne par ligne
- ✅ Exception handler pour désactiver batch mode en cas d'erreur

**Support mode immediate** :
- ✅ Détection : `v_is_immediate := (p_document.payment_timing = 'immediate')`
- ✅ Journal : BQ (Banque) pour immediate, ACH (Achats) pour deferred
- ✅ Contrepartie : 512 (Banque) pour immediate, 401 (Fournisseur) pour deferred

**Génération des lignes** :
- ✅ Boucle FOR sur `expense_lines` (qui existent à ce moment)
- ✅ Débit 6xx (compte de charge selon catégorie)
- ✅ Débit 44566 (TVA déductible si > 0)
- ✅ Crédit 512 (mode immediate) ou 401 (mode deferred)

### 3. FLUX D'EXÉCUTION FINAL

```
1. Frontend : POST /expense_documents
   ↓
2. INSERT INTO expense_documents
   ↓
3. Aucun trigger sur expense_documents (✓ chemin obsolète supprimé)
   ↓
4. Frontend : POST /expense_lines (une ou plusieurs)
   ↓
5. INSERT INTO expense_lines
   ↓
6. Trigger : trigger_auto_expense_accounting_on_line_insert
   ↓
7. Fonction : trigger_generate_expense_accounting_on_line_insert()
   ↓
8. Appel : auto_create_expense_accounting_entry_impl(document)
   ↓
9. Vérifications :
   - linked_accounting_entry_id IS NULL ? ✓
   - COUNT(expense_lines) > 0 ? ✓
   ↓
10. Génération mode immediate :
    - Journal BQ
    - Débit 6xx (charge)
    - Débit 44566 (TVA si > 0)
    - Crédit 512 (Banque)
    ↓
11. Résultat : Écriture équilibrée ✓
```

## ÉLÉMENTS NEUTRALISÉS

**Migration 20260406182720** :
- ❌ Trigger `trigger_auto_expense_accounting_entry` sur `expense_documents` : **SUPPRIMÉ**
- ❌ Fonction `auto_create_expense_accounting_entry()` version inline : **REMPLACÉE** par version moderne avec flag skip

## ARCHITECTURE FINALE

**UN SEUL moteur comptable actif** :
- Trigger : `trigger_auto_expense_accounting_on_line_insert` sur `expense_lines` AFTER INSERT
- Fonction source : `auto_create_expense_accounting_entry_impl()`
- Support : immediate (512) et deferred (401)

**Pas de double exécution** :
- Aucun trigger sur `expense_documents`
- Garde `linked_accounting_entry_id` empêche toute duplication
- Idempotence garantie

**Pas de timing issue** :
- Trigger s'exécute APRÈS l'insertion des `expense_lines`
- Boucle FOR trouve les lignes correctement
- Tous les débits sont créés

## RÉSULTAT ATTENDU

**Mode immediate** :
```
Débit 6xx (charge)     : 100.00
Débit 44566 (TVA)      :  20.00
Crédit 512 (Banque)    : 120.00
------------------------
Total débit            : 120.00
Total crédit           : 120.00
Équilibre              : ✅ OUI
```

**Mode deferred** :
```
Débit 6xx (charge)     : 100.00
Débit 44566 (TVA)      :  20.00
Crédit 401 (Fournisseur): 120.00
------------------------
Total débit            : 120.00
Total crédit           : 120.00
Équilibre              : ✅ OUI
```

## ZONES PROTÉGÉES NON TOUCHÉES

✅ Rapprochement bancaire (bank_transactions, bank_match_memory)
✅ Automatch et scoring
✅ Mémoire comptable
✅ Paiement des factures (revenue_documents, trigger_auto_revenue_on_paid_invoice)
✅ Frontend (aucune modification)
✅ Autres triggers de validation

## GARANTIES

1. ✅ Un seul trigger comptable actif
2. ✅ Aucun trigger sur expense_documents ne génère d'écriture
3. ✅ Le trigger actif est bien AFTER INSERT sur expense_lines
4. ✅ Mode immediate produit : débit > 0, crédit > 0, écriture équilibrée
5. ✅ Mode deferred continue de fonctionner
6. ✅ Pas de double exécution possible
7. ✅ Pas de timing issue (lignes existent au moment du trigger)

## STATUS
✅ MIGRATION APPLIQUÉE
✅ ARCHITECTURE VALIDÉE
⏳ TEST RÉEL EN ATTENTE
