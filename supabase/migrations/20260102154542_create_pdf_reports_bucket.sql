/*
  # Créer le bucket Storage pour les PDFs archivés

  1. Création du bucket
    - Nom: pdf_reports
    - Visibilité: privé (public = false)
    - Limite de taille: 50 MB par fichier
    - Types autorisés: application/pdf

  2. Policies Storage
    - Les membres de l'entreprise peuvent uploader leurs PDFs
    - Les membres de l'entreprise peuvent lire leurs PDFs
    - Basé sur la relation memberships
*/

-- Créer le bucket s'il n'existe pas déjà
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdf_reports',
  'pdf_reports',
  false,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Policy pour permettre aux membres d'uploader des PDFs de leur entreprise
CREATE POLICY "Members can upload company PDFs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pdf_reports' AND
  (storage.foldername(name))[1] IN (
    SELECT company_id::text
    FROM memberships
    WHERE user_id = auth.uid()
  )
);

-- Policy pour permettre aux membres de lire les PDFs de leur entreprise
CREATE POLICY "Members can read company PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'pdf_reports' AND
  (storage.foldername(name))[1] IN (
    SELECT company_id::text
    FROM memberships
    WHERE user_id = auth.uid()
  )
);
