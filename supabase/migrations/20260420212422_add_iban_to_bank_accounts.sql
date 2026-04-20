/*
  # Ajout de la colonne IBAN à bank_accounts

  1. Modifications
    - Ajout de la colonne `iban` (TEXT, nullable) sur `public.bank_accounts`
      - Permettra à terme d'identifier un compte bancaire réel de manière stable
        entre deux reconnexions Powens.

  2. Notes importantes
    1. Colonne ajoutée de manière non-destructive (IF NOT EXISTS).
    2. Aucune contrainte UNIQUE n'est créée à ce stade.
    3. Aucun backfill n'est effectué.
    4. Aucune autre table ni fonction n'est modifiée.
*/

ALTER TABLE public.bank_accounts
ADD COLUMN IF NOT EXISTS iban TEXT;
