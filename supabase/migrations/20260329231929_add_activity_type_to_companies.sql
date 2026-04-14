/*
  # Add activity_type to companies

  1. Changes
    - Add `activity_type` column to `companies` table
      - Type: text
      - Nullable: yes
      - Expected values: 'service' or 'commerce'
  
  2. Security
    - No changes to RLS policies
    - No changes to existing data
*/

ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS activity_type text;