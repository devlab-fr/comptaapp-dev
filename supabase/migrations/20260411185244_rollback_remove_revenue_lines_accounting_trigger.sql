/*
  # Rollback — suppression du trigger comptable sur revenue_lines

  ## Contexte
  Le trigger `trigger_auto_revenue_accounting_entry_on_line` sur `revenue_lines`
  a été identifié comme défectueux : il crée une écriture comptable partielle
  à la première ligne insérée, puis l'anti-duplication bloque tous les appels suivants.

  ## Modifications
  1. Suppression du trigger `trigger_auto_revenue_accounting_entry_on_line` sur `revenue_lines`
  2. Suppression de la fonction wrapper `auto_create_revenue_accounting_entry_from_line`

  ## Résultat
  - Aucun trigger comptable actif sur `revenue_lines`
  - Retour à un état neutre sans nouveau mécanisme
*/

DROP TRIGGER IF EXISTS trigger_auto_revenue_accounting_entry_on_line ON revenue_lines;

DROP FUNCTION IF EXISTS auto_create_revenue_accounting_entry_from_line();
