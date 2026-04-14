/*
  # Désactiver temporairement le check d'équilibre pendant batch insert

  1. Problème identifié
    - Le trigger `check_entry_balance` vérifie l'équilibre APRÈS CHAQUE ligne
    - Lors de l'insertion batch dans `auto_create_expense_accounting_entry`, la première ligne déséquilibre l'écriture
    - L'équilibre n'est atteint qu'à la fin de toutes les insertions

  2. Solution minimale
    - Modifier le trigger pour utiliser DEFERRABLE INITIALLY DEFERRED
    - Le check sera fait en fin de transaction, pas après chaque ligne
    - Aucune autre logique impactée

  3. Impact
    - Les écritures restent vérifiées pour l'équilibre
    - Le check se fait en fin de transaction
    - Compatible avec les insertions batch
*/

-- Supprimer l'ancien trigger
DROP TRIGGER IF EXISTS check_entry_balance_trigger ON accounting_lines;

-- Recréer avec CONSTRAINT TRIGGER pour permettre le DEFERRABLE
CREATE CONSTRAINT TRIGGER check_entry_balance_trigger
  AFTER INSERT OR UPDATE OR DELETE ON accounting_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_entry_balance();
