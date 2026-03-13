/*
  # Add source_type column to revenue_documents

  1. Changes
    - Add `source_type` column to `revenue_documents` table
      - Type: TEXT
      - NOT NULL with DEFAULT 'manual'
      - CHECK constraint: values must be 'manual', 'cash', or 'invoice'
      - Index on (company_id, source_type) for efficient filtering
  
  2. Behavior
    - All existing records automatically receive 'manual' as default value
    - No data loss, no breaking changes
    - 'invoice' value reserved for future compatibility only
  
  3. Security
    - No RLS policy changes needed (existing policies continue to work)
*/

-- Add source_type column with default value
ALTER TABLE revenue_documents 
ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual' 
CHECK (source_type IN ('manual', 'cash', 'invoice'));

-- Add index for efficient filtering by company and source type
CREATE INDEX idx_revenue_documents_source_type 
  ON revenue_documents(company_id, source_type);
