/*
  # Suppression contrainte UNIQUE sur pdf_documents pour permettre l'historique des versions

  ## Problème identifié
  - La contrainte UNIQUE(company_id, document_id) empêche l'insertion de nouvelles versions d'un même rapport
  - document_id est généré de manière déterministe (même ID pour même company/year/type)
  - Résultat : erreur "duplicate key" ou violation RLS lors de l'archivage de nouvelles versions

  ## Solution
  - Supprimer la contrainte UNIQUE(company_id, document_id)
  - Permettre plusieurs lignes avec le même document_id (historique des versions)
  - L'historique affiche toutes les versions triées par generated_at DESC
  - Le téléchargement pointe toujours vers la version la plus récente via storage_path

  ## Impact
  - Chaque génération crée une NOUVELLE ligne dans pdf_documents
  - L'upload Storage avec upsert:true écrase l'ancien fichier
  - L'historique conserve toutes les métadonnées de génération
  - Plus d'erreur RLS ou duplicate key lors de l'archivage

  ## Notes importantes
  - Le storage_path reste unique car il pointe vers le même fichier écrasé
  - La table peut maintenant stocker plusieurs entrées pour le même document logique
  - Les policies RLS restent inchangées (membres de l'entreprise)
*/

-- Supprimer la contrainte UNIQUE existante
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'pdf_documents_company_id_document_id_key'
    AND conrelid = 'pdf_documents'::regclass
  ) THEN
    ALTER TABLE pdf_documents DROP CONSTRAINT pdf_documents_company_id_document_id_key;
  END IF;
END $$;
