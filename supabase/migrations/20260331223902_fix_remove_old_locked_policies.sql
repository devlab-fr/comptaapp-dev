/*
  # Suppression des anciennes politiques avec colonne "locked"

  1. Problème
    - Anciennes politiques utilisent colonne `locked`
    - Nouvelles politiques utilisent colonne `is_locked`
    - Les deux coexistent → bypass des protections
    - RLS PERMISSIVE : une seule politique qui passe suffit

  2. Solution
    - Supprimer les anciennes politiques avec `locked`
    - Garder uniquement les nouvelles avec `is_locked`

  3. Politiques à supprimer
    - "Members can update unlocked entries" (locked = false)
    - "Members can delete unlocked entries" (locked = false)
*/

-- Supprimer les anciennes politiques
DROP POLICY IF EXISTS "Members can update unlocked entries" ON accounting_entries;
DROP POLICY IF EXISTS "Members can delete unlocked entries" ON accounting_entries;

/*
  Politiques actives après nettoyage :
  
  UPDATE :
    - "Users can update own company accounting entries non-locked"
    - Condition : is_locked = false
  
  DELETE :
    - "Users can delete own company accounting entries non-locked"
    - Condition : is_locked = false
  
  Résultat : protection effective contre modification d'écritures verrouillées
*/
