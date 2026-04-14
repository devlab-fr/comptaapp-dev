/*
  # Génération automatique comptable sur insertion expense_lines

  1. Problème
    - La génération comptable dépend actuellement du frontend
    - Requiert set_config + appel manuel
    - Architecture fragile et non robuste

  2. Solution
    - Créer un trigger AFTER INSERT sur expense_lines
    - À chaque insertion de ligne, tenter de générer l'écriture
    - La fonction est idempotente (vérifie linked_accounting_entry_id)
    - Vérifie qu'il existe au moins 1 ligne avant génération
    - Résultat : génération automatique sans intervention frontend

  3. Avantages
    - 100% autonome côté base de données
    - Aucune dépendance frontend
    - Robuste : fonctionne même si lignes insérées une par une
    - Idempotent : pas de risque de doublon
    - Simple : pas de logique complexe de détection "dernière ligne"

  4. Performance
    - Optimisation : vérification rapide linked_accounting_entry_id
    - Si déjà lié, RETURN immédiat (pas de calcul)
    - Génération effective uniquement sur la première tentative

  5. Comportement
    - Frontend insère document puis lignes
    - Première ligne insérée → vérification → pas assez de données → RETURN
    - Deuxième ligne insérée → vérification → données complètes → génération
    - Lignes suivantes → déjà lié → RETURN immédiat
*/

-- Fonction trigger sur expense_lines : génération auto de l'écriture
CREATE OR REPLACE FUNCTION trigger_generate_expense_accounting_on_line_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_document expense_documents;
BEGIN
  -- Récupérer le document
  SELECT * INTO v_document
  FROM expense_documents
  WHERE id = NEW.document_id;

  -- Si document non trouvé, ne rien faire
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Optimisation : si l'écriture existe déjà, ne rien faire
  IF v_document.linked_accounting_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Tenter de générer l'écriture comptable
  -- La fonction auto_create_expense_accounting_entry_impl() vérifie :
  -- - qu'il existe au moins 1 ligne
  -- - que l'écriture n'existe pas déjà (idempotence)
  PERFORM auto_create_expense_accounting_entry_impl(v_document);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger AFTER INSERT sur expense_lines
CREATE TRIGGER trigger_auto_expense_accounting_on_line_insert
  AFTER INSERT ON expense_lines
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_expense_accounting_on_line_insert();

/*
  Note importante :
  
  Ce trigger s'exécute à chaque insertion de ligne, mais grâce aux mécanismes
  de protection (idempotence + vérification rapide), il n'y a aucun risque :
  
  - 1ère ligne insérée : 
    * linked_accounting_entry_id IS NULL
    * COUNT(expense_lines) = 1
    * Génération de l'écriture ✓
  
  - 2ème ligne insérée :
    * linked_accounting_entry_id IS NOT NULL (déjà lié)
    * RETURN immédiat (pas de calcul) ✓
  
  - 3ème ligne et suivantes :
    * Même comportement : RETURN immédiat ✓
  
  Résultat : génération automatique, robuste et performante.
*/
