# AUDIT CIBLÉ — VUE "DÉTAIL ÉCRITURE COMPTABLE"

**Date :** 2026-04-03
**Objectif :** Préparer la création d'une nouvelle vue détail d'écriture comptable en réutilisant l'existant validé
**Règle :** AUCUNE MODIFICATION DE CODE - AUDIT UNIQUEMENT

---

## 1. TABLES / TYPES / CHAMPS EXISTANTS

### 1.1 Table `accounting_entries` ✅ EXISTE

**Fichier migration :** `supabase/migrations/20260102220553_create_accounting_system_tables.sql`

| Champ | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | uuid | NO | PK |
| `company_id` | uuid | NO | FK vers companies |
| `fiscal_year` | integer | NO | Année fiscale |
| `journal_id` | uuid | NO | FK vers journals |
| `entry_number` | text | NO | Numéro écriture (ex: ACH-2026-00001) |
| `entry_date` | date | NO | Date de l'écriture |
| `description` | text | NO | Description |
| `attachment_id` | uuid | YES | FK vers attachments (justificatif) |
| `locked` | boolean | YES | DEPRECATED - ne plus utiliser |
| `is_locked` | boolean | NO | Statut verrouillage actuel |
| `locked_at` | timestamp | YES | Date de verrouillage |
| `locked_by` | uuid | YES | User qui a verrouillé |
| `created_at` | timestamp | YES | Date de création |
| `created_by` | uuid | YES | User créateur |

**Status :** ✅ COMPLET - Tous les champs nécessaires sont présents

---

### 1.2 Table `accounting_lines` ✅ EXISTE

**Fichier migration :** `supabase/migrations/20260102220553_create_accounting_system_tables.sql`

| Champ | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | uuid | NO | PK |
| `entry_id` | uuid | NO | FK vers accounting_entries |
| `account_id` | uuid | NO | FK vers chart_of_accounts |
| `label` | text | NO | Libellé de la ligne |
| `debit` | numeric | YES | Montant débit (default 0) |
| `credit` | numeric | YES | Montant crédit (default 0) |
| `vat_rate` | numeric | YES | Taux TVA (optionnel) |
| `third_party_id` | uuid | YES | FK vers third_parties (optionnel) |
| `due_date` | date | YES | Date échéance (optionnel) |
| `line_order` | integer | YES | Ordre d'affichage (default 0) |

**Status :** ✅ COMPLET - Tous les champs nécessaires sont présents

---

### 1.3 Table `journals` ✅ EXISTE

**Fichier migration :** `supabase/migrations/20260102220553_create_accounting_system_tables.sql`

| Champ | Type | Description |
|-------|------|-------------|
| `id` | uuid | PK |
| `company_id` | uuid | FK vers companies |
| `code` | text | Code journal (ACH, VT, BQ, OD...) |
| `name` | text | Nom journal (Achats, Ventes...) |
| `is_active` | boolean | Statut actif |
| `created_at` | timestamp | Date de création |

**Status :** ✅ COMPLET

---

### 1.4 Table `chart_of_accounts` ✅ EXISTE

**Fichier migration :** `supabase/migrations/20260330210451_seed_plan_comptable_french.sql`

| Champ | Type | Description |
|-------|------|-------------|
| `id` | uuid | PK |
| `company_id` | uuid | FK vers companies |
| `code` | text | Code compte PCG (401, 606, 625...) |
| `name` | text | Nom du compte |
| `type` | text | Type (actif, passif, charge, produit) |
| `is_default` | boolean | Compte par défaut |

**Status :** ✅ COMPLET

---

### 1.5 Table `accounting_entry_history` ✅ EXISTE

**Fichier migration :** `supabase/migrations/20260102220553_create_accounting_system_tables.sql`

| Champ | Type | Description |
|-------|------|-------------|
| `id` | uuid | PK |
| `entry_id` | uuid | FK vers accounting_entries |
| `user_id` | uuid | FK vers auth.users |
| `action` | text | Action (created, updated, locked, unlocked) |
| `created_at` | timestamp | Date de l'action |

**Status :** ✅ COMPLET - Historique disponible

---

### 1.6 Liens entre écritures et documents ✅ EXISTE

