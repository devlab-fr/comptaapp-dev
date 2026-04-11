/*
  # Bloquer définitivement les documents sans lignes avec status validated/paid

  1. Objectif
    - Empêcher qu'un document puisse être validated ou paid sans lignes
    - Protection 100% backend via triggers SQL
    - Éviter corruption des données TVA et KPI

  2. Règles métier implémentées
    - expense_document : INTERDIT accounting_status='validated' OU payment_status='paid' si 0 ligne
    - revenue_document : INTERDIT accounting_status='validated' OU payment_status='paid' si 0 ligne
    - Documents en brouillon (draft) sans lignes : AUTORISÉ
    - Documents avec ≥1 ligne + validated/paid : AUTORISÉ

  3. Triggers créés
    - `validate_expense_document_has_lines` : BEFORE INSERT OR UPDATE sur expense_documents
    - `validate_revenue_document_has_lines` : BEFORE INSERT OR UPDATE sur revenue_documents

  4. Cas gérés
    - INSERT direct avec status validated/paid sans ligne : BLOQUÉ
    - UPDATE vers validated/paid sans ligne : BLOQUÉ
    - UPDATE sans changement critique de statut : AUTORISÉ
    - Documents brouillon sans ligne : AUTORISÉ

  5. Sécurité
    - Aucune modification des structures existantes
    - Aucun impact sur triggers comptables (ACH/VT/BQ)
    - Aucune suppression de données
    - Message d'erreur clair pour le frontend
*/

-- ============================================
-- TRIGGER 1 : EXPENSE_DOCUMENTS
-- ============================================

CREATE OR REPLACE FUNCTION validate_expense_document_has_lines()
RETURNS TRIGGER AS $$
DECLARE
  line_count INTEGER;
BEGIN
  -- Vérifier seulement si le document devient validated OU paid
  IF (NEW.accounting_status = 'validated' OR NEW.payment_status = 'paid') THEN
    
    -- Compter les lignes existantes pour ce document
    SELECT COUNT(*) INTO line_count
    FROM expense_lines
    WHERE document_id = NEW.id;
    
    -- Si aucune ligne, bloquer l'opération
    IF line_count = 0 THEN
      RAISE EXCEPTION 'Impossible de valider ou payer un document sans lignes';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_expense_document_has_lines
  BEFORE INSERT OR UPDATE ON expense_documents
  FOR EACH ROW
  EXECUTE FUNCTION validate_expense_document_has_lines();

-- ============================================
-- TRIGGER 2 : REVENUE_DOCUMENTS
-- ============================================

CREATE OR REPLACE FUNCTION validate_revenue_document_has_lines()
RETURNS TRIGGER AS $$
DECLARE
  line_count INTEGER;
BEGIN
  -- Vérifier seulement si le document devient validated OU paid
  IF (NEW.accounting_status = 'validated' OR NEW.payment_status = 'paid') THEN
    
    -- Compter les lignes existantes pour ce document
    SELECT COUNT(*) INTO line_count
    FROM revenue_lines
    WHERE document_id = NEW.id;
    
    -- Si aucune ligne, bloquer l'opération
    IF line_count = 0 THEN
      RAISE EXCEPTION 'Impossible de valider ou payer un document sans lignes';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_revenue_document_has_lines
  BEFORE INSERT OR UPDATE ON revenue_documents
  FOR EACH ROW
  EXECUTE FUNCTION validate_revenue_document_has_lines();
