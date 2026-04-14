/*
  # Protection — Empêcher qu'un document validé ou payé perde toutes ses lignes

  1. Problème
    - Un document peut être validated ou paid
    - Puis toutes ses lignes peuvent être supprimées ou déplacées
    - Créant une incohérence métier/comptable

  2. Solution
    - Trigger BEFORE DELETE OR UPDATE sur expense_lines
    - Trigger BEFORE DELETE OR UPDATE sur revenue_lines
    - Vérifie si le document d'origine (OLD.document_id) serait laissé sans lignes
    - Bloque l'opération si le document est validated ou paid

  3. Logique
    - Pour DELETE : vérifie si c'est la dernière ligne du document parent
    - Pour UPDATE : vérifie si on change de document_id et que l'ancien document perd sa dernière ligne
    - Autorise l'opération si le document est en draft et unpaid

  4. Messages d'erreur
    - Expense : "Impossible de supprimer la dernière ligne d'un document validé ou payé"
    - Revenue : "Impossible de supprimer la dernière ligne d'un document validé ou payé"
*/

-- ============================================
-- FONCTION : Empêcher qu'un expense_document validated/paid perde toutes ses lignes
-- ============================================

CREATE OR REPLACE FUNCTION prevent_expense_document_losing_all_lines()
RETURNS TRIGGER AS $$
DECLARE
  v_document_accounting_status TEXT;
  v_document_payment_status TEXT;
  v_remaining_lines_count INTEGER;
  v_old_document_id UUID;
BEGIN
  -- Identifier le document d'origine concerné
  v_old_document_id := OLD.document_id;
  
  -- Récupérer les statuts du document d'origine
  SELECT accounting_status, payment_status
  INTO v_document_accounting_status, v_document_payment_status
  FROM expense_documents
  WHERE id = v_old_document_id;
  
  -- Si le document n'existe pas (ne devrait pas arriver), autoriser
  IF v_document_accounting_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Si le document est en brouillon ET non payé, autoriser toute opération
  IF v_document_accounting_status = 'draft' AND v_document_payment_status = 'unpaid' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Le document est validated OU paid, vérifier le nombre de lignes restantes
  
  -- Compter combien de lignes resteraient après l'opération
  IF TG_OP = 'DELETE' THEN
    -- Pour DELETE, compter les lignes actuelles moins celle qu'on supprime
    SELECT COUNT(*)
    INTO v_remaining_lines_count
    FROM expense_lines
    WHERE document_id = v_old_document_id
      AND id != OLD.id;
      
  ELSIF TG_OP = 'UPDATE' THEN
    -- Pour UPDATE, vérifier si on change de document
    IF NEW.document_id != OLD.document_id THEN
      -- On déplace la ligne vers un autre document
      -- Compter les lignes qui resteraient dans l'ancien document
      SELECT COUNT(*)
      INTO v_remaining_lines_count
      FROM expense_lines
      WHERE document_id = v_old_document_id
        AND id != OLD.id;
    ELSE
      -- Pas de changement de document, autoriser
      RETURN NEW;
    END IF;
    
  END IF;
  
  -- Si le nombre de lignes restantes serait 0, bloquer
  IF v_remaining_lines_count = 0 THEN
    RAISE EXCEPTION 'Impossible de supprimer la dernière ligne d''un document validé ou payé';
  END IF;
  
  -- Sinon autoriser l'opération
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FONCTION : Empêcher qu'un revenue_document validated/paid perde toutes ses lignes
-- ============================================

CREATE OR REPLACE FUNCTION prevent_revenue_document_losing_all_lines()
RETURNS TRIGGER AS $$
DECLARE
  v_document_accounting_status TEXT;
  v_document_payment_status TEXT;
  v_remaining_lines_count INTEGER;
  v_old_document_id UUID;
BEGIN
  -- Identifier le document d'origine concerné
  v_old_document_id := OLD.document_id;
  
  -- Récupérer les statuts du document d'origine
  SELECT accounting_status, payment_status
  INTO v_document_accounting_status, v_document_payment_status
  FROM revenue_documents
  WHERE id = v_old_document_id;
  
  -- Si le document n'existe pas (ne devrait pas arriver), autoriser
  IF v_document_accounting_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Si le document est en brouillon ET non payé, autoriser toute opération
  IF v_document_accounting_status = 'draft' AND v_document_payment_status = 'unpaid' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Le document est validated OU paid, vérifier le nombre de lignes restantes
  
  -- Compter combien de lignes resteraient après l'opération
  IF TG_OP = 'DELETE' THEN
    -- Pour DELETE, compter les lignes actuelles moins celle qu'on supprime
    SELECT COUNT(*)
    INTO v_remaining_lines_count
    FROM revenue_lines
    WHERE document_id = v_old_document_id
      AND id != OLD.id;
      
  ELSIF TG_OP = 'UPDATE' THEN
    -- Pour UPDATE, vérifier si on change de document
    IF NEW.document_id != OLD.document_id THEN
      -- On déplace la ligne vers un autre document
      -- Compter les lignes qui resteraient dans l'ancien document
      SELECT COUNT(*)
      INTO v_remaining_lines_count
      FROM revenue_lines
      WHERE document_id = v_old_document_id
        AND id != OLD.id;
    ELSE
      -- Pas de changement de document, autoriser
      RETURN NEW;
    END IF;
    
  END IF;
  
  -- Si le nombre de lignes restantes serait 0, bloquer
  IF v_remaining_lines_count = 0 THEN
    RAISE EXCEPTION 'Impossible de supprimer la dernière ligne d''un document validé ou payé';
  END IF;
  
  -- Sinon autoriser l'opération
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS : Activer les protections
-- ============================================

-- Trigger pour expense_lines
DROP TRIGGER IF EXISTS prevent_expense_losing_lines ON expense_lines;
CREATE TRIGGER prevent_expense_losing_lines
  BEFORE DELETE OR UPDATE ON expense_lines
  FOR EACH ROW
  EXECUTE FUNCTION prevent_expense_document_losing_all_lines();

-- Trigger pour revenue_lines
DROP TRIGGER IF EXISTS prevent_revenue_losing_lines ON revenue_lines;
CREATE TRIGGER prevent_revenue_losing_lines
  BEFORE DELETE OR UPDATE ON revenue_lines
  FOR EACH ROW
  EXECUTE FUNCTION prevent_revenue_document_losing_all_lines();
