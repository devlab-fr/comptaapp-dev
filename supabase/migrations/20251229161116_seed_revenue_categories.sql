/*
  # Seed Revenue Categories and Subcategories

  ## Overview
  This migration seeds the database with 4 main revenue categories
  and their corresponding subcategories as defined in V1 specification.

  ## Categories (4 total)
  1. Ventes de biens
  2. Prestations de services
  3. Abonnements & revenus récurrents
  4. Revenus annexes

  Each category has multiple subcategories with appropriate sort order.

  ## Data Safety
  - Uses ON CONFLICT DO NOTHING to be idempotent
  - Can be run multiple times safely
*/

INSERT INTO revenue_categories (name, sort_order, is_active) VALUES
  ('Ventes de biens', 1, true),
  ('Prestations de services', 2, true),
  ('Abonnements & revenus récurrents', 3, true),
  ('Revenus annexes', 4, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Vente de marchandises', 1, true FROM revenue_categories WHERE name = 'Ventes de biens'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Vente de produits finis', 2, true FROM revenue_categories WHERE name = 'Ventes de biens'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Revente de biens', 3, true FROM revenue_categories WHERE name = 'Ventes de biens'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Prestation de service', 1, true FROM revenue_categories WHERE name = 'Prestations de services'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Main-d''œuvre', 2, true FROM revenue_categories WHERE name = 'Prestations de services'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Conseil / accompagnement', 3, true FROM revenue_categories WHERE name = 'Prestations de services'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Intervention technique', 4, true FROM revenue_categories WHERE name = 'Prestations de services'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Abonnements clients', 1, true FROM revenue_categories WHERE name = 'Abonnements & revenus récurrents'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Services récurrents', 2, true FROM revenue_categories WHERE name = 'Abonnements & revenus récurrents'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Maintenance', 3, true FROM revenue_categories WHERE name = 'Abonnements & revenus récurrents'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Frais refacturés', 1, true FROM revenue_categories WHERE name = 'Revenus annexes'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Commissions', 2, true FROM revenue_categories WHERE name = 'Revenus annexes'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO revenue_subcategories (category_id, name, sort_order, is_active)
SELECT id, 'Autres revenus', 3, true FROM revenue_categories WHERE name = 'Revenus annexes'
ON CONFLICT (category_id, name) DO NOTHING;