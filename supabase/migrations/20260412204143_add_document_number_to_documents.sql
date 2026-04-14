/*
  # Add document_number to expense_documents and revenue_documents

  ## Purpose
  FEC V2 Step B — adds a free-text reference field to both document tables
  so that a real PieceRef can be supplied for expenses, manual revenues,
  and their linked payment entries in the FEC export.

  ## Changes
  - `expense_documents`: new nullable TEXT column `document_number`
  - `revenue_documents`: new nullable TEXT column `document_number`

  ## Notes
  - Both columns are TEXT, nullable, no default, no constraint, no index
  - No backfill — existing rows keep NULL
  - No trigger, no UI, no FEC logic touched in this migration
  - Revenues created from paid invoices (source_type = 'invoice') are not
    affected: their PieceRef comes from the linked facture's numero_facture
*/

ALTER TABLE expense_documents
  ADD COLUMN IF NOT EXISTS document_number TEXT;

ALTER TABLE revenue_documents
  ADD COLUMN IF NOT EXISTS document_number TEXT;
