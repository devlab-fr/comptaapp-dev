/*
  # Seed Expense Categories and Subcategories

  ## Overview
  This migration seeds the database with 12 main expense categories
  and their corresponding subcategories as defined in V1 specification.

  ## Categories (12 total)
  1. Achats & Marchandises
  2. Services & Prestations
  3. Loyer & Charges Locatives
  4. Énergie & Télécommunications
  5. Déplacements & Véhicules
  6. Frais de Repas & Réception
  7. Assurances & Frais Bancaires
  8. Impôts, Taxes & Cotisations
  9. Matériel & Équipements
  10. Marketing & Communication
  11. Logiciels & Abonnements
  12. Autres charges

  Each category has multiple subcategories with appropriate sort order.

  ## Data Safety
  - Uses ON CONFLICT DO NOTHING to be idempotent
  - Can be run multiple times safely
*/

-- Insert main categories
INSERT INTO expense_categories (name, sort_order, is_active) VALUES
  ('Achats & Marchandises', 1, true),
  ('Services & Prestations', 2, true),
  ('Loyer & Charges Locatives', 3, true),
  ('Énergie & Télécommunications', 4, true),
  ('Déplacements & Véhicules', 5, true),
  ('Frais de Repas & Réception', 6, true),
  ('Assurances & Frais Bancaires', 7, true),
  ('Impôts, Taxes & Cotisations', 8, true),
  ('Matériel & Équipements', 9, true),
  ('Marketing & Communication', 10, true),
  ('Logiciels & Abonnements', 11, true),
  ('Autres charges', 12, true)
ON CONFLICT (name) DO NOTHING;

-- Insert subcategories for Category 1: Achats & Marchandises
INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Achats de marchandises', 1, true FROM expense_categories WHERE name = 'Achats & Marchandises'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Matières premières', 2, true FROM expense_categories WHERE name = 'Achats & Marchandises'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Fournitures liées à l''activité', 3, true FROM expense_categories WHERE name = 'Achats & Marchandises'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Sous-traitance directe', 4, true FROM expense_categories WHERE name = 'Achats & Marchandises'
ON CONFLICT (category_id, name) DO NOTHING;

-- Insert subcategories for Category 2: Services & Prestations
INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Honoraires (comptable, avocat, consultant)', 1, true FROM expense_categories WHERE name = 'Services & Prestations'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Prestations externes', 2, true FROM expense_categories WHERE name = 'Services & Prestations'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Services informatiques', 3, true FROM expense_categories WHERE name = 'Services & Prestations'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Services administratifs', 4, true FROM expense_categories WHERE name = 'Services & Prestations'
ON CONFLICT (category_id, name) DO NOTHING;

-- Insert subcategories for Category 3: Loyer & Charges Locatives
INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Loyer', 1, true FROM expense_categories WHERE name = 'Loyer & Charges Locatives'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Charges locatives', 2, true FROM expense_categories WHERE name = 'Loyer & Charges Locatives'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Charges de copropriété', 3, true FROM expense_categories WHERE name = 'Loyer & Charges Locatives'
ON CONFLICT (category_id, name) DO NOTHING;

-- Insert subcategories for Category 4: Énergie & Télécommunications
INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Électricité', 1, true FROM expense_categories WHERE name = 'Énergie & Télécommunications'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Gaz', 2, true FROM expense_categories WHERE name = 'Énergie & Télécommunications'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Eau', 3, true FROM expense_categories WHERE name = 'Énergie & Télécommunications'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Téléphone', 4, true FROM expense_categories WHERE name = 'Énergie & Télécommunications'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Internet', 5, true FROM expense_categories WHERE name = 'Énergie & Télécommunications'
ON CONFLICT (category_id, name) DO NOTHING;

-- Insert subcategories for Category 5: Déplacements & Véhicules
INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Carburant', 1, true FROM expense_categories WHERE name = 'Déplacements & Véhicules'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Péages', 2, true FROM expense_categories WHERE name = 'Déplacements & Véhicules'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Parking', 3, true FROM expense_categories WHERE name = 'Déplacements & Véhicules'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Transport (train, avion, taxi)', 4, true FROM expense_categories WHERE name = 'Déplacements & Véhicules'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Entretien véhicule', 5, true FROM expense_categories WHERE name = 'Déplacements & Véhicules'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Location de véhicule', 6, true FROM expense_categories WHERE name = 'Déplacements & Véhicules'
ON CONFLICT (category_id, name) DO NOTHING;

