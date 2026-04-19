/*
  # Add powens_connection_id column to powens_connections

  ## Change
  - Adds `powens_connection_id` (bigint, nullable) to `public.powens_connections`

  ## Reason
  The edge function powens-connect-callback attempts to write this column on UPDATE.
  The column was absent, causing a SQL error and a 500 response.
  This patch unblocks the callback without touching any other code.
*/

ALTER TABLE public.powens_connections
  ADD COLUMN IF NOT EXISTS powens_connection_id BIGINT;
