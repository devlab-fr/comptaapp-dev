/*
  # Create temporary debug table for expense payment trigger diagnostics

  1. New Tables
    - `expense_payment_trigger_debug`
      - `expense_document_id` (uuid) - ID of the expense document being processed
      - `step` (text) - Step identifier where the error occurred
      - `sqlstate` (text) - SQL error state code
      - `sqlerrm` (text) - SQL error message

  2. Notes
    - TEMPORARY TABLE FOR DIAGNOSTICS ONLY
    - No RLS policies (diagnostic data)
    - No triggers
    - No indexes
    - No additional columns
*/

CREATE TABLE IF NOT EXISTS public.expense_payment_trigger_debug (
  expense_document_id uuid,
  step text,
  sqlstate text,
  sqlerrm text
);
