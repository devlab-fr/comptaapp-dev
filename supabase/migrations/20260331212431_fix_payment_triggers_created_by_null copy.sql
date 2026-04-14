/*
  # Fix created_by dans les triggers de paiement

  1. Problème
    - Les fonctions auto_create_revenue_payment_entry() et auto_create_expense_payment_entry()
    - Utilisent COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    - Mais cet UUID n'existe pas dans la table users
    - Cause une erreur de contrainte de clé étrangère

  2. Solution
    - Utiliser NULL au lieu d'un UUID faux
    - La colonne created_by accepte NULL (is_nullable = YES)
    - Plus cohérent : si auth.uid() est NULL, on met NULL
*/

-- Recréer la fonction revenue avec created_by NULL si auth.uid() NULL
CREATE OR REPLACE FUNCTION auto_create_revenue_payment_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_id uuid;
  v_entry_id uuid;
  v_fiscal_year int;
  v_account_512_id uuid;
  v_account_411_id uuid;
  v_payment_date date;
  v_total_ttc numeric;
BEGIN
  IF NEW.payment_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS NULL OR NEW.payment_status != 'paid' THEN
    RETURN NEW;
  END IF;

  v_payment_date := COALESCE(NEW.paid_at, NEW.invoice_date);
  v_fiscal_year := EXTRACT(YEAR FROM v_payment_date);
  v_total_ttc := NEW.total_incl_vat;

  SELECT id INTO v_journal_id
  FROM journals
  WHERE company_id = NEW.company_id
    AND code = 'BQ'
    AND is_active = true
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_account_512_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '512'
    AND is_active = true
  LIMIT 1;

  SELECT id INTO v_account_411_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '411'
    AND is_active = true
  LIMIT 1;

  IF v_account_512_id IS NULL OR v_account_411_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.batch_accounting_insert', 'true', true);

  BEGIN
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
      'Paiement - Revenu',
      auth.uid()  -- NULL si pas de session
    ) RETURNING id INTO v_entry_id;

    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      debit,
      credit,
      line_number
    ) VALUES (
      v_entry_id,
      v_account_512_id,
      v_total_ttc,
      0,
      1
    );

    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      debit,
      credit,
      line_number
    ) VALUES (
      v_entry_id,
      v_account_411_id,
      0,
      v_total_ttc,
      2
    );

    PERFORM set_config('app.batch_accounting_insert', 'false', true);

    UPDATE revenue_documents
    SET payment_entry_id = v_entry_id
    WHERE id = NEW.id;

  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.batch_accounting_insert', 'false', true);
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recréer la fonction expense avec created_by NULL si auth.uid() NULL
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
  IF NEW.payment_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS NULL OR NEW.payment_status != 'paid' THEN
    RETURN NEW;
  END IF;

  v_payment_date := COALESCE(NEW.paid_at, NEW.invoice_date);
  v_fiscal_year := EXTRACT(YEAR FROM v_payment_date);
  v_total_ttc := NEW.total_incl_vat;

  SELECT id INTO v_journal_id
  FROM journals
  WHERE company_id = NEW.company_id
    AND code = 'BQ'
    AND is_active = true
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_account_512_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '512'
    AND is_active = true
  LIMIT 1;

  SELECT id INTO v_account_401_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '401'
    AND is_active = true
  LIMIT 1;

  IF v_account_512_id IS NULL OR v_account_401_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.batch_accounting_insert', 'true', true);

  BEGIN
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
      'Paiement - Dépense',
      auth.uid()  -- NULL si pas de session
    ) RETURNING id INTO v_entry_id;

    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      debit,
      credit,
      line_number
    ) VALUES (
      v_entry_id,
      v_account_401_id,
      v_total_ttc,
      0,
      1
    );

    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      debit,
      credit,
      line_number
    ) VALUES (
      v_entry_id,
      v_account_512_id,
      0,
      v_total_ttc,
      2
    );

    PERFORM set_config('app.batch_accounting_insert', 'false', true);

    UPDATE expense_documents
    SET payment_entry_id = v_entry_id
    WHERE id = NEW.id;

  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.batch_accounting_insert', 'false', true);
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
