/*
  # Add category_id to lignes_factures

  1. Changes
    - Add `category_id` column to `lignes_factures` table (nullable for backward compatibility)
    - Add foreign key constraint to `revenue_categories(id)`
  
  2. Purpose
    - Enable category tracking per invoice line
    - Allow automatic category propagation from invoice to revenue document
  
  3. Compatibility
    - Column is nullable to preserve existing invoice lines
    - No data migration required
*/

-- Add category_id column to lignes_factures
ALTER TABLE lignes_factures 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES revenue_categories(id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_lignes_factures_category_id 
ON lignes_factures(category_id);
