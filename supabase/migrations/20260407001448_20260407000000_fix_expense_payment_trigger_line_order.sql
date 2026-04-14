/*
  # Fix critique : line_number → line_order dans trigger de paiement

  1. Problème identifié
    - La migration 20260406182752 utilise line_number
    - La colonne réelle s'appelle line_order
    - Cause : INSERT accounting_lines échoue silencieusement
    - Conséquence : payment_entry_id reste NULL, accounting_status reste 'draft'

  2. Correction
    - Remplacer line_number par line_order dans les deux INSERT
    - Recréer la fonction auto_create_expense_payment_entry()
    - Préserver toute la logique existante (gardes, batch mode, validation)

  3. Sécurité
    - Aucun changement de logique
    - Uniquement correction du nom de colonne
    - Compatibilité totale avec flux existant
*/

CREATE OR REPLACE FUNCTION auto_create_expense_payment_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_id uuid;
  v_entry_id uuid;
  v_fiscal_year int;
  v_account_512_id uuid;
  v_account_401_id uuid;
  v_payment_date date;
  v_total_ttc numeric;
BEGIN
  -- GARDE 1 : Vérifier si paiement déjà enregistré
  IF NEW.payment_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- GARDE 2 : Si mode immediate, ne JAMAIS créer d'écriture de paiement
  -- (l'écriture d'achat sert déjà de paiement)
  IF NEW.payment_timing = 'immediate' THEN
    RETURN NEW;
  END IF;

  -- GARDE 3 : Vérifier si le document est marqué comme payé
  IF NEW.payment_status IS NULL OR NEW.payment_status != 'paid' THEN
    RETURN NEW;
  END IF;

  -- Mode deferred : créer l'écriture de paiement habituelle
  v_payment_date := COALESCE(NEW.paid_at, NEW.invoice_date);
  v_fiscal_year := EXTRACT(YEAR FROM v_payment_date);
  v_total_ttc := NEW.total_incl_vat;

  -- Récupérer le journal BQ (Banque)
  SELECT id INTO v_journal_id
  FROM journals
  WHERE company_id = NEW.company_id
    AND code = 'BQ'
    AND is_active = true
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer le compte 512 (Banque)
  SELECT id INTO v_account_512_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '512'
    AND is_active = true
  LIMIT 1;

  -- Récupérer le compte 401 (Fournisseurs)
  SELECT id INTO v_account_401_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '401'
    AND is_active = true
  LIMIT 1;

  IF v_account_512_id IS NULL OR v_account_401_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Activer le batch mode pour éviter le check d'équilibre ligne par ligne
  PERFORM set_config('app.batch_accounting_insert', 'true', true);

  BEGIN
    -- Créer l'écriture de paiement
    INSERT INTO accounting_entries (
      company_id,
      fiscal_year,
      journal_id,
      entry_date,
      description,
      created_by
    ) VALUES (
      NEW.company_id,
      v_fiscal_year,
      v_journal_id,
      v_payment_date,
      'Paiement fournisseur',
      auth.uid()
    ) RETURNING id INTO v_entry_id;

    -- Ligne 1 : Débit 401 (Fournisseurs) - Apurement de la dette
    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      debit,
      credit,
      line_order
    ) VALUES (
      v_entry_id,
      v_account_401_id,
      v_total_ttc,
      0,
      1
    );

    -- Ligne 2 : Crédit 512 (Banque) - Sortie de trésorerie
    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      debit,
      credit,
      line_order
    ) VALUES (
      v_entry_id,
      v_account_512_id,
      0,
      v_total_ttc,
      2
    );

    -- Désactiver le batch mode
    PERFORM set_config('app.batch_accounting_insert', 'false', true);

    -- Lier l'écriture de paiement ET valider automatiquement
    IF v_entry_id IS NOT NULL THEN
      UPDATE expense_documents
      SET
        payment_entry_id = v_entry_id,
        accounting_status = 'validated'
      WHERE id = NEW.id
        AND accounting_status IS DISTINCT FROM 'validated';
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- En cas d'erreur, désactiver le batch mode et ignorer
    PERFORM set_config('app.batch_accounting_insert', 'false', true);
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recréer le trigger
DROP TRIGGER IF EXISTS trigger_auto_expense_payment_entry ON expense_documents;
CREATE TRIGGER trigger_auto_expense_payment_entry
  AFTER INSERT OR UPDATE OF payment_status, paid_at
  ON expense_documents
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_expense_payment_entry();
