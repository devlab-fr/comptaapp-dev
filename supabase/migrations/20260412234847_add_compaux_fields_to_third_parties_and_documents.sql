/*
  # FEC V2 Étape C — Bloc 1 : Champs CompAux

  ## Objectif
  Ajouter les colonnes nécessaires pour permettre la population de CompAuxNum / CompAuxLib
  dans l'export FEC, en liant les documents source au référentiel third_parties.

  ## Modifications

  ### 1. Table `third_parties`
  - Ajout colonne `code` (TEXT, nullable) : code auxiliaire comptable du tiers

  ### 2. Table `expense_documents`
  - Ajout colonne `third_party_id` (UUID, nullable, FK → third_parties.id ON DELETE SET NULL)
    Permet de lier une dépense à un tiers fournisseur du référentiel.

  ### 3. Table `revenue_documents`
  - Ajout colonne `third_party_id` (UUID, nullable, FK → third_parties.id ON DELETE SET NULL)
    Permet de lier un revenu manuel à un tiers client du référentiel.

  ## Notes importantes
  - Toutes les colonnes sont nullable : aucune donnée existante n'est affectée.
  - Aucun trigger modifié.
  - Aucune politique RLS modifiée.
  - Aucun backfill.
  - Aucun index.
  - Ne concerne pas invoice_recipients ni le module facturation.
  - Les revenus issus de facture (source_type = 'invoice') ne seront jamais peuplés via ce champ.
*/

ALTER TABLE third_parties
  ADD COLUMN IF NOT EXISTS code TEXT;

ALTER TABLE expense_documents
  ADD COLUMN IF NOT EXISTS third_party_id UUID REFERENCES third_parties(id) ON DELETE SET NULL;

ALTER TABLE revenue_documents
  ADD COLUMN IF NOT EXISTS third_party_id UUID REFERENCES third_parties(id) ON DELETE SET NULL;
