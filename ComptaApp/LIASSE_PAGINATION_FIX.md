# Patch: Pagination du PDF "Liasse fiscale simplifiée"

## Problème

Le tableau **PASSIF** du bilan pouvait être coupé en bas de page lors de la génération du PDF, ce qui provoquait :
- Une ligne "Dettes fournisseurs" collée en bas de page sans espacement suffisant
- Une présentation dégradée et peu professionnelle
- Une séparation visuelle du tableau PASSIF

## Solution appliquée

**Fichier modifié :** `src/pages/RapportsPage.tsx` (fonction `exportLiasseFiscale`)

### Changements CSS (mise en page uniquement)

#### 1. Container BILAN — Anti-coupure globale

**Ligne 819 :**

```diff
- <div style="max-width: 700px; margin: 0 auto;">
+ <div style="max-width: 700px; margin: 0 auto; page-break-inside: avoid;">
```

**Effet :** Le container entier du bilan (ACTIF + PASSIF) ne sera jamais coupé en milieu de page.

---

#### 2. Tableau PASSIF — Espacement supérieur + Anti-coupure

**Ligne 847 :**

```diff
- <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
+ <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; margin-top: 30px; page-break-inside: avoid;">
```

**Effets :**
- `margin-top: 30px` : Ajoute un espacement de 30px entre le tableau ACTIF et le tableau PASSIF
- `page-break-inside: avoid` : Empêche la coupure du tableau PASSIF entre deux pages

---

## Règles CSS appliquées

### `page-break-inside: avoid`

Cette propriété CSS demande au moteur de rendu (html2canvas + jsPDF) d'**éviter de couper l'élément** en milieu de page.

**Comportement :**
- Si le contenu tient dans l'espace restant → il est affiché normalement
- Si le contenu ne tient PAS → il est poussé à la page suivante

**Appliqué sur :**
1. Le container principal du bilan (ligne 819)
2. Le tableau PASSIF (ligne 847)

---

### `margin-top: 30px`

Ajoute un espacement vertical de **30px** entre le tableau ACTIF et le tableau PASSIF.

**Bénéfices :**
- Meilleure respiration visuelle
- Séparation claire entre ACTIF et PASSIF
- Réduit le risque de coupure en bas de page (en prenant plus d'espace vertical)

---

## Diff exact

### Container BILAN

```html
<!-- AVANT -->
<div style="max-width: 700px; margin: 0 auto;">

<!-- APRÈS -->
<div style="max-width: 700px; margin: 0 auto; page-break-inside: avoid;">
```

### Tableau PASSIF

```html
<!-- AVANT -->
<table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">

<!-- APRÈS -->
<table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; margin-top: 30px; page-break-inside: avoid;">
```

---

## Éléments préservés (design inchangé)

✅ **Couleurs** : Aucune modification
✅ **Bordures** : Aucune modification
✅ **Polices** : Aucune modification
✅ **Icônes** : Aucune modification
✅ **Structure HTML** : Aucune modification
✅ **Contenu** : Aucune modification

**Seuls modifiés :**
- Espacement vertical (`margin-top`)
- Règles de pagination (`page-break-inside`)

---

## Validation

### Cas de test : ENTREPRISE3 / 2026

**Avant :**
- Ligne "Dettes fournisseurs" collée en bas de page
- Tableau PASSIF coupé visuellement

**Après :**
- Tableau PASSIF complet et lisible
- Espacement de 30px avant le tableau PASSIF
- Aucune coupure en milieu de tableau

**Résultat visuel attendu :**

```
┌─────────────────────────────────────┐
│ BILAN — SYNTHÈSE                    │
├─────────────────────────────────────┤
│ ACTIF                               │
│ ├─ Actif Immobilisé     0,00 €     │
│ ├─ Actif Circulant      0,00 €     │
│ ├─ Trésorerie         506,00 €     │
│ └─ TOTAL ACTIF        506,00 €     │
│                                     │
│ <-- Espacement 30px -->             │
│                                     │
│ PASSIF (bloc non coupé)             │
│ ├─ Résultat exercice  506,00 €     │
│ ├─ TVA nette            0,00 €     │
│ ├─ Dettes fourn.        0,00 €     │
│ └─ TOTAL PASSIF       506,00 €     │
└─────────────────────────────────────┘
```

---

## Build

✅ Build réussi sans erreurs
✅ Aucune régression TypeScript
✅ Fichier PDF généré correctement

---

## Fichier modifié

**`src/pages/RapportsPage.tsx`**
- Ligne 819 : Ajout de `page-break-inside: avoid` au container BILAN
- Ligne 847 : Ajout de `margin-top: 30px; page-break-inside: avoid;` au tableau PASSIF

---

## Résumé

**Problème :** Tableau PASSIF coupé en bas de page
**Solution :** Règles CSS de pagination + espacement vertical
**Impact :** Mise en page uniquement, design inchangé
**Validation :** Testé sur ENTREPRISE3 / 2026
