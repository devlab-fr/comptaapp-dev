/*
  # Protection des factures payées contre modification

  1. Protection facture
    - BEFORE UPDATE sur factures
    - Interdit modification statut si déjà 'payee'
    - Interdit modification montants si 'payee'
    - Interdit modification date_paiement si 'payee'
    - Autorise updated_at automatique

  2. Protection lignes
    - BEFORE INSERT/UPDATE/DELETE sur lignes_factures
    - Interdit toute modification si facture liée est 'payee'
*/

-- Fonction de protection facture
CREATE OR REPLACE FUNCTION prevent_paid_invoice_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Si la facture était déjà payée
  IF OLD.statut_paiement = 'payee' THEN
    
    -- Interdire changement de statut
    IF NEW.statut_paiement != 'payee' THEN
      RAISE EXCEPTION 'Cannot change status of paid invoice from "payee" to "%". Create a credit note instead.', NEW.statut_paiement;
    END IF;
    
    -- Interdire modification des montants
    IF NEW.montant_total_ht != OLD.montant_total_ht OR
       NEW.montant_total_tva != OLD.montant_total_tva OR
       NEW.montant_total_ttc != OLD.montant_total_ttc THEN
      RAISE EXCEPTION 'Cannot modify amounts of paid invoice. Create a credit note instead.';
    END IF;
    
    -- Interdire modification date_paiement
    IF NEW.date_paiement IS DISTINCT FROM OLD.date_paiement THEN
      RAISE EXCEPTION 'Cannot modify payment date of paid invoice.';
    END IF;
    
    -- Les autres champs (updated_at, etc.) sont autorisés
  END IF;
  
  RETURN NEW;
END;
$$;

-- Créer le trigger sur factures
DROP TRIGGER IF EXISTS trigger_prevent_paid_invoice_modification ON factures;

CREATE TRIGGER trigger_prevent_paid_invoice_modification
BEFORE UPDATE ON factures
FOR EACH ROW
WHEN (OLD.statut_paiement = 'payee')
EXECUTE FUNCTION prevent_paid_invoice_modification();

-- Fonction de protection lignes factures
CREATE OR REPLACE FUNCTION prevent_paid_invoice_lines_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_statut text;
BEGIN
  -- Récupérer le statut de la facture
  SELECT statut_paiement INTO v_statut
  FROM factures
  WHERE id = COALESCE(NEW.facture_id, OLD.facture_id);
  
  -- Si facture payée, interdire toute modification
  IF v_statut = 'payee' THEN
    RAISE EXCEPTION 'Cannot modify lines of paid invoice. Create a credit note instead.';
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Créer les triggers sur lignes_factures
DROP TRIGGER IF EXISTS trigger_prevent_paid_invoice_lines_insert ON lignes_factures;
DROP TRIGGER IF EXISTS trigger_prevent_paid_invoice_lines_update ON lignes_factures;
DROP TRIGGER IF EXISTS trigger_prevent_paid_invoice_lines_delete ON lignes_factures;

CREATE TRIGGER trigger_prevent_paid_invoice_lines_insert
BEFORE INSERT ON lignes_factures
FOR EACH ROW
EXECUTE FUNCTION prevent_paid_invoice_lines_modification();

CREATE TRIGGER trigger_prevent_paid_invoice_lines_update
BEFORE UPDATE ON lignes_factures
FOR EACH ROW
EXECUTE FUNCTION prevent_paid_invoice_lines_modification();

CREATE TRIGGER trigger_prevent_paid_invoice_lines_delete
BEFORE DELETE ON lignes_factures
FOR EACH ROW
EXECUTE FUNCTION prevent_paid_invoice_lines_modification();
