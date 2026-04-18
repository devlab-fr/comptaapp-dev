/*
  # Préparation base Powens

  ## Résumé
  Migration minimale pour préparer l'intégration Powens (agrégation bancaire).

  ## Modifications

  ### 1. Table bank_accounts — nouvelles colonnes Powens
  - `powens_user_id` (BIGINT) : ID utilisateur côté Powens
  - `powens_auth_token` (TEXT) : token d'authentification permanent Powens
  - `powens_connection_id` (BIGINT) : ID de connexion bancaire côté Powens
  - `powens_last_sync_at` (TIMESTAMPTZ) : date de dernière synchronisation Powens

  ### 2. Table bank_statements — extension de la contrainte CHECK sur `source`
  - Suppression de l'ancienne contrainte CHECK sur `source` (csv, manual)
  - Ajout d'une nouvelle contrainte `bank_statements_source_check` : source IN ('csv', 'manual', 'powens')

  ## Notes
  - Aucune autre table ou contrainte n'est touchée
  - Migration non destructive (IF NOT EXISTS sur les colonnes)
*/

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS powens_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS powens_auth_token TEXT,
  ADD COLUMN IF NOT EXISTS powens_connection_id BIGINT,
  ADD COLUMN IF NOT EXISTS powens_last_sync_at TIMESTAMPTZ;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.bank_statements'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%source%'
    AND pg_get_constraintdef(oid) ILIKE '%csv%'
    AND pg_get_constraintdef(oid) ILIKE '%manual%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.bank_statements DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;

  ALTER TABLE public.bank_statements
    ADD CONSTRAINT bank_statements_source_check
    CHECK (source IN ('csv', 'manual', 'powens'));
END $$;
