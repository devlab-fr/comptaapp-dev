/*
  # Add description column to expenses table

  ## Changes
  - Add `description` column to `expenses` table
    - Type: text
    - Nullable: true (to avoid breaking existing data)
    - Default: null

  This allows expenses to have a description/label without requiring a supplier.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'description'
  ) THEN
    ALTER TABLE expenses ADD COLUMN description text;
  END IF;
END $$;