/*
  # Ajouter source_invoice_id à revenue_documents

  1. Modifications
    - Ajouter colonne `source_invoice_id` (uuid nullable)
    - FK vers factures(id) ON DELETE RESTRICT
    - Index sur source_invoice_id
    - Contrainte CHECK : si source_type = 'invoice' alors source_invoice_id NOT NULL
    - Contrainte CHECK : si source_type IN ('manual','cash') alors source_invoice_id NULL
    - Contrainte UNIQUE partielle pour empêcher doublons sur factures

  2. Sécurité
    - RESTRICT empêche suppression facture si revenu lié existe
    - UNIQUE partielle garantit un seul revenu par facture
*/

-- Ajouter la colonne source_invoice_id
ALTER TABLE revenue_documents
ADD COLUMN IF NOT EXISTS source_invoice_id uuid;

-- Ajouter FK vers factures
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'revenue_documents_source_invoice_id_fkey'
      AND table_name = 'revenue_documents'
  ) THEN
    ALTER TABLE revenue_documents
    ADD CONSTRAINT revenue_documents_source_invoice_id_fkey
    FOREIGN KEY (source_invoice_id)
    REFERENCES factures(id)
    ON DELETE RESTRICT;
  END IF;
END $$;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_revenue_documents_source_invoice_id
ON revenue_documents(source_invoice_id);

-- Contrainte de cohérence : si invoice alors source_invoice_id obligatoire
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'revenue_documents_invoice_source_check'
      AND table_name = 'revenue_documents'
  ) THEN
    ALTER TABLE revenue_documents
    ADD CONSTRAINT revenue_documents_invoice_source_check
    CHECK (
      (source_type = 'invoice' AND source_invoice_id IS NOT NULL) OR
      (source_type IN ('manual', 'cash') AND source_invoice_id IS NULL)
    );
  END IF;
END $$;

-- Contrainte UNIQUE partielle : un seul revenu par facture
CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_documents_unique_invoice
ON revenue_documents(source_invoice_id)
WHERE source_type = 'invoice' AND source_invoice_id IS NOT NULL;
