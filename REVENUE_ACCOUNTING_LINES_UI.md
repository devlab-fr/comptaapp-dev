# PATCH UI — AFFICHAGE LIGNES COMPTABLES DANS VUE REVENUE

## OBJECTIF

Afficher le détail complet des écritures comptables dans la vue détail d'un revenu, comme dans un vrai logiciel comptable professionnel.

## MODIFICATIONS APPORTÉES

### 1. Ajout de l'interface TypeScript `AccountingLine`

**Fichier :** `src/pages/ViewRevenuePage.tsx`

```typescript
interface AccountingLine {
  id: string;
  label: string;
  debit: number;
  credit: number;
  line_order: number;
  chart_of_accounts?: {
    code: string;
    name: string;
  } | null;
}
```

### 2. Ajout du state pour les lignes comptables

```typescript
const [accountingLines, setAccountingLines] = useState<AccountingLine[]>([]);
```

### 3. Récupération des lignes comptables avec jointure

**Requête Supabase :**
```typescript
const { data: linesData } = await supabase
  .from('accounting_lines')
  .select(`
    id,
    label,
    debit,
    credit,
    line_order,
    chart_of_accounts (code, name)
  `)
  .eq('entry_id', docData.linked_accounting_entry_id)
  .order('line_order', { ascending: true });
```

**Mapping des données :**
- Gestion du tableau retourné par Supabase pour la jointure
- Conversion des valeurs null en 0 pour debit/credit
- Extraction du premier élément du tableau chart_of_accounts

### 4. Section UI "Lignes comptables"

**Position :** Entre "Écriture de vente" et "Écriture de paiement"

**Affichage conditionnel :**
- Seulement si `accountingEntry` existe
- Seulement si `accountingLines.length > 0`

**Structure du tableau :**

| Colonne | Alignement | Format |
|---------|-----------|--------|
| Compte | Gauche | Code compte (411, 707, 44571) |
| Libellé | Gauche | Nom du compte (Clients, Ventes, TVA collectée) |
| Débit | Droite | Format € ou "—" si 0 |
| Crédit | Droite | Format € ou "—" si 0 |

