/*
  # Trigger de génération automatique de revenu pour facture payée

  1. Trigger
    - AFTER INSERT OR UPDATE sur factures
    - Se déclenche quand statut_paiement = 'payee'
    - Appelle create_revenue_from_paid_invoice()

  2. Cas couverts
    - Facture créée directement en 'payee'
    - Facture passant de 'brouillon' ou 'en_attente' à 'payee'
    - Ne se déclenche pas si déjà 'payee' avant UPDATE (évite doublons)
*/

CREATE OR REPLACE FUNCTION trigger_create_revenue_from_paid_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Vérifier que la facture est maintenant payée
  IF NEW.statut_paiement = 'payee' THEN
    -- Pour INSERT : OLD n'existe pas
    -- Pour UPDATE : vérifier que le statut a changé vers 'payee'
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.statut_paiement != 'payee') THEN
      -- Appeler la fonction de création de revenu
      PERFORM create_revenue_from_paid_invoice(NEW.id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Créer le trigger
DROP TRIGGER IF EXISTS trigger_facture_paid_create_revenue ON factures;

CREATE TRIGGER trigger_facture_paid_create_revenue
AFTER INSERT OR UPDATE OF statut_paiement, date_paiement
ON factures
FOR EACH ROW
WHEN (NEW.statut_paiement = 'payee')
EXECUTE FUNCTION trigger_create_revenue_from_paid_invoice();
