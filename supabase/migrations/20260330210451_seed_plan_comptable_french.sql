/*
  # Seed du plan comptable français simplifié

  1. Objectif
    Peupler automatiquement la table `chart_of_accounts` avec un plan comptable
    de base adapté aux indépendants, auto-entrepreneurs, et petites sociétés.

  2. Comptes créés
    - CLASSE 1 : Capitaux (101, 108)
    - CLASSE 4 : Tiers et TVA (401, 411, 421, 431, 437, 44566, 44571, 44551, 44567, 455)
    - CLASSE 5 : Trésorerie (512, 530)
    - CLASSE 6 : Charges (601, 606, 611, 613, 615, 616, 622, 623, 625, 626, 627, 635, 641, 645)
    - CLASSE 7 : Produits (701, 706, 707, 708, 758)

  3. Règles
    - Les comptes sont créés pour CHAQUE société existante
    - Flag `is_default = true` pour les comptes du plan standard
    - Vérification pour éviter les doublons (ON CONFLICT DO NOTHING)

  4. Notes
    - Plan comptable adapté aux TPE/PME françaises
    - Comptes essentiels pour la gestion courante
    - Compatible avec les obligations fiscales françaises
*/

-- Fonction pour peupler le plan comptable d'une société
CREATE OR REPLACE FUNCTION seed_company_chart_of_accounts(target_company_id uuid)
RETURNS void AS $$
BEGIN
  -- CLASSE 1 - CAPITAUX
  INSERT INTO chart_of_accounts (company_id, code, name, type, is_default, is_active)
  VALUES
    (target_company_id, '101', 'Capital', 'passif', true, true),
    (target_company_id, '108', 'Compte de l''exploitant', 'passif', true, true)
  ON CONFLICT (company_id, code) DO NOTHING;

  -- CLASSE 4 - TIERS
  INSERT INTO chart_of_accounts (company_id, code, name, type, is_default, is_active)
  VALUES
    (target_company_id, '401', 'Fournisseurs', 'passif', true, true),
    (target_company_id, '411', 'Clients', 'actif', true, true),
    (target_company_id, '421', 'Personnel - Rémunérations dues', 'passif', true, true),
    (target_company_id, '431', 'Sécurité sociale', 'passif', true, true),
    (target_company_id, '437', 'Autres organismes sociaux', 'passif', true, true),
    (target_company_id, '44566', 'TVA déductible', 'actif', true, true),
    (target_company_id, '44571', 'TVA collectée', 'passif', true, true),
    (target_company_id, '44551', 'TVA à décaisser', 'passif', true, true),
    (target_company_id, '44567', 'Crédit de TVA', 'actif', true, true),
    (target_company_id, '455', 'Compte courant d''associé', 'passif', true, true)
  ON CONFLICT (company_id, code) DO NOTHING;

  -- CLASSE 5 - TRÉSORERIE
  INSERT INTO chart_of_accounts (company_id, code, name, type, is_default, is_active)
  VALUES
    (target_company_id, '512', 'Banque', 'actif', true, true),
    (target_company_id, '530', 'Caisse', 'actif', true, true)
  ON CONFLICT (company_id, code) DO NOTHING;

  -- CLASSE 6 - CHARGES
  INSERT INTO chart_of_accounts (company_id, code, name, type, is_default, is_active)
  VALUES
    (target_company_id, '601', 'Achats stockés - Matières premières', 'charge', true, true),
    (target_company_id, '606', 'Achats non stockés - Fournitures', 'charge', true, true),
    (target_company_id, '611', 'Sous-traitance générale', 'charge', true, true),
    (target_company_id, '613', 'Locations', 'charge', true, true),
    (target_company_id, '615', 'Entretien et réparations', 'charge', true, true),
    (target_company_id, '616', 'Primes d''assurances', 'charge', true, true),
    (target_company_id, '622', 'Honoraires', 'charge', true, true),
    (target_company_id, '623', 'Publicité et relations publiques', 'charge', true, true),
    (target_company_id, '625', 'Déplacements, missions et réceptions', 'charge', true, true),
    (target_company_id, '626', 'Frais postaux et télécommunications', 'charge', true, true),
    (target_company_id, '627', 'Services bancaires et assimilés', 'charge', true, true),
    (target_company_id, '635', 'Impôts, taxes et versements assimilés', 'charge', true, true),
    (target_company_id, '641', 'Rémunérations du personnel', 'charge', true, true),
    (target_company_id, '645', 'Charges de sécurité sociale et prévoyance', 'charge', true, true)
  ON CONFLICT (company_id, code) DO NOTHING;

  -- CLASSE 7 - PRODUITS
  INSERT INTO chart_of_accounts (company_id, code, name, type, is_default, is_active)
  VALUES
    (target_company_id, '701', 'Ventes de produits finis', 'produit', true, true),
    (target_company_id, '706', 'Prestations de services', 'produit', true, true),
    (target_company_id, '707', 'Ventes de marchandises', 'produit', true, true),
    (target_company_id, '708', 'Produits des activités annexes', 'produit', true, true),
    (target_company_id, '758', 'Produits divers de gestion courante', 'produit', true, true)
  ON CONFLICT (company_id, code) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Appliquer le seed à toutes les sociétés existantes
DO $$
DECLARE
  company_record RECORD;
  total_companies int := 0;
BEGIN
  FOR company_record IN SELECT id FROM companies
  LOOP
    PERFORM seed_company_chart_of_accounts(company_record.id);
    total_companies := total_companies + 1;
  END LOOP;

  RAISE NOTICE 'Plan comptable peuplé pour % société(s)', total_companies;
END $$;

-- Trigger pour peupler automatiquement le plan comptable lors de la création d'une société
CREATE OR REPLACE FUNCTION auto_seed_chart_of_accounts()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_company_chart_of_accounts(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger sur la table companies
DROP TRIGGER IF EXISTS trigger_auto_seed_chart_of_accounts ON companies;
CREATE TRIGGER trigger_auto_seed_chart_of_accounts
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION auto_seed_chart_of_accounts();