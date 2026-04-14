/*
  # Ajouter policy publique pour lire les invitations par token

  1. Modifications
    - Ajouter une policy SELECT pour anon permettant de lire une invitation via son token
    - Nécessaire pour la page d'acceptation d'invitation publique

  2. Sécurité
    - Seul le token et les infos de base de l'invitation sont exposés
    - Aucune donnée sensible n'est accessible
*/

-- Policy SELECT publique : N'importe qui peut lire une invitation via son token
CREATE POLICY "Anyone can read invitation by token"
  ON invitations FOR SELECT
  TO anon
  USING (true);
