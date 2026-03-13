/*
  # Système d'invitations pour comptables

  1. Nouvelle table
    - `invitations` : Invitations en attente pour rejoindre une entreprise
      - id (uuid, pk)
      - company_id (uuid, ref companies)
      - invited_by (uuid, ref auth.users) - qui a envoyé l'invitation
      - email (text) - email du comptable invité
      - role (membership_role) - rôle attribué (généralement 'accountant')
      - status (text) - 'pending', 'accepted', 'declined', 'expired'
      - token (text) - token unique pour validation
      - expires_at (timestamptz) - date d'expiration
      - created_at (timestamptz)

  2. Sécurité
    - RLS activée
    - Seuls owner/admin peuvent créer des invitations
    - Les utilisateurs peuvent voir les invitations de leurs entreprises
*/

-- Créer la table invitations
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role membership_role NOT NULL DEFAULT 'accountant',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, email)
);

-- Index pour recherche rapide par email et token
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_company_status ON invitations(company_id, status);

-- Activer RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Policy SELECT : Les membres de l'entreprise peuvent voir les invitations
CREATE POLICY "Members can view invitations of their companies"
  ON invitations FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

-- Policy INSERT : Seuls owner/admin peuvent créer des invitations
CREATE POLICY "Owners and admins can create invitations"
  ON invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE company_id = invitations.company_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy UPDATE : Seuls owner/admin peuvent modifier des invitations (ex: révoquer)
CREATE POLICY "Owners and admins can update invitations"
  ON invitations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE company_id = invitations.company_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE company_id = invitations.company_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy DELETE : Seuls owner/admin peuvent supprimer des invitations
CREATE POLICY "Owners and admins can delete invitations"
  ON invitations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE company_id = invitations.company_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Fonction pour accepter une invitation
CREATE OR REPLACE FUNCTION accept_invitation(invitation_token text)
RETURNS jsonb AS $$
DECLARE
  v_invitation invitations%ROWTYPE;
  v_user_id uuid;
  v_result jsonb;
BEGIN
  -- Récupérer l'utilisateur connecté
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Récupérer l'invitation
  SELECT * INTO v_invitation
  FROM invitations
  WHERE token = invitation_token
  AND status = 'pending'
  AND expires_at > now();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation not found or expired');
  END IF;
  
  -- Vérifier que l'email de l'utilisateur correspond
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = v_user_id
    AND email = v_invitation.email
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email mismatch');
  END IF;
  
  -- Créer le membership s'il n'existe pas déjà
  INSERT INTO memberships (user_id, company_id, role)
  VALUES (v_user_id, v_invitation.company_id, v_invitation.role)
  ON CONFLICT (user_id, company_id) DO NOTHING;
  
  -- Marquer l'invitation comme acceptée
  UPDATE invitations
  SET status = 'accepted'
  WHERE id = v_invitation.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'company_id', v_invitation.company_id,
    'role', v_invitation.role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour nettoyer les invitations expirées (à appeler périodiquement)
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE invitations
  SET status = 'expired'
  WHERE status = 'pending'
  AND expires_at < now();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
