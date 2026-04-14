/*
  # Fix auto_create_revenue_accounting_entry_impl — missing description field

  ## Problem
  The INSERT INTO accounting_entries was missing the `description` column (NOT NULL, no default).
  The value 'Recette' was being sent to `label` (nullable) while `description` remained NULL,
  triggering error code 23502 (not-null constraint violation).

  ## Fix
  Add `description` to the INSERT column list with value 'Recette'.
  `label` is kept as-is since it is a separate nullable column.
*/

CREATE OR REPLACE FUNCTION auto_create_revenue_accounting_entry_impl(p_revenue revenue_documents)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
v_entry_id uuid;
v_account_id uuid;
v_account_411_id uuid;
v_account_512_id uuid;
v_account_44571_id uuid;
v_line record;
v_line_counter int := 0;
v_journal_id uuid;
v_journal_code text;
total_debit numeric;
total_credit numeric;
v_existing_entry_id uuid;
v_is_immediate boolean;
BEGIN
SELECT id INTO v_existing_entry_id
FROM accounting_entries
WHERE company_id = p_revenue.company_id
AND source_document_id = p_revenue.id
AND source_document_type = 'revenue'
AND is_locked = false
LIMIT 1;

IF v_existing_entry_id IS NOT NULL THEN
RETURN;
END IF;

v_is_immediate := COALESCE(p_revenue.payment_timing, 'deferred') = 'immediate';

IF v_is_immediate THEN
SELECT id, code INTO v_journal_id, v_journal_code
FROM journals
WHERE company_id = p_revenue.company_id
AND code IN ('BQ', 'VT')
ORDER BY CASE code WHEN 'BQ' THEN 1 WHEN 'VT' THEN 2 ELSE 3 END
LIMIT 1;
ELSE
SELECT id, code INTO v_journal_id, v_journal_code
FROM journals
WHERE company_id = p_revenue.company_id
AND code = 'VT'
LIMIT 1;
END IF;

IF v_journal_id IS NULL THEN
RETURN;
END IF;

SELECT id INTO v_account_411_id
FROM chart_of_accounts
WHERE company_id = p_revenue.company_id
AND code = '411'
AND is_active = true
LIMIT 1;

SELECT id INTO v_account_512_id
FROM chart_of_accounts
WHERE company_id = p_revenue.company_id
AND code = '512'
AND is_active = true
LIMIT 1;

SELECT id INTO v_account_44571_id
FROM chart_of_accounts
WHERE company_id = p_revenue.company_id
AND code = '44571'
AND is_active = true
LIMIT 1;

IF v_is_immediate THEN
IF v_account_512_id IS NULL AND v_account_411_id IS NULL THEN
RETURN;
END IF;
ELSE
IF v_account_411_id IS NULL THEN
RETURN;
END IF;
END IF;

PERFORM set_config('app.batch_accounting_insert', 'true', true);

INSERT INTO accounting_entries (
company_id,
journal_id,
entry_date,
description,
label,
source_document_id,
source_document_type,
created_by,
is_locked
) VALUES (
p_revenue.company_id,
v_journal_id,
p_revenue.invoice_date,
'Recette',
'Recette',
p_revenue.id,
'revenue',
NULL,
false
)
RETURNING id INTO v_entry_id;

IF v_is_immediate THEN
v_account_id := COALESCE(v_account_512_id, v_account_411_id);
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
'Recette',
p_revenue.total_incl_vat,
0,
0,
1
);
ELSE
IF v_account_411_id IS NOT NULL THEN
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
v_account_411_id,
'Recette',
p_revenue.total_incl_vat,
0,
0,
1
);
END IF;
END IF;

v_line_counter := 1;

FOR v_line IN
SELECT
rl.description,
rl.amount_excl_vat,
rl.vat_rate,
rl.vat_amount,
rc.account_code
FROM revenue_lines rl
JOIN revenue_categories rc ON rc.id = rl.category_id
WHERE rl.document_id = p_revenue.id
ORDER BY rl.line_order
LOOP
v_line_counter := v_line_counter + 1;

SELECT id INTO v_account_id
FROM chart_of_accounts
WHERE company_id = p_revenue.company_id
AND code = v_line.account_code
AND is_active = true
LIMIT 1;

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
0,
v_line.amount_excl_vat,
v_line.vat_rate,
v_line_counter
);

v_line_counter := v_line_counter + 1;

IF v_line.vat_amount > 0 AND v_account_44571_id IS NOT NULL THEN
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
v_account_44571_id,
'TVA collectée - ' || v_line.description,
0,
v_line.vat_amount,
v_line.vat_rate,
v_line_counter
);
END IF;
END IF;
END LOOP;

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

IF v_is_immediate THEN
UPDATE revenue_documents
SET
payment_status = 'paid',
accounting_status = 'validated'
WHERE id = p_revenue.id
AND payment_timing = 'immediate';
END IF;

END;
$$;