**Ligne de total :**
- Bordure supérieure épaisse (2px)
- Fond grisé (#f3f4f6)
- Calcul automatique des sommes débit/crédit
- Police monospace pour alignement

### 5. Style appliqué

**Cohérence visuelle :**
- Même style que les autres sections de la page
- Fond gris clair (#f9fafb)
- Bordure grise (#e5e7eb)
- Padding 16px
- Border-radius 8px

**Typographie :**
- Titre section : 13px, bold, #1f2937
- En-têtes colonnes : 12px, uppercase, bold, #6b7280
- Données : 13px, #111827
- Montants : font-family monospace pour alignement parfait

**Règles d'affichage :**
- Si débit = 0 → afficher "—"
- Si crédit = 0 → afficher "—"
- Format monétaire : 1 800,00 € (format français)
- Alignement droite pour les montants

---

## EXEMPLE D'AFFICHAGE OBTENU

### Revenu test du 30/03/2026 - 1 800,00 € TTC

**Section Comptabilité → Lignes comptables :**

```
Compte   Libellé                      Débit        Crédit
--------------------------------------------------------
411      Clients                      1 800,00 €   —
706      Prestations de services      —            1 500,00 €
44571    TVA collectée                —            300,00 €
--------------------------------------------------------
Total                                 1 800,00 €   1 800,00 €
```

---

## TESTS EFFECTUÉS

### Test 1 : Build TypeScript
✅ **SUCCÈS** - Aucune erreur de compilation

### Test 2 : Requête SQL de récupération des lignes
✅ **SUCCÈS** - 3 lignes récupérées pour l'écriture test
```
411  | Clients                  | 1800.00 | 0.00
706  | Prestations de services  | 0.00    | 1500.00
44571| TVA collectée            | 0.00    | 300.00
```

### Test 3 : Vérification équilibre
✅ **SUCCÈS** - Total débit = Total crédit = 1 800,00 €

### Test 4 : Vérification tous les revenus existants
✅ **SUCCÈS** - 3 revenus avec écritures comptables équilibrées :
- Revenu 1 : 2 400,00 € (3 lignes, OK)
- Revenu 2 : 1 800,00 € (3 lignes, OK)
- Revenu 3 : 120,01 € (3 lignes, OK)

### Test 5 : Format JSON Supabase
✅ **SUCCÈS** - Format correct avec chart_of_accounts en objet JSON :
```json
{
  "id": "...",
  "label": "Client",
  "debit": "1800.00",
  "credit": "0.00",
  "line_order": 1,
  "chart_of_accounts": {
    "code": "411",
    "name": "Clients"
  }
}
```

---

## SÉCURITÉ ET ROBUSTESSE

### Gestion des cas limites

1. **Pas d'écriture comptable liée**
   - Section non affichée (condition `if accountingEntry`)
   - Message existant : "Aucune écriture comptable liée"

2. **Écriture sans lignes**
   - Section non affichée (condition `if accountingLines.length > 0`)
   - Pas de message d'erreur, comportement silencieux

3. **Valeurs NULL**
   - Debit/Credit NULL → converti en 0
   - chart_of_accounts NULL → affiche "—" pour le code

4. **Jointure Supabase tableau vide**
   - Vérification `Array.isArray` et `length > 0`
   - Extraction sécurisée du premier élément

---

## ALIGNEMENT AVEC LES STANDARDS COMPTABLES

### PCG (Plan Comptable Général)

**Présentation conforme :**
- Compte à gauche (norme PCG)
- Libellé au centre
- Débit/Crédit séparés (partie double)
- Total en bas avec équilibre visible

**Codes comptes utilisés :**
- 411 : Clients (classe 4 - Comptes de tiers)
- 706 : Prestations de services (classe 7 - Comptes de produits)
- 707 : Ventes de marchandises (classe 7 - Comptes de produits)
- 44571 : TVA collectée (classe 4 - Comptes de tiers)

### Principes respectés

1. **Partie double** : Débit = Crédit (équilibre)
2. **Numérotation** : Ordre croissant par line_order
3. **Clarté** : Libellés explicites
4. **Traçabilité** : Lien visible avec le document source

---

## RÉSULTAT FINAL

### Avant le patch
- Informations écriture comptable : ✅ (numéro, date, journal, statut)
- Détail des lignes comptables : ❌ (non visible)

### Après le patch
- Informations écriture comptable : ✅ (inchangé)
- Détail des lignes comptables : ✅ (nouveau)
  - Compte ✅
  - Libellé ✅
  - Débit ✅
  - Crédit ✅
  - Total ✅
  - Format professionnel ✅

### Impact utilisateur

**Pour un comptable :**
- Vision complète de l'écriture sans quitter la fiche revenu
- Vérification immédiate de l'équilibre
- Contrôle des comptes utilisés
- Format familier (comme un logiciel pro)

**Pour un entrepreneur :**
- Transparence totale sur la comptabilisation
- Compréhension de où va l'argent (411, 706, 44571)
- Confiance dans l'exactitude (total équilibré visible)

---

## ZÉRO RÉGRESSION

### Backend
❌ **Non modifié** - Aucun changement SQL, triggers, ou fonctions

### Frontend autres pages
❌ **Non modifié** - Seul ViewRevenuePage.tsx impacté

### Dépenses
❌ **Non modifié** - Logique dépense intacte

### Factures
❌ **Non modifié** - Module facturation intact

### Tests
✅ **VALIDÉS** - Tous les revenus existants OK

---

## FICHIERS MODIFIÉS

### 1. src/pages/ViewRevenuePage.tsx

**Ajouts :**
- Interface `AccountingLine` (lignes 58-68)
- State `accountingLines` (ligne 83)
- Récupération lignes comptables (lignes 148-173)
- Section UI lignes comptables (lignes 527-587)

**Total lignes ajoutées : ~80 lignes**

---

## CONCLUSION

La vue détail des revenus affiche maintenant les lignes comptables complètes avec :
- Format professionnel type cabinet comptable
- Équilibre débit/crédit visible
- Codes et libellés de comptes
- Aucune régression introduite
- Build TypeScript réussi

Le patch UI est appliqué avec succès.
