/*
  # Sécuriser la génération de entry_number contre les collisions

  1. Correctif
    - Ajoute un verrou transactionnel `pg_advisory_xact_lock` dans `generate_entry_number()`
    - Clé de verrou basée sur `company_id + journal_id + fiscal_year`
    - Garantit l'atomicité en cas d'inserts concurrents

  2. Logique inchangée
    - Format conservé : `{CODE_JOURNAL}-{ANNEE}-{SEQUENCE}`
    - Scope conservé : par entreprise + journal + exercice
    - Triggers existants inchangés
    - Contraintes SQL inchangées

  3. Protection
    - Empêche les race conditions lors d'inserts simultanés
    - Le verrou est automatiquement libéré à la fin de la transaction
    - Aucun impact sur les performances en usage normal
*/

CREATE OR REPLACE FUNCTION generate_entry_number()
RETURNS TRIGGER AS $$
DECLARE
  journal_code text;
  next_num int;
  lock_key bigint;
BEGIN
  IF NEW.entry_number IS NOT NULL AND NEW.entry_number != '' THEN
    RETURN NEW;
  END IF;

  -- Générer une clé de verrou unique basée sur company_id + journal_id + fiscal_year
  -- hashtext() génère un hash stable pour la même combinaison
  lock_key := hashtext(NEW.company_id::text || '-' || NEW.journal_id::text || '-' || NEW.fiscal_year::text)::bigint;
  
  -- Acquérir un verrou transactionnel exclusif
  -- pg_advisory_xact_lock se libère automatiquement à la fin de la transaction
  PERFORM pg_advisory_xact_lock(lock_key);

  SELECT code INTO journal_code FROM journals WHERE id = NEW.journal_id;

  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM '[0-9]+$') AS int)), 0) + 1
  INTO next_num
  FROM accounting_entries
  WHERE company_id = NEW.company_id
    AND journal_id = NEW.journal_id
    AND fiscal_year = NEW.fiscal_year;

  NEW.entry_number := journal_code || '-' || NEW.fiscal_year || '-' || LPAD(next_num::text, 5, '0');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
