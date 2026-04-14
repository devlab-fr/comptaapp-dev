/*
  # Patch: synchroniser payment_entry_id lors du retour à payment_status != 'paid' — dépenses

  ## Problème corrigé
  La fonction trigger `auto_create_expense_payment_entry` gérait uniquement la création
  de l'écriture de paiement (passage à 'paid') mais ne nettoyait rien lors du retour
  à payment_status = 'unpaid' ou NULL.
  Résultat : payment_entry_id restait renseigné alors que payment_status = 'unpaid',
  créant une incohérence de données et une UI contradictoire.

  ## Comportement ajouté (GARDE 3 étendue)
  Quand payment_status IS NULL ou != 'paid' :
  - Si payment_entry_id IS NULL → rien à faire, RETURN NEW
  - Si payment_entry_id IS NOT NULL → auditer l'écriture liée :
    - Vérifier que l'écriture appartient à la même entreprise
    - Vérifier que le journal est 'BQ' (écriture de paiement, pas d'achat)
    - Vérifier que l'écriture n'est pas verrouillée (is_locked = false)
    - Vérifier que l'écriture n'est pas rapprochée bancairement (bank_statement_line_id IS NULL)
    - Si toutes les conditions sont remplies : supprimer l'écriture et remettre payment_entry_id = NULL
    - Sinon : ne rien supprimer (sécurité absolue), laisser l'état en place

  ## Tables modifiées
  - Aucune table modifiée structurellement
  - Fonction `auto_create_expense_payment_entry` remplacée

  ## Sécurité
  - Aucune écriture verrouillée ne sera supprimée
  - Aucune écriture rapprochée bancairement ne sera supprimée
  - Aucune écriture d'achat (journal != 'BQ') ne sera supprimée
  - En cas de doute sur l'identification, le trigger ne fait rien
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
  v_existing_journal_code text;
  v_existing_is_locked boolean;
  v_existing_bank_reconciled boolean;
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
    -- Pas payé : si payment_entry_id IS NULL, rien à faire
    IF OLD.payment_entry_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- payment_entry_id est renseigné (vestige d'un ancien paiement) :
    -- auditer l'écriture avant toute action
    SELECT
      j.code,
      ae.is_locked,
      (ae.bank_statement_line_id IS NOT NULL)
    INTO
      v_existing_journal_code,
      v_existing_is_locked,
      v_existing_bank_reconciled
    FROM accounting_entries ae
    JOIN journals j ON j.id = ae.journal_id
    WHERE ae.id = OLD.payment_entry_id
      AND ae.company_id = NEW.company_id;

    -- Sécurité : si l'écriture est introuvable, verrouillée, rapprochée, ou pas BQ → ne rien faire
    IF NOT FOUND
      OR v_existing_journal_code != 'BQ'
      OR v_existing_is_locked = true
      OR v_existing_bank_reconciled = true
    THEN
      RETURN NEW;
    END IF;

    -- L'écriture est identifiée comme une écriture de paiement auto-générée non protégée :
    -- dissocier d'abord, puis supprimer
    UPDATE expense_documents
    SET payment_entry_id = NULL
    WHERE id = NEW.id;

    DELETE FROM accounting_entries
    WHERE id = OLD.payment_entry_id;

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
      label,
      debit,
      credit,
      line_order
    ) VALUES (
      v_entry_id,
      v_account_401_id,
      'Paiement fournisseur',
      v_total_ttc,
      0,
      1
    );

    -- Ligne 2 : Crédit 512 (Banque) - Sortie de trésorerie
    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      label,
      debit,
      credit,
      line_order
    ) VALUES (
      v_entry_id,
      v_account_512_id,
      'Paiement fournisseur',
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
    PERFORM set_config('app.batch_accounting_insert', 'false', true);
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
