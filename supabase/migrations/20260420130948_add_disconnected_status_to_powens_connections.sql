/*
  # Add 'disconnected' status to powens_connections

  ## Changes
  - Modifies the CHECK constraint on `powens_connections.status`
    to allow the new value 'disconnected'

  ## Before
    CHECK (status IN ('pending', 'connected', 'error'))

  ## After
    CHECK (status IN ('pending', 'connected', 'error', 'disconnected'))
*/

ALTER TABLE powens_connections
  DROP CONSTRAINT IF EXISTS powens_connections_status_check;

ALTER TABLE powens_connections
  ADD CONSTRAINT powens_connections_status_check
  CHECK (status IN ('pending', 'connected', 'error', 'disconnected'));
