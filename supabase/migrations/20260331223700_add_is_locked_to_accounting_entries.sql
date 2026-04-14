/*
  # Système de verrouillage des écritures comptables

  1. Objectif
    - Permettre de valider/verrouiller une écriture comptable
    - Une écriture verrouillée devient non modifiable
    - Seules les écritures verrouillées sont utilisées pour TVA/Balance/Clôture

  2. Modifications
    - Ajout colonne `is_locked` sur `accounting_entries` (default false)
    - Ajout colonne `locked_at` pour traçabilité
    - Ajout colonne `locked_by` pour audit

  3. Comportement
    - Par défaut : is_locked = false (brouillon)
    - Bouton UI : "Verrouiller" → is_locked = true
    - Écritures verrouillées :
      - Non modifiables (UPDATE bloqué)
      - Non supprimables (DELETE bloqué)
      - Utilisées dans calculs officiels (TVA, Balance)

  4. Protection
    - RLS empêche modification/suppression si is_locked = true
    - Seul le verrouillage (false → true) est autorisé
    - Le déverrouillage nécessite un rôle spécifique (futur)

  5. Compatibilité
    - Écritures existantes : is_locked = false (brouillon)
    - Pas d'impact sur génération automatique
    - Compatible ACH + BQ

  6. Permissions
    - accountant : lecture seule (already restricted)
    - viewer : lecture seule (already restricted)
    - owner/admin : peuvent verrouiller
*/

-- Ajouter colonnes de verrouillage
ALTER TABLE accounting_entries 
ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS locked_at timestamptz,
ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id);

-- Index pour performance (filtrer écritures verrouillées)
CREATE INDEX IF NOT EXISTS idx_accounting_entries_is_locked 
ON accounting_entries(company_id, is_locked) 
WHERE is_locked = true;

-- Créer fonction de verrouillage
CREATE OR REPLACE FUNCTION lock_accounting_entry(
  p_entry_id uuid
)
RETURNS void AS $$
DECLARE
  v_entry accounting_entries;
  v_sum_debit numeric;
  v_sum_credit numeric;
BEGIN
  -- Récupérer l'écriture
  SELECT * INTO v_entry
  FROM accounting_entries
  WHERE id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Écriture comptable introuvable';
  END IF;

  -- Vérifier qu'elle n'est pas déjà verrouillée
  IF v_entry.is_locked THEN
    RAISE EXCEPTION 'Écriture déjà verrouillée';
  END IF;

  -- Vérifier que l'écriture est équilibrée
  SELECT 
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
  INTO v_sum_debit, v_sum_credit
  FROM accounting_lines 
  WHERE entry_id = p_entry_id;

  IF v_sum_debit != v_sum_credit THEN
    RAISE EXCEPTION 'Impossible de verrouiller une écriture déséquilibrée (débit: %, crédit: %)', v_sum_debit, v_sum_credit;
  END IF;

  IF v_sum_debit = 0 THEN
    RAISE EXCEPTION 'Impossible de verrouiller une écriture vide';
  END IF;

  -- Verrouiller l'écriture
  UPDATE accounting_entries
  SET 
    is_locked = true,
    locked_at = now(),
    locked_by = auth.uid()
  WHERE id = p_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Créer politique RLS : empêcher modification des écritures verrouillées

-- 1. Empêcher UPDATE des écritures verrouillées (sauf verrouillage lui-même)
DROP POLICY IF EXISTS "Users can update own company accounting entries non-locked" ON accounting_entries;

CREATE POLICY "Users can update own company accounting entries non-locked"
  ON accounting_entries
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id 
      FROM memberships 
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
    AND is_locked = false
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id 
      FROM memberships 
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- 2. Empêcher DELETE des écritures verrouillées
DROP POLICY IF EXISTS "Users can delete own company accounting entries non-locked" ON accounting_entries;

CREATE POLICY "Users can delete own company accounting entries non-locked"
  ON accounting_entries
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id 
      FROM memberships 
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
    AND is_locked = false
  );

-- 3. Empêcher modification des lignes d'écritures verrouillées
DROP POLICY IF EXISTS "Users can update own company accounting lines non-locked" ON accounting_lines;

CREATE POLICY "Users can update own company accounting lines non-locked"
  ON accounting_lines
  FOR UPDATE
  TO authenticated
  USING (
    entry_id IN (
      SELECT ae.id
      FROM accounting_entries ae
      JOIN memberships m ON m.company_id = ae.company_id
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND ae.is_locked = false
    )
  )
  WITH CHECK (
    entry_id IN (
      SELECT ae.id
      FROM accounting_entries ae
      JOIN memberships m ON m.company_id = ae.company_id
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND ae.is_locked = false
    )
  );

-- 4. Empêcher suppression des lignes d'écritures verrouillées
DROP POLICY IF EXISTS "Users can delete own company accounting lines non-locked" ON accounting_lines;

CREATE POLICY "Users can delete own company accounting lines non-locked"
  ON accounting_lines
  FOR DELETE
  TO authenticated
  USING (
    entry_id IN (
      SELECT ae.id
      FROM accounting_entries ae
      JOIN memberships m ON m.company_id = ae.company_id
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND ae.is_locked = false
    )
  );

/*
  COMPORTEMENT FINAL :

  1. Création écriture :
     - is_locked = false (brouillon)
     - Modifiable, supprimable

  2. Verrouillage :
     - Appeler lock_accounting_entry(entry_id)
     - is_locked = true
     - locked_at = now()
     - locked_by = user_id

  3. Après verrouillage :
     - UPDATE bloqué par RLS
     - DELETE bloqué par RLS
     - Lignes non modifiables
     - Utilisable dans TVA/Balance/Clôture

  4. Déverrouillage :
     - Non implémenté (nécessite rôle spécial)
     - Futur : fonction unlock_accounting_entry()

  5. Permissions :
     - owner/admin : peuvent créer, modifier, supprimer, verrouiller
     - accountant : lecture seule (pas de modification)
     - viewer : lecture seule (pas de modification)
*/