**Documents dépenses :**
- `expense_documents.linked_accounting_entry_id` → écriture d'achat
- `expense_documents.payment_entry_id` → écriture de paiement

**Documents revenus :**
- `revenue_documents.linked_accounting_entry_id` → écriture de vente
- `revenue_documents.payment_entry_id` → écriture de paiement

**Status :** ✅ LIEN BIDIRECTIONNEL POSSIBLE
- De l'écriture → chercher document source (expense ou revenue)
- Du document → afficher écriture liée (déjà fait)

---

## 2. PAGES / COMPOSANTS / HOOKS EXISTANTS

### 2.1 ViewRevenuePage.tsx ✅ RÉUTILISABLE

**Fichier :** `src/pages/ViewRevenuePage.tsx`

**Pattern validé pour afficher :**
- Interface `AccountingEntry` (lignes 45-56)
- Interface `AccountingLine` (lignes 58-68)
- Chargement écriture liée (avec join `journals`)
- Chargement lignes comptables (avec join `chart_of_accounts`)
- Affichage tableau lignes avec codes comptes
- Calcul totaux débit/crédit
- Gestion null/undefined sécurisée

**Code réutilisable :**
```typescript
// Interfaces (lignes 45-68)
interface AccountingEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  is_locked: boolean;
  journal_id: string;
  journals?: { code: string; name: string; } | null;
}

interface AccountingLine {
  id: string;
  label: string;
  debit: number;
  credit: number;
  line_order: number;
  chart_of_accounts?: { code: string; name: string; } | null;
}

// Chargement (pattern validé)
const { data: entryData } = await supabase
  .from('accounting_entries')
  .select(`*, journals (code, name)`)
  .eq('id', entryId)
  .maybeSingle();

const { data: linesData } = await supabase
  .from('accounting_lines')
  .select(`id, label, debit, credit, line_order, account_id`)
  .eq('entry_id', entryId)
  .order('line_order', { ascending: true });

// Mapping comptes (pattern validé)
const accountIds = [...new Set(linesData.map(line => line.account_id))];
const { data: accountsData } = await supabase
  .from('chart_of_accounts')
  .select('id, code, name')
  .in('id', accountIds);

const accountsMap = new Map(
  (accountsData || []).map(acc => [acc.id, { code: acc.code, name: acc.name }])
);
```

**Status :** ✅ PATTERN 100% RÉUTILISABLE

---

### 2.2 ViewExpensePage.tsx ✅ RÉUTILISABLE

**Fichier :** `src/pages/ViewExpensePage.tsx`

**Même pattern validé :**
- Interfaces identiques (lignes 48-71)
- Chargement identique
- Affichage tableau lignes comptables identique (lignes 454-563)

