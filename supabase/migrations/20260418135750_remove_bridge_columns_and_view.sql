/*
  # Nettoyage final Bridge

  Suppression de tous les artefacts Bridge restants en base :

  1. Vue supprimée
    - `bank_accounts_safe` — vue exposant les colonnes bridge_* (plus utilisée par le frontend)

  2. Colonnes supprimées de `bank_accounts`
    - `bridge_item_id`
    - `bridge_account_id`
    - `bridge_access_token`
    - `bridge_refresh_token`
    - `bridge_token_expires_at`
    - `bridge_last_sync_at`
    - `bridge_user_uuid`

  Aucun autre objet SQL n'est modifié.
*/

DROP VIEW IF EXISTS public.bank_accounts_safe;

ALTER TABLE public.bank_accounts
  DROP COLUMN IF EXISTS bridge_item_id,
  DROP COLUMN IF EXISTS bridge_account_id,
  DROP COLUMN IF EXISTS bridge_access_token,
  DROP COLUMN IF EXISTS bridge_refresh_token,
  DROP COLUMN IF EXISTS bridge_token_expires_at,
  DROP COLUMN IF EXISTS bridge_last_sync_at,
  DROP COLUMN IF EXISTS bridge_user_uuid;
