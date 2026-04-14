/*
  # Add account_code mapping to categories

  1. Changes
    - Add `account_code` column to `expense_categories` table
    - Add `account_code` column to `revenue_categories` table
    - Populate expense categories with default accounting codes (6xxx)
    - Populate revenue categories with default accounting codes (7xxx)

  2. Purpose
    - Enable automatic mapping between business categories and accounting accounts
    - Prepare for automated accounting entry generation
    - Link management modules (expenses/revenues/invoices) to accounting system

  3. Mapping Applied

    **Expense Categories → Chart of Accounts:**
    - Achats & Marchandises → 606 (Achats non stockés de matières et fournitures)
    - Services & Prestations → 622 (Rémunérations d'intermédiaires et honoraires)
    - Loyer & Charges Locatives → 613 (Locations)
    - Énergie & Télécommunications → 626 (Frais postaux et télécommunications)
    - Déplacements & Véhicules → 625 (Déplacements, missions et réceptions)
    - Frais de Repas & Réception → 625 (Déplacements, missions et réceptions)
    - Assurances & Frais Bancaires → 616 (Primes d'assurances)
    - Impôts, Taxes & Cotisations → 635 (Autres impôts, taxes et versements assimilés)
    - Matériel & Équipements → 606 (Achats non stockés de matières et fournitures)
    - Marketing & Communication → 623 (Publicité, publications, relations publiques)
    - Logiciels & Abonnements → 606 (Achats non stockés de matières et fournitures)
    - Autres charges → 606 (Achats non stockés de matières et fournitures)

    **Revenue Categories → Chart of Accounts:**
    - Ventes de biens → 707 (Ventes de marchandises)
    - Prestations de services → 706 (Prestations de services)
    - Abonnements & revenus récurrents → 706 (Prestations de services)
    - Revenus annexes → 758 (Produits divers de gestion courante)

  4. Notes
    - Column is nullable for flexibility
    - Existing categories are populated with standard French PCG codes
    - No impact on existing documents or entries
*/

-- Add account_code column to expense_categories
ALTER TABLE expense_categories 
ADD COLUMN IF NOT EXISTS account_code TEXT;

-- Add account_code column to revenue_categories
ALTER TABLE revenue_categories 
ADD COLUMN IF NOT EXISTS account_code TEXT;

-- Populate expense categories with default accounting codes
UPDATE expense_categories SET account_code = '606' WHERE name = 'Achats & Marchandises';
UPDATE expense_categories SET account_code = '622' WHERE name = 'Services & Prestations';
UPDATE expense_categories SET account_code = '613' WHERE name = 'Loyer & Charges Locatives';
UPDATE expense_categories SET account_code = '626' WHERE name = 'Énergie & Télécommunications';
UPDATE expense_categories SET account_code = '625' WHERE name = 'Déplacements & Véhicules';
UPDATE expense_categories SET account_code = '625' WHERE name = 'Frais de Repas & Réception';
UPDATE expense_categories SET account_code = '616' WHERE name = 'Assurances & Frais Bancaires';
UPDATE expense_categories SET account_code = '635' WHERE name = 'Impôts, Taxes & Cotisations';
UPDATE expense_categories SET account_code = '606' WHERE name = 'Matériel & Équipements';
UPDATE expense_categories SET account_code = '623' WHERE name = 'Marketing & Communication';
UPDATE expense_categories SET account_code = '606' WHERE name = 'Logiciels & Abonnements';
UPDATE expense_categories SET account_code = '606' WHERE name = 'Autres charges';

-- Populate revenue categories with default accounting codes
UPDATE revenue_categories SET account_code = '707' WHERE name = 'Ventes de biens';
UPDATE revenue_categories SET account_code = '706' WHERE name = 'Prestations de services';
UPDATE revenue_categories SET account_code = '706' WHERE name = 'Abonnements & revenus récurrents';
UPDATE revenue_categories SET account_code = '758' WHERE name = 'Revenus annexes';
