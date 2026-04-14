# AUDIT CIBLÉ — STATUTS DÉPENSE MODE IMMEDIATE

## DATE
2026-04-06

## CONTEXTE

Mode "immediate" fonctionne comptablement :
- Écriture créée automatiquement ✓
- Débit 6xx + TVA ✓
- Crédit 512 ✓
- Journal BQ ✓

**PROBLÈME** : Statuts incohérents
- Statut paiement : "Non payé" ❌
- Statut comptable : "Brouillon" ❌

Alors que la dépense est déjà réglée et comptabilisée.

---

## 1. ANALYSE BACKEND — expense_documents

### Champs de statut

**Structure de la table** :

| Champ | Type | Défaut | Valeurs possibles |
|-------|------|--------|-------------------|
| `accounting_status` | text | `'draft'` | `'draft'` \| `'validated'` |
| `payment_status` | text | `'unpaid'` | `'unpaid'` \| `'paid'` |
| `payment_timing` | text | `'immediate'` | `'immediate'` \| `'deferred'` |
| `linked_accounting_entry_id` | uuid | NULL | uuid de l'écriture d'achat |
| `payment_entry_id` | uuid | NULL | uuid de l'écriture de paiement |

**Contraintes CHECK** :
```sql
accounting_status IN ('draft', 'validated')
payment_status IN ('unpaid', 'paid')
payment_timing IN ('immediate', 'deferred')
```

### Valeurs par défaut

**Au moment du INSERT** :
- `accounting_status` → `'draft'` (défaut colonne)
- `payment_status` → `'unpaid'` (défaut colonne)
- `payment_timing` → `'immediate'` (défaut colonne)

**Incohérence détectée** :
Défauts incompatibles avec le mode immediate !
- Une dépense `immediate` devrait être `paid` dès la création
- Une dépense avec écriture comptable devrait être `validated`

---

## 2. ANALYSE FRONTEND — AddExpensePage

### Code de création (lignes 257-266)

```typescript
const documentData: any = {
  company_id: companyId,
  invoice_date: date,
  total_excl_vat: amountHTNum,
  total_vat: amountTva,
  total_incl_vat: amountTtc,
  accounting_status: 'draft',      // ❌ Hardcodé
  payment_status: 'unpaid',        // ❌ Hardcodé
  payment_timing: paymentTiming,   // ✓ Variable (immediate ou deferred)
};
```

**État au moment de l'INSERT** :
- `payment_timing` : `'immediate'` (ligne 54 : défaut state)
- `payment_status` : `'unpaid'` (ligne 264 : hardcodé)
- `accounting_status` : `'draft'` (ligne 263 : hardcodé)

**Incohérence** :
Le frontend envoie **toujours** `unpaid` et `draft`, même en mode `immediate` !

### Aucune mise à jour post-création

