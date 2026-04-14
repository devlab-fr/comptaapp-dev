/*
  # Fix accounting_entry_history pour gérer auth.uid() NULL

  1. Problème identifié
    - Le trigger `trigger_auto_expense_accounting_entry` utilise SECURITY DEFINER
    - Lors de l'insertion dans `accounting_entries`, auth.uid() retourne NULL
    - Le trigger `accounting_entry_history_trigger` tente d'insérer avec user_id = NULL
    - Échec : contrainte NOT NULL sur accounting_entry_history.user_id

  2. Solution minimale
    - Modifier la fonction `log_accounting_entry_action()` pour gérer auth.uid() IS NULL
    - Utiliser `created_by` de l'écriture comptable comme fallback
    - Ne PAS désactiver le trigger d'historique
    - Ne PAS supprimer la contrainte NOT NULL

  3. Impact
    - Le système d'historique reste actif
    - Les écritures créées automatiquement auront un user_id cohérent
    - Les écritures créées manuellement continueront d'utiliser auth.uid()
    - Aucune autre logique impactée
*/

-- Modifier la fonction pour gérer le cas auth.uid() NULL
CREATE OR REPLACE FUNCTION log_accounting_entry_action()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Récupérer auth.uid() ou utiliser created_by de l'écriture comme fallback
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    v_user_id := NEW.created_by;
  END IF;

  -- Si toujours NULL, on ne peut pas créer l'historique (cas impossible normalement)
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO accounting_entry_history (entry_id, user_id, action)
    VALUES (NEW.id, v_user_id, 'created');
  ELSIF TG_OP = 'UPDATE' AND OLD.locked = false AND NEW.locked = true THEN
    INSERT INTO accounting_entry_history (entry_id, user_id, action)
    VALUES (NEW.id, v_user_id, 'locked');
  ELSIF TG_OP = 'UPDATE' AND OLD.locked = true AND NEW.locked = false THEN
    INSERT INTO accounting_entry_history (entry_id, user_id, action)
    VALUES (NEW.id, v_user_id, 'unlocked');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
