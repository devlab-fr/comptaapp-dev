/*
  # Création table pdf_documents pour archivage PDF

  1. Nouvelle table
    - `pdf_documents`
      - `id` (uuid, primary key)
      - `company_id` (uuid, not null) - Référence à la société
      - `fiscal_year` (integer, not null) - Année fiscale du rapport
      - `report_type` (text, not null) - Type de rapport (vat_monthly, vat_quarterly, vat_annual, income_statement, balance_sheet, ag_report)
      - `period_key` (text, nullable) - Clé de période (ex: "2025-01" pour mensuel, "2025-Q1" pour trimestriel, "2025" pour annuel)
      - `document_id` (text, not null) - Identifiant unique déterministe du document (généré par generateDocumentId)
      - `storage_path` (text, not null) - Chemin complet du fichier dans Supabase Storage
      - `file_name` (text, not null) - Nom du fichier affiché à l'utilisateur
      - `mime_type` (text, default "application/pdf")
      - `file_size` (bigint, nullable) - Taille du fichier en octets
      - `checksum_sha256` (text, nullable) - Hash SHA-256 du fichier pour vérification d'intégrité
      - `generated_at` (timestamptz, default now()) - Date et heure de génération
      - `generated_by` (uuid, nullable) - Utilisateur qui a généré le rapport
      - `version` (text, default "V1") - Version du format de document
      - UNIQUE(company_id, document_id) - Garantit qu'un document avec les mêmes paramètres n'est stocké qu'une fois

  2. Sécurité
    - Activer RLS sur `pdf_documents`
    - Politique SELECT : Membres de l'entreprise peuvent consulter les PDFs de leur entreprise
    - Politique INSERT : Membres de l'entreprise peuvent créer des PDFs pour leur entreprise
    - Politique UPDATE/DELETE : Interdites (archivage lecture seule)

  3. Notes importantes
    - Le bucket Supabase Storage "pdf_reports" doit être créé manuellement ou via l'application
    - Le stockage suit la structure: /{company_id}/{fiscal_year}/{report_type}/{document_id}.pdf
    - La contrainte UNIQUE garantit qu'à données identiques, un seul PDF est stocké
    - Les PDFs sont en lecture seule une fois créés (pas de UPDATE/DELETE)
*/

-- Créer la table pdf_documents
CREATE TABLE IF NOT EXISTS pdf_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_year int NOT NULL CHECK (fiscal_year >= 2000),
  report_type text NOT NULL CHECK (report_type IN ('vat_monthly', 'vat_quarterly', 'vat_annual', 'income_statement', 'balance_sheet', 'ag_report')),
  period_key text,
  document_id text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text DEFAULT 'application/pdf',
  file_size bigint,
  checksum_sha256 text,
  generated_at timestamptz DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  version text DEFAULT 'V1',
  UNIQUE(company_id, document_id)
);

-- Activer RLS
ALTER TABLE pdf_documents ENABLE ROW LEVEL SECURITY;

-- Politique SELECT: Les membres de l'entreprise peuvent consulter les PDFs de leur entreprise
CREATE POLICY "Members can view company PDFs"
  ON pdf_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = pdf_documents.company_id
      AND memberships.user_id = auth.uid()
    )
  );

-- Politique INSERT: Les membres de l'entreprise peuvent créer des PDFs pour leur entreprise
CREATE POLICY "Members can create company PDFs"
  ON pdf_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = pdf_documents.company_id
      AND memberships.user_id = auth.uid()
    )
  );

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_pdf_documents_company_year 
  ON pdf_documents(company_id, fiscal_year DESC);

CREATE INDEX IF NOT EXISTS idx_pdf_documents_generated_at 
  ON pdf_documents(generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_pdf_documents_document_id 
  ON pdf_documents(document_id);
