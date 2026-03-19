/*
  # Create receipts storage bucket and add receipt columns

  1. Storage
    - Create "receipts" bucket (private) for storing receipt files
    - Add RLS policies for authenticated users to upload/read their company's receipts

  2. Schema Changes
    - Add `receipt_url` (text) to expenses table
    - Add `receipt_storage_path` (text) to expenses table
    - Add `receipt_filename` (text) to expenses table
    - Add `receipt_url` (text) to revenues table
    - Add `receipt_storage_path` (text) to revenues table
    - Add `receipt_filename` (text) to revenues table

  3. Security
    - Users can only upload/read receipts for companies they are members of
*/

-- Create receipts storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Add receipt columns to expenses table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'receipt_url'
  ) THEN
    ALTER TABLE expenses ADD COLUMN receipt_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'receipt_storage_path'
  ) THEN
    ALTER TABLE expenses ADD COLUMN receipt_storage_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'receipt_filename'
  ) THEN
    ALTER TABLE expenses ADD COLUMN receipt_filename text;
  END IF;
END $$;

-- Add receipt columns to revenues table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenues' AND column_name = 'receipt_url'
  ) THEN
    ALTER TABLE revenues ADD COLUMN receipt_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenues' AND column_name = 'receipt_storage_path'
  ) THEN
    ALTER TABLE revenues ADD COLUMN receipt_storage_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenues' AND column_name = 'receipt_filename'
  ) THEN
    ALTER TABLE revenues ADD COLUMN receipt_filename text;
  END IF;
END $$;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload receipts for their companies" ON storage.objects;
DROP POLICY IF EXISTS "Users can read receipts for their companies" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete receipts for their companies" ON storage.objects;

-- RLS Policies for receipts bucket
-- Users can upload receipts for companies they are members of
CREATE POLICY "Users can upload receipts for their companies"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] IN (
      SELECT company_id::text
      FROM memberships
      WHERE user_id = auth.uid()
    )
  );

-- Users can read receipts for companies they are members of
CREATE POLICY "Users can read receipts for their companies"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] IN (
      SELECT company_id::text
      FROM memberships
      WHERE user_id = auth.uid()
    )
  );

-- Users can delete receipts for companies they are members of
CREATE POLICY "Users can delete receipts for their companies"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] IN (
      SELECT company_id::text
      FROM memberships
      WHERE user_id = auth.uid()
    )
  );
