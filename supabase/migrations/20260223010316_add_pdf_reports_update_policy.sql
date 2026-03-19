/*
  # Add UPDATE policy for pdf_reports bucket

  1. Problem
    - Bucket pdf_reports has INSERT and SELECT policies
    - MISSING UPDATE policy causes 403 errors during upload
    - Supabase Storage requires UPDATE permission for metadata operations

  2. Solution
    - Add UPDATE policy for pdf_reports bucket
    - Allow members to update PDFs in their company folders
    - Same condition as INSERT: first path segment must match user's company_id

  3. Security
    - Authenticated users only
    - Path validation: folder must match company_id from memberships
    - No public access
*/

-- Add UPDATE policy for pdf_reports bucket
CREATE POLICY "Members can update company PDFs"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'pdf_reports'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text
      FROM memberships
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'pdf_reports'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text
      FROM memberships
      WHERE user_id = auth.uid()
    )
  );
