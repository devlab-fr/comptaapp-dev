/*
  # Create justificatifs storage bucket

  1. Storage
    - Create 'justificatifs' bucket for storing receipts and supporting documents
    - Enable RLS on bucket
    - Add policies for company members to upload/view/delete their justificatifs
    
  2. Security
    - Authenticated users can upload files for their company
    - Authenticated users can view files for their company
    - Only owners and admins can delete files
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'justificatifs',
  'justificatifs',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can view justificatifs of their companies"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'justificatifs' AND
    (storage.foldername(name))[1] IN (
      SELECT c.id::text
      FROM companies c
      JOIN memberships m ON m.company_id = c.id
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can upload justificatifs for their companies"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'justificatifs' AND
    (storage.foldername(name))[1] IN (
      SELECT c.id::text
      FROM companies c
      JOIN memberships m ON m.company_id = c.id
      WHERE m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY "Users can update justificatifs for their companies"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'justificatifs' AND
    (storage.foldername(name))[1] IN (
      SELECT c.id::text
      FROM companies c
      JOIN memberships m ON m.company_id = c.id
      WHERE m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY "Owners and admins can delete justificatifs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'justificatifs' AND
    (storage.foldername(name))[1] IN (
      SELECT c.id::text
      FROM companies c
      JOIN memberships m ON m.company_id = c.id
      WHERE m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
    )
  );
