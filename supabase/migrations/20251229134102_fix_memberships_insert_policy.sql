/*
  # Correction de la policy INSERT pour memberships
  
  ## Problème
  La policy actuelle bloque la création du premier membership lors de la création d'une entreprise,
  car elle requiert que l'utilisateur soit déjà owner/admin de l'entreprise.
  
  ## Solution
  Permettre à un utilisateur authentifié de s'ajouter lui-même comme membre d'une entreprise.
  Les autres membres ne peuvent être ajoutés que par les owners/admins.
  
  ## Changements
  - DROP de l'ancienne policy "Owners and admins can insert memberships"
  - Création de deux nouvelles policies :
    1. "Users can add themselves to companies" : permet de s'ajouter soi-même
    2. "Owners and admins can add other members" : permet aux owners/admins d'ajouter d'autres membres
*/

-- Supprimer l'ancienne policy
DROP POLICY IF EXISTS "Owners and admins can insert memberships" ON memberships;

-- Permettre aux utilisateurs de s'ajouter eux-mêmes à une entreprise
CREATE POLICY "Users can add themselves to companies"
  ON memberships FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Permettre aux owners et admins d'ajouter d'autres membres
CREATE POLICY "Owners and admins can add other members"
  ON memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id != auth.uid() AND (
      has_company_role(company_id, 'owner') OR
      has_company_role(company_id, 'admin')
    )
  );
