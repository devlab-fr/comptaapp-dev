/*
  # Supprimer le chemin obsolète de génération comptable

  1. Problème détecté
    - Conflit de migrations : deux chemins de génération comptable coexistent
    - Chemin obsolète (20260406182720) :
      * Trigger sur expense_documents AFTER INSERT
      * Fonction auto_create_expense_accounting_entry() inline
      * S'exécute AVANT l'insertion des expense_lines
      * Boucle FOR sur expense_lines vide → aucun débit créé
      * Résultat : écriture déséquilibrée (débit=0, crédit=120)
    
    - Chemin moderne (20260331220116 + 20260406185617) :
      * Trigger sur expense_lines AFTER INSERT
      * Fonction auto_create_expense_accounting_entry_impl()
      * S'exécute APRÈS l'insertion des expense_lines
      * Génération correcte avec support immediate/deferred

  2. Solution
    - Supprimer le trigger obsolète sur expense_documents
    - Restaurer la fonction wrapper auto_create_expense_accounting_entry()
      avec flag skip (version moderne de 20260331215003)
    - Garantir qu'un seul flux reste actif : trigger sur expense_lines

  3. Architecture finale
    - UN SEUL moteur comptable actif
    - Trigger : trigger_auto_expense_accounting_on_line_insert sur expense_lines
    - Fonction : auto_create_expense_accounting_entry_impl()
    - Support : immediate (512) et deferred (401)

  4. Sécurité
    - Garde anti-duplication : linked_accounting_entry_id
    - Validation : au moins 1 expense_line requise
    - Idempotence : multiple calls safe
    - Batch mode : équilibre vérifié à la fin
*/

-- Supprimer le trigger obsolète sur expense_documents
DROP TRIGGER IF EXISTS trigger_auto_expense_accounting_entry ON expense_documents;

-- Restaurer la fonction wrapper avec flag skip (version moderne)
CREATE OR REPLACE FUNCTION auto_create_expense_accounting_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_skip_trigger text;
BEGIN
  -- Vérifier si le flag skip est activé
  v_skip_trigger := current_setting('app.skip_expense_accounting_trigger', true);
  
  IF v_skip_trigger = 'true' THEN
    RETURN NEW;
  END IF;

  -- Appeler l'implémentation
  PERFORM auto_create_expense_accounting_entry_impl(NEW);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/*
  Note importante :
  
  Après cette migration, le flux de génération comptable est :
  
  1. Frontend : POST /expense_documents → INSERT expense_documents
  2. Aucun trigger sur expense_documents ne génère d'écriture
  3. Frontend : POST /expense_lines → INSERT expense_lines (une ou plusieurs)
  4. Trigger sur expense_lines : trigger_auto_expense_accounting_on_line_insert
  5. Fonction : auto_create_expense_accounting_entry_impl(document)
  6. Vérifications :
     - linked_accounting_entry_id IS NULL ?
     - COUNT(expense_lines) > 0 ?
  7. Génération :
     - Mode immediate : journal BQ, débits 6xx/TVA, crédit 512
     - Mode deferred : journal ACH, débits 6xx/TVA, crédit 401
  8. Résultat : écriture équilibrée avec tous les débits et crédits
  
  La fonction auto_create_expense_accounting_entry() reste définie pour :
  - Compatibilité avec d'éventuels appels manuels
  - Support du flag skip pour les opérations de maintenance
  - Mais aucun trigger ne l'appelle automatiquement sur expense_documents
*/
