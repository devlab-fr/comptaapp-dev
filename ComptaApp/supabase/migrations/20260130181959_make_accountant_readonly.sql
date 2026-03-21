/*
  # Rendre les ACCOUNTANT en lecture seule

  1. Modifications
    - Mise à jour de la fonction `can_modify_company_data` pour exclure les ACCOUNTANT
    - Les ACCOUNTANT gardent l'accès en lecture via `has_company_access`
    - Seuls owner et admin peuvent modifier les données

  2. Sécurité
    - ACCOUNTANT = READ ONLY sur toutes les données comptables
    - owner/admin = accès complet (lecture + écriture)
    - viewer = lecture seule (comme avant)
*/

-- Modifier la fonction can_modify_company_data pour exclure les accountants
CREATE OR REPLACE FUNCTION can_modify_company_data(
  target_company_id uuid,
  is_locked boolean
)
RETURNS boolean AS $$
BEGIN
  -- Si verrouillé, seuls owner/admin peuvent modifier
  IF is_locked THEN
    RETURN EXISTS (
      SELECT 1 FROM memberships
      WHERE company_id = target_company_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    );
  END IF;
  
  -- Si non verrouillé, UNIQUEMENT owner/admin peuvent modifier (ACCOUNTANT EXCLU)
  RETURN EXISTS (
    SELECT 1 FROM memberships
    WHERE company_id = target_company_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Créer une fonction helper pour obtenir le rôle de l'utilisateur courant dans une entreprise
CREATE OR REPLACE FUNCTION get_user_company_role(target_company_id uuid)
RETURNS membership_role AS $$
DECLARE
  user_role membership_role;
BEGIN
  SELECT role INTO user_role
  FROM memberships
  WHERE company_id = target_company_id
  AND user_id = auth.uid()
  LIMIT 1;
  
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
