/*
  # Add account_code mapping to expense_categories and revenue_categories

  Adds account_code column to both category tables and populates them
  with standard French PCG codes to enable automatic accounting entry generation.
*/

ALTER TABLE expense_categories
ADD COLUMN IF NOT EXISTS account_code TEXT;

ALTER TABLE revenue_categories
ADD COLUMN IF NOT EXISTS account_code TEXT;

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

UPDATE revenue_categories SET account_code = '707' WHERE name = 'Ventes de biens';
UPDATE revenue_categories SET account_code = '706' WHERE name = 'Prestations de services';
UPDATE revenue_categories SET account_code = '706' WHERE name = 'Abonnements & revenus récurrents';
UPDATE revenue_categories SET account_code = '758' WHERE name = 'Revenus annexes';