-- Insert subcategories for Category 6: Frais de Repas & Réception
INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Repas professionnels', 1, true FROM expense_categories WHERE name = 'Frais de Repas & Réception'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Frais de restauration', 2, true FROM expense_categories WHERE name = 'Frais de Repas & Réception'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Réceptions clients', 3, true FROM expense_categories WHERE name = 'Frais de Repas & Réception'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Événements professionnels', 4, true FROM expense_categories WHERE name = 'Frais de Repas & Réception'
ON CONFLICT (category_id, name) DO NOTHING;

-- Insert subcategories for Category 7: Assurances & Frais Bancaires
INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Assurance professionnelle', 1, true FROM expense_categories WHERE name = 'Assurances & Frais Bancaires'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Assurance véhicule', 2, true FROM expense_categories WHERE name = 'Assurances & Frais Bancaires'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Frais bancaires', 3, true FROM expense_categories WHERE name = 'Assurances & Frais Bancaires'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Commissions', 4, true FROM expense_categories WHERE name = 'Assurances & Frais Bancaires'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Intérêts bancaires', 5, true FROM expense_categories WHERE name = 'Assurances & Frais Bancaires'
ON CONFLICT (category_id, name) DO NOTHING;

-- Insert subcategories for Category 8: Impôts, Taxes & Cotisations
INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Cotisations sociales', 1, true FROM expense_categories WHERE name = 'Impôts, Taxes & Cotisations'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Taxes professionnelles', 2, true FROM expense_categories WHERE name = 'Impôts, Taxes & Cotisations'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'CFE', 3, true FROM expense_categories WHERE name = 'Impôts, Taxes & Cotisations'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Taxes non récupérables', 4, true FROM expense_categories WHERE name = 'Impôts, Taxes & Cotisations'
ON CONFLICT (category_id, name) DO NOTHING;

-- Insert subcategories for Category 9: Matériel & Équipements
INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Petit matériel', 1, true FROM expense_categories WHERE name = 'Matériel & Équipements'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Matériel informatique', 2, true FROM expense_categories WHERE name = 'Matériel & Équipements'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Mobilier', 3, true FROM expense_categories WHERE name = 'Matériel & Équipements'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Outillage', 4, true FROM expense_categories WHERE name = 'Matériel & Équipements'
ON CONFLICT (category_id, name) DO NOTHING;

-- Insert subcategories for Category 10: Marketing & Communication
INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Publicité', 1, true FROM expense_categories WHERE name = 'Marketing & Communication'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Marketing digital', 2, true FROM expense_categories WHERE name = 'Marketing & Communication'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Réseaux sociaux', 3, true FROM expense_categories WHERE name = 'Marketing & Communication'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Impression / supports', 4, true FROM expense_categories WHERE name = 'Marketing & Communication'
ON CONFLICT (category_id, name) DO NOTHING;

-- Insert subcategories for Category 11: Logiciels & Abonnements
INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Logiciels', 1, true FROM expense_categories WHERE name = 'Logiciels & Abonnements'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'SaaS', 2, true FROM expense_categories WHERE name = 'Logiciels & Abonnements'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Abonnements professionnels', 3, true FROM expense_categories WHERE name = 'Logiciels & Abonnements'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Hébergement / cloud', 4, true FROM expense_categories WHERE name = 'Logiciels & Abonnements'
ON CONFLICT (category_id, name) DO NOTHING;

-- Insert subcategories for Category 12: Autres charges
INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Charges exceptionnelles', 1, true FROM expense_categories WHERE name = 'Autres charges'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Dépenses diverses', 2, true FROM expense_categories WHERE name = 'Autres charges'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO expense_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Ajustements', 3, true FROM expense_categories WHERE name = 'Autres charges'
ON CONFLICT (category_id, name) DO NOTHING;