/*
  # Auto-generate accounting entries for expense documents

  Creates trigger function auto_create_expense_accounting_entry() and the
  trigger trigger_auto_expense_accounting_entry on expense_documents AFTER INSERT.

  Uses batch mode (app.batch_accounting_insert) to insert all lines before
  the balance check fires.
*/

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
  total_debit decimal(15,2);
  total_credit decimal(15,2);
BEGIN
  IF NEW.linked_accounting_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_fiscal_year := EXTRACT(YEAR FROM NEW.invoice_date);

  SELECT id INTO v_journal_id
  FROM journals
  WHERE company_id = NEW.company_id
    AND code = 'ACH'
    AND is_active = true
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_account_401_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '401'
    AND is_active = true
  LIMIT 1;

  IF v_account_401_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_account_44566_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '44566'
    AND is_active = true
  LIMIT 1;

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

      SELECT id INTO v_account_id
      FROM chart_of_accounts
      WHERE company_id = NEW.company_id
        AND code = v_line.account_code
        AND is_active = true
      LIMIT 1;

      IF v_account_id IS NOT NULL THEN
        INSERT INTO accounting_lines (
          entry_id, account_id, label, debit, credit, vat_rate, line_order
        ) VALUES (
          v_entry_id, v_account_id, v_line.description,
          v_line.amount_excl_vat, 0, v_line.vat_rate, v_line_counter
        );

        v_line_counter := v_line_counter + 1;

        IF v_line.vat_amount > 0 AND v_account_44566_id IS NOT NULL THEN
          INSERT INTO accounting_lines (
            entry_id, account_id, label, debit, credit, vat_rate, line_order
          ) VALUES (
            v_entry_id, v_account_44566_id,
            'TVA déductible - ' || v_line.description,
            v_line.vat_amount, 0, v_line.vat_rate, v_line_counter
          );
          v_line_counter := v_line_counter + 1;
        END IF;
      END IF;
    END LOOP;

    v_total_ttc := NEW.total_incl_vat;
    INSERT INTO accounting_lines (
      entry_id, account_id, label, debit, credit, line_order
    ) VALUES (
      v_entry_id, v_account_401_id, 'Fournisseur',
      0, v_total_ttc, v_line_counter + 1
    );

    PERFORM set_config('app.batch_accounting_insert', 'false', true);

    SELECT
      COALESCE(SUM(debit), 0),
      COALESCE(SUM(credit), 0)
    INTO total_debit, total_credit
    FROM accounting_lines
    WHERE entry_id = v_entry_id;

    IF total_debit != total_credit THEN
      RAISE EXCEPTION 'Écriture déséquilibrée: débit=% crédit=%', total_debit, total_credit;
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('app.batch_accounting_insert', 'false', true);
      RAISE;
  END;

  UPDATE expense_documents
  SET linked_accounting_entry_id = v_entry_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_expense_accounting_entry ON expense_documents;
CREATE TRIGGER trigger_auto_expense_accounting_entry
  AFTER INSERT ON expense_documents
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_expense_accounting_entry();