**Flow actuel** (lignes 274-329) :
1. INSERT expense_documents
2. INSERT expense_lines
3. (Trigger comptable s'exécute en arrière-plan)
4. Affichage succès

**Aucun UPDATE des statuts** après la création de l'écriture comptable.

---

## 3. ANALYSE TRIGGERS / SQL

### Trigger comptable : auto_create_expense_accounting_entry_impl()

**Source** : `20260406185617_fix_expense_accounting_impl_immediate_mode.sql`

**Ce qu'il fait** (lignes 271-274) :
```sql
UPDATE expense_documents
SET linked_accounting_entry_id = v_entry_id
WHERE id = p_document.id;
```

**Ce qu'il NE FAIT PAS** :
- ❌ Ne met pas à jour `accounting_status`
- ❌ Ne met pas à jour `payment_status`

### Trigger de paiement : auto_create_expense_payment_entry()

**Source** : `20260406182752_fix_expense_payment_trigger_ignore_immediate.sql`

**Gardes** (lignes 32-45) :
```sql
-- GARDE 1 : Vérifier si paiement déjà enregistré
IF NEW.payment_entry_id IS NOT NULL THEN RETURN NEW; END IF;

-- GARDE 2 : Si mode immediate, ne JAMAIS créer d'écriture de paiement
IF NEW.payment_timing = 'immediate' THEN RETURN NEW; END IF;

-- GARDE 3 : Vérifier si le document est marqué comme payé
IF NEW.payment_status IS NULL OR NEW.payment_status != 'paid' THEN RETURN NEW; END IF;
```

**Comportement** :
- Mode immediate : RETURN immédiatement (ligne 38-40)
- Ne crée d'écriture de paiement QUE si `payment_status='paid'` (ligne 43-45)
- Ne met PAS à jour `payment_status`

### Autres triggers

**Triggers existants sur expense_documents** :
1. `trigger_auto_expense_payment_entry` : AFTER INSERT OR UPDATE OF payment_status, paid_at
2. `trigger_validate_expense_document_has_lines` : BEFORE INSERT OR UPDATE

**Aucun ne met à jour automatiquement les statuts !**

---

## 4. FLOW COMPLET MODE IMMEDIATE

### Étape par étape

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Frontend : POST /expense_documents                           │
│    payment_timing: 'immediate'                                  │
│    payment_status: 'unpaid'          ❌ Incohérent              │
│    accounting_status: 'draft'        ❌ Incohérent              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. INSERT INTO expense_documents                                │
│    État initial :                                               │
│    - payment_timing = 'immediate'                               │
│    - payment_status = 'unpaid'                                  │
│    - accounting_status = 'draft'                                │
│    - linked_accounting_entry_id = NULL                          │
│    - payment_entry_id = NULL                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Trigger sur expense_documents : AUCUN EFFET                  │
│    (pas de trigger comptable sur expense_documents)             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Frontend : POST /expense_lines                               │
│    INSERT INTO expense_lines                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Trigger : trigger_auto_expense_accounting_on_line_insert     │
│    AFTER INSERT sur expense_lines                               │
│    Appelle : auto_create_expense_accounting_entry_impl()        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. Fonction : auto_create_expense_accounting_entry_impl()       │
│    - Détecte payment_timing = 'immediate'                       │
│    - Crée écriture comptable :                                  │
│      * Journal BQ (Banque)                                      │
│      * Débit 6xx (charge)                                       │
│      * Débit 44566 (TVA)                                        │
│      * Crédit 512 (Banque)                                      │
│    - UPDATE expense_documents SET :                             │
│      linked_accounting_entry_id = v_entry_id                    │
│                                                                 │
│    ❌ NE MET PAS À JOUR :                                       │
│      - payment_status (reste 'unpaid')                          │
│      - accounting_status (reste 'draft')                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. État final dans la base                                      │
│    - payment_timing = 'immediate'                               │
│    - payment_status = 'unpaid'          ❌ Incohérent !         │
│    - accounting_status = 'draft'        ❌ Incohérent !         │
│    - linked_accounting_entry_id = uuid  ✓ OK                    │
│    - payment_entry_id = NULL            ✓ OK (pas besoin)       │
│                                                                 │
│    Écriture comptable créée :                                   │
│    - Journal BQ                                                 │
│    - Débit 6xx + TVA = 120.00                                   │
│    - Crédit 512 = 120.00                                        │
│    - ✓ Équilibrée et correcte                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. Affichage Frontend                                           │
│    Badge "Non payé"                    ❌ Faux                  │
│    Badge "Brouillon"                   ❌ Faux                  │
│                                                                 │
│    Réalité comptable :                                          │
│    - Dépense payée (512 débité)        ✓ Vrai                  │
│    - Écriture validée (équilibrée)     ✓ Vrai                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. CAUSE EXACTE

### Cause primaire : Frontend hardcode les statuts

**Fichier** : `src/pages/AddExpensePage.tsx`
**Lignes** : 263-264
**Problème** :
```typescript
accounting_status: 'draft',
payment_status: 'unpaid',
```

Hardcodé en **dur**, sans tenir compte de `payment_timing`.

### Cause secondaire : Aucun trigger de mise à jour

**Fichier** : `supabase/migrations/20260406185617_fix_expense_accounting_impl_immediate_mode.sql`
**Lignes** : 271-274
**Problème** :
```sql
UPDATE expense_documents
SET linked_accounting_entry_id = v_entry_id
WHERE id = p_document.id;
```

Ne met à jour QUE `linked_accounting_entry_id`.
**Aucune mise à jour de `payment_status` ou `accounting_status`**.

### Logique métier manquante

**Règle métier attendue** (non implémentée) :
```
IF payment_timing = 'immediate' AND linked_accounting_entry_id IS NOT NULL THEN
  payment_status := 'paid'
  accounting_status := 'validated'
END IF
```

**Cette logique n'existe NULLE PART** :
- ❌ Pas dans le frontend
- ❌ Pas dans les triggers
- ❌ Pas dans les fonctions SQL

---

## 6. OÙ INTERVENIR

### Option A : Frontend (plus simple, moins robuste)

**Fichier** : `src/pages/AddExpensePage.tsx`
**Ligne** : 257-266

**Changement** :
```typescript
const documentData: any = {
  company_id: companyId,
  invoice_date: date,
  total_excl_vat: amountHTNum,
  total_vat: amountTva,
  total_incl_vat: amountTtc,
  accounting_status: paymentTiming === 'immediate' ? 'validated' : 'draft',
  payment_status: paymentTiming === 'immediate' ? 'paid' : 'unpaid',
  payment_timing: paymentTiming,
};
```

**Avantages** :
- Simple à implémenter
- Une seule ligne à modifier
- Immédiat

**Inconvénients** :
- Fragile : dépend du frontend
- Incohérent si API appelée directement
- Ne corrige pas les données existantes

---

### Option B : Backend trigger (plus robuste, recommandée)

**Fichier** : Nouvelle migration SQL

**Changement** : Ajouter un trigger ou modifier `auto_create_expense_accounting_entry_impl()`

**Approche 1 : Modifier la fonction comptable**
```sql
-- À la fin de auto_create_expense_accounting_entry_impl()
-- Après UPDATE linked_accounting_entry_id

IF v_is_immediate THEN
  UPDATE expense_documents
  SET
    payment_status = 'paid',
    accounting_status = 'validated'
  WHERE id = p_document.id;
END IF;
```

**Approche 2 : Créer un trigger AFTER UPDATE**
```sql
CREATE TRIGGER trigger_auto_validate_immediate_expense
  AFTER UPDATE OF linked_accounting_entry_id
  ON expense_documents
  FOR EACH ROW
  WHEN (NEW.payment_timing = 'immediate' AND NEW.linked_accounting_entry_id IS NOT NULL)
  EXECUTE FUNCTION auto_validate_immediate_expense();
```

**Avantages** :
- Robuste : fonctionne même si API appelée directement
- Cohérent avec l'architecture triggers existante
- Peut corriger les données existantes
- Source de vérité unique (base de données)

**Inconvénients** :
- Plus complexe
- Nécessite migration et tests

---

## 7. RISQUES SI CORRECTION MAL FAITE

### Risque 1 : Boucle de triggers

**Scénario** :
- Trigger 1 : UPDATE linked_accounting_entry_id
- Trigger 2 : UPDATE payment_status, accounting_status (déclenché par UPDATE)
- Trigger 3 : Se redéclenche ?

**Prévention** :
- Utiliser `WHEN (OLD.payment_status != NEW.payment_status)` pour éviter rebouclage
- Ne mettre à jour QUE si valeurs différentes

### Risque 2 : Conflit avec validation manuelle

**Scénario** :
- Utilisateur crée dépense immediate (statuts auto à 'paid'/'validated')
- Utilisateur veut éditer → blocked car statut validé

**Prévention** :
- Documenter clairement le comportement
- Ou permettre édition des dépenses immediate même validées

### Risque 3 : Données existantes incohérentes

**Scénario** :
- 100 dépenses immediate déjà créées avec statut 'unpaid'
- Nouveau trigger s'applique seulement aux nouvelles

**Prévention** :
- Créer script de migration pour corriger données existantes
- Ou accepter l'incohérence temporaire

### Risque 4 : Interaction avec mode deferred

**Scénario** :
- Logique mode immediate impacte accidentellement mode deferred

**Prévention** :
- Gardes strictes sur `payment_timing = 'immediate'`
- Tests exhaustifs des deux modes

### Risque 5 : Interaction avec trigger de paiement

**Scénario** :
- auto_create_expense_payment_entry() se déclenche sur UPDATE de payment_status
- Génère écriture de paiement en mode immediate (duplication)

**Prévention** :
- Garde existante déjà en place (ligne 38-40)
- Vérifier qu'elle reste active

---

## 8. PROPOSITION DE CORRECTION (SANS IMPLÉMENTATION)

### Solution recommandée : Backend trigger

**Créer migration** : `fix_auto_validate_immediate_expense_status.sql`

**Contenu** :

```sql
/*
  # Auto-validation des dépenses immediate

  1. Problème
    - Dépenses immediate restent en statut 'unpaid' et 'draft'
    - Alors qu'elles sont déjà réglées et comptabilisées
    - Incohérence entre écriture comptable et statuts affichés

  2. Solution
    - Modifier auto_create_expense_accounting_entry_impl()
    - Après création de l'écriture, mettre à jour les statuts
    - Mode immediate uniquement

  3. Sécurité
    - Garde stricte sur payment_timing = 'immediate'
    - Ne touche PAS au mode deferred
    - Compatible avec trigger de paiement existant (ignore immediate)
*/

CREATE OR REPLACE FUNCTION auto_create_expense_accounting_entry_impl(p_document expense_documents)
RETURNS void AS $$
-- ... code existant inchangé ...

  -- À LA FIN, après UPDATE linked_accounting_entry_id

  -- Si mode immediate, valider automatiquement les statuts
  IF v_is_immediate THEN
    UPDATE expense_documents
    SET
      payment_status = 'paid',
      accounting_status = 'validated'
    WHERE id = p_document.id;
  END IF;

-- ... fin de la fonction ...
$$;
```

**Alternative : Migration corrective des données existantes**

```sql
-- Corriger les dépenses immediate déjà créées
UPDATE expense_documents
SET
  payment_status = 'paid',
  accounting_status = 'validated'
WHERE payment_timing = 'immediate'
  AND linked_accounting_entry_id IS NOT NULL
  AND (payment_status = 'unpaid' OR accounting_status = 'draft');
```

---

## 9. RÉCAPITULATIF

### Cause exacte

**Frontend** (AddExpensePage.tsx:263-264) :
- Hardcode `accounting_status: 'draft'` et `payment_status: 'unpaid'`
- Ne tient pas compte de `payment_timing`

**Backend** (auto_create_expense_accounting_entry_impl:271-274) :
- Met à jour UNIQUEMENT `linked_accounting_entry_id`
- Ne met PAS à jour `payment_status` ni `accounting_status`

**Résultat** :
- Dépense comptablement payée (écriture 512 créée)
- Mais affichée comme "Non payé" et "Brouillon"

### Où intervenir

**Recommandé : Backend (trigger/fonction SQL)**
- Plus robuste
- Source de vérité unique
- Cohérent avec architecture existante

**Alternative : Frontend**
- Plus simple
- Moins robuste
- Dépendance frontend

### Proposition

Modifier `auto_create_expense_accounting_entry_impl()` pour ajouter :
```sql
IF v_is_immediate THEN
  UPDATE expense_documents
  SET payment_status = 'paid', accounting_status = 'validated'
  WHERE id = p_document.id;
END IF;
```

**+ Migration corrective pour données existantes**

---

## CONCLUSION

**Diagnostic complet terminé — aucune modification effectuée.**

Le problème est clairement identifié :
- **Aucun mécanisme** (frontend ou backend) ne met à jour les statuts en mode immediate
- La correction doit être faite **au niveau du trigger comptable** (solution robuste)
- Les risques sont identifiés et gérables avec les gardes appropriées
