/*
  # Seed plan comptable français + trigger auto-seed par société

  1. Crée la fonction seed_company_chart_of_accounts(uuid)
  2. Crée la fonction auto_seed_chart_of_accounts() pour le trigger
  3. Crée le trigger trigger_auto_seed_chart_of_accounts sur companies AFTER INSERT
  4. Applique le seed à toutes les sociétés existantes
*/

CREATE OR REPLACE FUNCTION seed_company_chart_of_accounts(target_company_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO chart_of_accounts (company_id, code, name, type, is_default, is_active)
  VALUES
    (target_company_id, '101', 'Capital', 'passif', true, true),
    (target_company_id, '108', 'Compte de l''exploitant', 'passif', true, true)
  ON CONFLICT (company_id, code) DO NOTHING;

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

  INSERT INTO chart_of_accounts (company_id, code, name, type, is_default, is_active)
  VALUES
    (target_company_id, '512', 'Banque', 'actif', true, true),
    (target_company_id, '530', 'Caisse', 'actif', true, true)
  ON CONFLICT (company_id, code) DO NOTHING;

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

CREATE OR REPLACE FUNCTION auto_seed_chart_of_accounts()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_company_chart_of_accounts(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_seed_chart_of_accounts ON companies;
CREATE TRIGGER trigger_auto_seed_chart_of_accounts
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION auto_seed_chart_of_accounts();

DO $$
DECLARE
  company_record RECORD;
BEGIN
  FOR company_record IN SELECT id FROM companies
  LOOP
    PERFORM seed_company_chart_of_accounts(company_record.id);
  END LOOP;
END $$;
