/*
  # Create powens_connections table

  ## Purpose
  Stores temporary Powens OAuth context before the first sync.
  At init time we do not yet know which bank accounts Powens will return,
  so we cannot write to bank_accounts. This table bridges the gap between
  the connect-init step and the connect-sync step.

  ## New Table: powens_connections
  - `id`                 — primary key (uuid)
  - `company_id`         — FK to companies, not null
  - `powens_user_id`     — Powens user identifier, filled after callback
  - `powens_auth_token`  — permanent token from Powens, filled after callback
  - `state`              — random opaque value used for CSRF validation (unique)
  - `status`             — lifecycle status: pending | connected | error
  - `created_at`         — creation timestamp
  - `updated_at`         — last update timestamp

  ## Security
  - RLS enabled
  - Only admin/owner of the company can insert or update
  - Only members of the company can select
  - No one can delete via RLS (cleanup handled server-side only)

  ## Notes
  - bank_accounts is NOT touched by this migration
  - bank_accounts will be populated only at sync time, once Powens returns real account data
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.powens_connections (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL,
  powens_user_id   BIGINT      NULL,
  powens_auth_token TEXT       NULL,
  state            TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'connected', 'error')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_powens_connections_company'
      AND conrelid = 'public.powens_connections'::regclass
  ) THEN
    ALTER TABLE public.powens_connections
      ADD CONSTRAINT fk_powens_connections_company
      FOREIGN KEY (company_id)
      REFERENCES public.companies(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_powens_connections_company_id
  ON public.powens_connections(company_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_powens_connections_state
  ON public.powens_connections(state);

ALTER TABLE public.powens_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view company powens connections"
  ON public.powens_connections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = powens_connections.company_id
        AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert company powens connections"
  ON public.powens_connections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = powens_connections.company_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can update company powens connections"
  ON public.powens_connections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = powens_connections.company_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = powens_connections.company_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('admin', 'owner')
    )
  );
