/*
  # Migrate Existing Expenses to Document Structure

  ## Overview
  This migration converts all existing single-line expenses into the new
  document-based multi-line structure. Each existing expense becomes:
  - One expense_document with totals
  - One expense_line with the expense details

  ## Data Safety
  - Non-destructive: Original `expenses` table remains untouched
  - Idempotent: Can be run multiple times safely
  - Preserves all data: company_id, invoice_date, amounts, categories

  ## Process
  1. For each expense in `expenses` table:
     - Create a document in `expense_documents` with the expense totals
     - Create a line in `expense_lines` with the expense details
     - Maintain the original created_at timestamp
*/

DO $$
DECLARE
  expense_record RECORD;
  new_document_id uuid;
BEGIN
  FOR expense_record IN 
    SELECT 
      id,
      company_id,
      invoice_date,
      description,
      category_id,
      subcategory_id,
      amount_excl_vat,
      vat_rate,
      vat_amount,
      amount_incl_vat,
      created_at
    FROM expenses
    WHERE NOT EXISTS (
      SELECT 1 FROM expense_lines el
      JOIN expense_documents ed ON ed.id = el.document_id
      WHERE ed.company_id = expenses.company_id
        AND ed.invoice_date = expenses.invoice_date
        AND el.description = expenses.description
        AND el.amount_excl_vat = expenses.amount_excl_vat
    )
  LOOP
    INSERT INTO expense_documents (
      company_id,
      invoice_date,
      total_excl_vat,
      total_vat,
      total_incl_vat,
      created_at
    ) VALUES (
      expense_record.company_id,
      expense_record.invoice_date,
      expense_record.amount_excl_vat,
      expense_record.vat_amount,
      expense_record.amount_incl_vat,
      expense_record.created_at
    )
    RETURNING id INTO new_document_id;

    INSERT INTO expense_lines (
      document_id,
      description,
      category_id,
      subcategory_id,
      amount_excl_vat,
      vat_rate,
      vat_amount,
      amount_incl_vat,
      line_order,
      created_at
    ) VALUES (
      new_document_id,
      expense_record.description,
      expense_record.category_id,
      expense_record.subcategory_id,
      expense_record.amount_excl_vat,
      expense_record.vat_rate,
      expense_record.vat_amount,
      expense_record.amount_incl_vat,
      0,
      expense_record.created_at
    );
  END LOOP;
END $$;