**Status :** ✅ PATTERN 100% RÉUTILISABLE (validé aujourd'hui)

---

### 2.3 ComptabilitePage.tsx - JournalListTab ✅ RÉUTILISABLE PARTIELLEMENT

**Fichier :** `src/pages/ComptabilitePage.tsx`
**Composant :** `JournalListTab` (lignes 1115-1289)

**Ce qui existe :**
- Interface `EntryWithDetails` (lignes 1105-1113)
- Liste des écritures avec filtrage par exercice
- Affichage tableau : N° écriture, Date, Journal, Description, Statut
- Bouton "Commentaires" → ouvre modal
- Bouton "Verrouiller" → verrouille l'écriture

**Ce qui manque :**
- ❌ Pas de bouton "Voir détails"
- ❌ Pas de navigation vers une vue détail
- ❌ Pas d'affichage des lignes comptables dans le tableau
- ❌ Pas de lien vers document source

**Status :** ⚠️ RÉUTILISABLE POUR LA LISTE - MANQUE NAVIGATION VERS DÉTAIL

---

### 2.4 Composants UI existants ✅ RÉUTILISABLES

#### StatusBadges.tsx ✅ EXISTE

**Fichier :** `src/components/StatusBadges.tsx`

**Fonctionnalités :**
- Badge statut comptable (Validé / Brouillon)
- Badge statut paiement (Payé / Non payé)

**Status :** ✅ RÉUTILISABLE pour afficher statut document source

**Note :** Pour les écritures comptables, utiliser le statut `is_locked` (Verrouillée / Déverrouillée)

---

#### EntryCommentsModal.tsx ✅ EXISTE

**Fichier :** `src/components/EntryCommentsModal.tsx`

**Fonctionnalités :**
- Affichage commentaires sur une écriture
- Ajout de commentaires
- Suppression de commentaires
- Onglet historique des actions

**Status :** ✅ RÉUTILISABLE tel quel

---

#### BackButton.tsx ✅ EXISTE

**Fichier :** `src/components/BackButton.tsx`

**Status :** ✅ RÉUTILISABLE pour navigation retour

---

## 3. CHAMPS DISPONIBLES POUR LA FUTURE VUE

### 3.1 Données d'en-tête ✅ TOUT DISPONIBLE

| Champ | Source | Status |
|-------|--------|--------|
| Numéro écriture | `accounting_entries.entry_number` | ✅ |
| Date | `accounting_entries.entry_date` | ✅ |
| Journal (code) | `journals.code` | ✅ |
| Journal (nom) | `journals.name` | ✅ |
| Description | `accounting_entries.description` | ✅ |
| Exercice fiscal | `accounting_entries.fiscal_year` | ✅ |
| Statut verrouillage | `accounting_entries.is_locked` | ✅ |
| Date verrouillage | `accounting_entries.locked_at` | ✅ |
| Verrouillé par | `accounting_entries.locked_by` | ✅ |
| Créé par | `accounting_entries.created_by` | ✅ |
| Créé le | `accounting_entries.created_at` | ✅ |

**Status :** ✅ COMPLET

---

### 3.2 Lignes comptables ✅ TOUT DISPONIBLE

| Champ | Source | Status |
|-------|--------|--------|
| Code compte | `chart_of_accounts.code` | ✅ |
| Nom compte | `chart_of_accounts.name` | ✅ |
| Libellé ligne | `accounting_lines.label` | ✅ |
| Débit | `accounting_lines.debit` | ✅ |
| Crédit | `accounting_lines.credit` | ✅ |
| Ordre | `accounting_lines.line_order` | ✅ |

**Status :** ✅ COMPLET

---

### 3.3 Totaux ✅ CALCULABLES

| Total | Calcul | Status |
|-------|--------|--------|
| Total Débit | `SUM(accounting_lines.debit)` | ✅ |
| Total Crédit | `SUM(accounting_lines.credit)` | ✅ |
| Équilibre | `Total Débit - Total Crédit` | ✅ |

**Status :** ✅ COMPLET - Pattern validé dans ViewRevenuePage + ViewExpensePage

---

### 3.4 Document source ✅ IDENTIFIABLE

**Query pour identifier document source :**

```sql
-- Écriture liée à une dépense
SELECT
  ed.id,
  ed.total_incl_vat,
  CASE
    WHEN ed.linked_accounting_entry_id = :entry_id THEN 'expense_entry'
    WHEN ed.payment_entry_id = :entry_id THEN 'expense_payment'
  END as link_type
FROM expense_documents ed
WHERE ed.linked_accounting_entry_id = :entry_id
   OR ed.payment_entry_id = :entry_id;

-- Écriture liée à un revenu
SELECT
  rd.id,
  rd.total_incl_vat,
  CASE
    WHEN rd.linked_accounting_entry_id = :entry_id THEN 'revenue_entry'
    WHEN rd.payment_entry_id = :entry_id THEN 'revenue_payment'
  END as link_type
FROM revenue_documents rd
WHERE rd.linked_accounting_entry_id = :entry_id
   OR rd.payment_entry_id = :entry_id;
```

**Status :** ✅ LIEN IDENTIFIABLE - Pattern SQL simple

---

### 3.5 Justificatif ✅ DISPONIBLE

| Champ | Source | Status |
|-------|--------|--------|
| Justificatif | `accounting_entries.attachment_id` | ✅ |

**Note :** Ce champ existe mais n'est actuellement pas utilisé dans l'application. Les justificatifs sont attachés aux documents (expense/revenue), pas directement aux écritures.

**Status :** ⚠️ EXISTE MAIS NON UTILISÉ - À évaluer selon besoin

---

### 3.6 Historique & Commentaires ✅ DISPONIBLES

| Fonctionnalité | Source | Status |
|----------------|--------|--------|
| Historique actions | `accounting_entry_history` | ✅ |
| Commentaires | Composant `EntryCommentsModal` | ✅ |

**Status :** ✅ COMPLET - Modal existant réutilisable

---

## 4. MANQUES EXACTS

### 4.1 ✅ EXISTE DÉJÀ

| Élément | Status | Fichier |
|---------|--------|---------|
| Tables BDD | ✅ EXISTE | Migrations SQL |
| Interfaces TypeScript | ✅ EXISTE | ViewRevenuePage.tsx, ViewExpensePage.tsx |
| Pattern chargement données | ✅ EXISTE | ViewRevenuePage.tsx (validé) |
| Pattern affichage lignes | ✅ EXISTE | ViewRevenuePage.tsx (validé) |
| Composant StatusBadges | ✅ EXISTE | StatusBadges.tsx |
| Composant EntryCommentsModal | ✅ EXISTE | EntryCommentsModal.tsx |
| Composant BackButton | ✅ EXISTE | BackButton.tsx |

---

### 4.2 ❌ MANQUE RÉELLEMENT

| Élément | Status | Impact |
|---------|--------|--------|
| **Route `/app/company/:companyId/accounting-entry/:entryId`** | ❌ MANQUE | À créer |
| **Page `ViewAccountingEntryPage.tsx`** | ❌ MANQUE | À créer |
| **Bouton "Voir détails" dans JournalListTab** | ❌ MANQUE | À ajouter |
| **Logique identification document source** | ❌ MANQUE | À implémenter |
| **Bouton "Voir document source"** | ❌ MANQUE | À ajouter (si doc existe) |

---

### 4.3 ⚠️ PEUT ÊTRE RÉUTILISÉ SANS RISQUE

#### Pattern ViewRevenuePage.tsx

**Code à copier/adapter (lignes 45-68) :**
```typescript
interface AccountingEntry { ... }
interface AccountingLine { ... }
```

**Code à copier/adapter (chargement données) :**
```typescript
// 1. Charger l'écriture avec journal
const { data: entryData } = await supabase
  .from('accounting_entries')
  .select(`*, journals (code, name)`)
  .eq('id', entryId)
  .maybeSingle();

// 2. Charger les lignes
const { data: linesData } = await supabase
  .from('accounting_lines')
  .select(`id, label, debit, credit, line_order, account_id`)
  .eq('entry_id', entryId)
  .order('line_order', { ascending: true });

// 3. Charger les comptes
const accountIds = [...new Set(linesData.map(line => line.account_id))];
const { data: accountsData } = await supabase
  .from('chart_of_accounts')
  .select('id, code, name')
  .in('id', accountIds);

// 4. Mapper
const accountsMap = new Map(
  (accountsData || []).map(acc => [acc.id, { code: acc.code, name: acc.name }])
);
const mappedLines = linesData.map(line => ({
  ...line,
  chart_of_accounts: accountsMap.get(line.account_id) || null
}));
```

**Code à copier/adapter (affichage tableau lignes 546-606) :**
```tsx
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
  <thead>
    <tr>
      <th>Compte</th>
      <th>Libellé</th>
      <th style={{ textAlign: 'right' }}>Débit</th>
      <th style={{ textAlign: 'right' }}>Crédit</th>
    </tr>
  </thead>
  <tbody>
    {accountingLines.map((line) => (
      <tr key={line.id}>
        <td>{line.chart_of_accounts?.code || '—'}</td>
        <td>{line.chart_of_accounts?.name || line.label}</td>
        <td style={{ textAlign: 'right' }}>
          {line.debit > 0 ? formatCurrency(line.debit) : '—'}
        </td>
        <td style={{ textAlign: 'right' }}>
          {line.credit > 0 ? formatCurrency(line.credit) : '—'}
        </td>
      </tr>
    ))}
    {/* Ligne total */}
    <tr>
      <td colSpan={2}>Total</td>
      <td>{formatCurrency(totalDebit)}</td>
      <td>{formatCurrency(totalCredit)}</td>
    </tr>
  </tbody>
</table>
```

**Status :** ✅ RÉUTILISABLE À 100% - Code validé et testé

---

## 5. ARCHITECTURE PROPOSÉE (SANS MODIFICATION)

### 5.1 Nouvelle page à créer

**Fichier :** `src/pages/ViewAccountingEntryPage.tsx`

**Route :** `/app/company/:companyId/accounting-entry/:entryId`

**Props :**
- `companyId` (string) - depuis URL
- `entryId` (string) - depuis URL

---

### 5.2 Structure de la page

```
┌─────────────────────────────────────────────┐
│ [← Retour]              [Commentaires]      │
│                                             │
│ Écriture ACH-2026-00001                     │
│ [Verrouillée / Déverrouillée]              │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Informations générales                      │
│ - Numéro : ACH-2026-00001                   │
│ - Date : 30/03/2026                         │
│ - Journal : ACH - Achats                    │
│ - Description : ...                         │
│ - Exercice : 2026                           │
│ - Verrouillée le : ... par ...              │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Lignes comptables                           │
│                                             │
│ Compte  Libellé           Débit    Crédit  │
│ ──────────────────────────────────────────  │
│ 606     Achats...        100,00 €     —    │
│ 44566   TVA déduct.      5,50 €       —    │
│ 401     Fournisseurs     —         105,50 €│
│ ──────────────────────────────────────────  │
│ Total                    105,50 €  105,50 €│
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Document source                             │
│ - Type : Dépense                            │
│ - Montant : 105,50 €                        │
│ [Voir le document]                          │
└─────────────────────────────────────────────┘
```

---

### 5.3 Données à charger

**1. Écriture comptable :**
```typescript
const { data: entry } = await supabase
  .from('accounting_entries')
  .select(`
    id,
    entry_number,
    entry_date,
    description,
    is_locked,
    locked_at,
    locked_by,
    fiscal_year,
    created_at,
    created_by,
    journals (code, name)
  `)
  .eq('id', entryId)
  .maybeSingle();
```

**2. Lignes comptables :**
```typescript
// Pattern validé ViewRevenuePage.tsx
const { data: linesData } = await supabase
  .from('accounting_lines')
  .select('id, label, debit, credit, line_order, account_id')
  .eq('entry_id', entryId)
  .order('line_order', { ascending: true });

// Charger comptes
const accountIds = [...new Set(linesData.map(line => line.account_id))];
const { data: accounts } = await supabase
  .from('chart_of_accounts')
  .select('id, code, name')
  .in('id', accountIds);

// Mapper
const accountsMap = new Map(accounts.map(acc => [acc.id, acc]));
const lines = linesData.map(line => ({
  ...line,
  chart_of_accounts: accountsMap.get(line.account_id)
}));
```

**3. Document source :**
```typescript
// Chercher dans expenses
const { data: expenseDoc } = await supabase
  .from('expense_documents')
  .select('id, total_incl_vat')
  .or(`linked_accounting_entry_id.eq.${entryId},payment_entry_id.eq.${entryId}`)
  .maybeSingle();

// Si pas trouvé, chercher dans revenues
if (!expenseDoc) {
  const { data: revenueDoc } = await supabase
    .from('revenue_documents')
    .select('id, total_incl_vat')
    .or(`linked_accounting_entry_id.eq.${entryId},payment_entry_id.eq.${entryId}`)
    .maybeSingle();
}
```

---

### 5.4 Modification à ajouter dans ComptabilitePage.tsx

**Ligne 1248-1270 (JournalListTab - colonne Actions) :**

**AVANT :**
```tsx
<td style={{ padding: '12px', textAlign: 'center' }}>
  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
    <button onClick={() => setSelectedEntryForComments(entry)}>
      Commentaires
    </button>
    {!entry.is_locked && (
      <button onClick={() => handleLockEntry(entry.id)}>
        Verrouiller
      </button>
    )}
  </div>
</td>
```

**APRÈS :**
```tsx
<td style={{ padding: '12px', textAlign: 'center' }}>
  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
    <button onClick={() => navigate(`/app/company/${companyId}/accounting-entry/${entry.id}`)}>
      Voir détails
    </button>
    <button onClick={() => setSelectedEntryForComments(entry)}>
      Commentaires
    </button>
    {!entry.is_locked && (
      <button onClick={() => handleLockEntry(entry.id)}>
        Verrouiller
      </button>
    )}
  </div>
</td>
```

---

## 6. RÉSUMÉ EXÉCUTIF

### ✅ CE QUI EXISTE (RÉUTILISABLE)

1. **Tables BDD complètes** : accounting_entries, accounting_lines, journals, chart_of_accounts
2. **Interfaces TypeScript validées** : AccountingEntry, AccountingLine
3. **Pattern chargement validé** : ViewRevenuePage.tsx (lignes 45-68, chargement données)
4. **Pattern affichage validé** : ViewRevenuePage.tsx (lignes 546-606, tableau lignes)
5. **Composants UI** : StatusBadges, EntryCommentsModal, BackButton
6. **Liens documents** : expense_documents, revenue_documents avec FK vers écritures
7. **Historique** : accounting_entry_history + modal existant

### ❌ CE QUI MANQUE (À CRÉER)

1. **Route** : `/app/company/:companyId/accounting-entry/:entryId`
2. **Page** : `ViewAccountingEntryPage.tsx`
3. **Bouton navigation** : Dans JournalListTab (ComptabilitePage.tsx ligne 1248)
4. **Logique document source** : Query SQL pour identifier expense vs revenue
5. **Ajout route** : Dans `App.tsx`

### ⚠️ EFFORT ESTIMÉ

| Tâche | Complexité | Risque |
|-------|------------|--------|
| Créer ViewAccountingEntryPage.tsx | FAIBLE | Copier pattern validé |
| Ajouter route dans App.tsx | FAIBLE | 1 ligne |
| Ajouter bouton "Voir détails" | FAIBLE | 3 lignes |
| Implémenter identification doc source | FAIBLE | Query SQL simple |
| Tests | MOYEN | Tester liens expense + revenue |

**Total :** ~1-2h de développement
**Risque :** FAIBLE - Pattern 100% validé

---

## 7. EXEMPLE DE DONNÉES RÉELLES

### Écriture ACH-2026-00001

```json
{
  "id": "81621316-4c3b-4b0a-8a5c-57622821edc4",
  "entry_number": "ACH-2026-00001",
  "entry_date": "2026-03-31",
  "description": "Dépense - Test écriture compta",
  "is_locked": true,
  "locked_at": "2026-03-31T22:58:06.514730Z",
  "locked_by": "2dee535f-9c62-4636-bffa-7c8cf05b4fff",
  "fiscal_year": 2026,
  "journal": {
    "code": "ACH",
    "name": "Achats"
  },
  "lines": [
    {
      "account_code": "606",
      "account_name": "Achats non stockés - Fournitures",
      "label": "Test écriture compta",
      "debit": 100.00,
      "credit": 0.00,
      "line_order": 1
    },
    {
      "account_code": "44566",
      "account_name": "TVA déductible",
      "label": "TVA déductible - Test écriture compta",
      "debit": 5.50,
      "credit": 0.00,
      "line_order": 2
    },
    {
      "account_code": "401",
      "account_name": "Fournisseurs",
      "label": "Fournisseur",
      "debit": 0.00,
      "credit": 105.50,
      "line_order": 4
    }
  ],
  "source_document": {
    "type": "expense",
    "id": "de97a75f-2593-4b6d-b741-70c216f2a9d7",
    "total": 105.50,
    "link_type": "expense_entry"
  }
}
```

**Total Débit :** 105,50 €
**Total Crédit :** 105,50 €
**Équilibre :** ✅

---

## CONCLUSION

**Architecture stable :** ✅
**Données disponibles :** ✅
**Pattern validé :** ✅
**Composants réutilisables :** ✅
**Risque technique :** FAIBLE

**Prochaine étape :** Créer `ViewAccountingEntryPage.tsx` en copiant le pattern validé de `ViewRevenuePage.tsx`

**Aucune modification backend nécessaire.**
**Aucune nouvelle migration SQL nécessaire.**
**100% frontend, 100% réutilisation.**
