/*
  # Génération automatique des écritures comptables pour les dépenses

  1. Objectif
    - Créer automatiquement une écriture comptable lors de la création d'une dépense
    - Générer les lignes comptables en utilisant le mapping catégorie → compte
    - Gérer la TVA déductible (compte 44566)
    - Utiliser le compte fournisseur 401 comme contrepartie

  2. Mécanisme
    - Trigger AFTER INSERT sur expense_documents
    - Création d'une écriture dans accounting_entries (journal ACH)
    - Génération des lignes dans accounting_lines :
      * Pour chaque expense_line : débit HT sur le compte de charge
      * Si TVA > 0 : débit TVA sur compte 44566
      * Contrepartie : crédit TTC sur compte 401

  3. Sécurité
    - Ne rien faire si l'écriture existe déjà (évite les doublons)
    - Vérifier que le journal ACH existe
    - Utiliser les comptes du plan comptable de l'entreprise

  4. Notes importantes
    - Compatible multi-lignes (plusieurs expense_lines)
    - Respecte le plan comptable français
    - Ne modifie aucune table existante
    - Utilise uniquement account_code déjà présent dans expense_categories
*/

-- Fonction pour créer automatiquement l'écriture comptable d'une dépense
CREATE OR REPLACE FUNCTION auto_create_expense_accounting_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_id uuid;
  v_entry_id uuid;
  v_fiscal_year int;
  v_account_401_id uuid;
  v_account_44566_id uuid;
  v_line record;
  v_account_id uuid;
  v_line_counter int := 0;
  v_total_ttc numeric;
BEGIN
  -- Ne rien faire si l'écriture existe déjà
  IF NEW.linked_accounting_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer l'exercice comptable (année de la date de facture)
  v_fiscal_year := EXTRACT(YEAR FROM NEW.invoice_date);

  -- Récupérer le journal ACH
  SELECT id INTO v_journal_id
  FROM journals
  WHERE company_id = NEW.company_id
    AND code = 'ACH'
    AND is_active = true
  LIMIT 1;

  -- Si le journal n'existe pas, on ne fait rien (sera géré manuellement)
  IF v_journal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer le compte 401 (Fournisseurs)
  SELECT id INTO v_account_401_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '401'
    AND is_active = true
  LIMIT 1;

  -- Si le compte 401 n'existe pas, on ne fait rien
  IF v_account_401_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer le compte 44566 (TVA déductible)
  SELECT id INTO v_account_44566_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '44566'
    AND is_active = true
  LIMIT 1;

  -- Créer l'écriture comptable
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
    NEW.invoice_date,
    'Dépense - ' || COALESCE((
      SELECT description 
      FROM expense_lines 
      WHERE document_id = NEW.id 
      ORDER BY line_order 
      LIMIT 1
    ), 'Sans description'),
    auth.uid()
  )
  RETURNING id INTO v_entry_id;

  -- Générer les lignes comptables pour chaque ligne de dépense
  FOR v_line IN
    SELECT 
      el.description,
      el.amount_excl_vat,
      el.vat_rate,
      el.vat_amount,
      ec.account_code
    FROM expense_lines el
    JOIN expense_categories ec ON ec.id = el.category_id
    WHERE el.document_id = NEW.id
    ORDER BY el.line_order
  LOOP
    v_line_counter := v_line_counter + 1;

    -- Récupérer l'ID du compte de charge
    SELECT id INTO v_account_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND code = v_line.account_code
      AND is_active = true
    LIMIT 1;

    -- Si le compte existe, créer la ligne de débit HT
    IF v_account_id IS NOT NULL THEN
      INSERT INTO accounting_lines (
        entry_id,
        account_id,
        label,
        debit,
        credit,
        vat_rate,
        line_order
      ) VALUES (
        v_entry_id,
        v_account_id,
        v_line.description,
        v_line.amount_excl_vat,
        0,
        v_line.vat_rate,
        v_line_counter
      );

      v_line_counter := v_line_counter + 1;

      -- Si TVA > 0, créer la ligne de débit TVA
      IF v_line.vat_amount > 0 AND v_account_44566_id IS NOT NULL THEN
        INSERT INTO accounting_lines (
          entry_id,
          account_id,
          label,
          debit,
          credit,
          vat_rate,
          line_order
        ) VALUES (
          v_entry_id,
          v_account_44566_id,
          'TVA déductible - ' || v_line.description,
          v_line.vat_amount,
          0,
          v_line.vat_rate,
          v_line_counter
        );

        v_line_counter := v_line_counter + 1;
      END IF;
    END IF;
  END LOOP;

  -- Ajouter la ligne de crédit sur le compte 401 (contrepartie TTC)
  v_total_ttc := NEW.total_incl_vat;

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
    'Fournisseur',
    0,
    v_total_ttc,
    v_line_counter + 1
  );

  -- Lier l'écriture au document
  UPDATE expense_documents
  SET linked_accounting_entry_id = v_entry_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger pour générer automatiquement l'écriture lors de la création d'une dépense
CREATE TRIGGER trigger_auto_expense_accounting_entry
  AFTER INSERT ON expense_documents
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_expense_accounting_entry();
