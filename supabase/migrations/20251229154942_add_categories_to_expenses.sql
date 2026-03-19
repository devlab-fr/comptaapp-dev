/*
  # Add Category Columns to Expenses

  ## Changes
  - Add `category_id` column to `expenses` table
    - Type: uuid
    - Nullable: true (to preserve existing data)
    - References: expense_categories(id) ON DELETE RESTRICT
    - Note: UI will make this required for new expenses
  
  - Add `subcategory_id` column to `expenses` table
    - Type: uuid
    - Nullable: true (optional field)
    - References: expense_subcategories(id) ON DELETE RESTRICT

  ## Data Safety
  - Both columns nullable to avoid breaking existing expenses
  - ON DELETE RESTRICT prevents accidental deletion of categories in use
  - No data loss, backward compatible
*/

DO $$
BEGIN
  -- Add category_id column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE expenses 
    ADD COLUMN category_id uuid REFERENCES expense_categories(id) ON DELETE RESTRICT;
  END IF;

  -- Add subcategory_id column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'subcategory_id'
  ) THEN
    ALTER TABLE expenses 
    ADD COLUMN subcategory_id uuid REFERENCES expense_subcategories(id) ON DELETE RESTRICT;
  END IF;
END $$;