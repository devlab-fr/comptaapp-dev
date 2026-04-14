/*
  # Amélioration validation trigger expense_lines

  1. Problème
    - Le trigger se déclenche dès la première ligne insérée
    - Génère une écriture partielle avant que toutes les lignes soient insérées
    - Erreur : débit ≠ crédit (déséquilibre)

  2. Solution
    - Vérifier que la somme des lignes = total du document
    - Si somme(lignes.total_incl_vat) = document.total_incl_vat → complet
    - Sinon → lignes manquantes → ne rien faire (RETURN)

  3. Avantages
    - Génération uniquement quand toutes les lignes sont insérées
    - Validation automatique de cohérence
    - Pas de dépendance frontend

  4. Comportement
    - Ligne 1 insérée : somme=360, total=600 → incomplet → RETURN
    - Ligne 2 insérée : somme=600, total=600 → complet → génération ✓
*/

-- Fonction trigger améliorée avec validation complétude
CREATE OR REPLACE FUNCTION trigger_generate_expense_accounting_on_line_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_document expense_documents;
  v_sum_lines_ttc numeric;
BEGIN
  -- Récupérer le document
  SELECT * INTO v_document
  FROM expense_documents
  WHERE id = NEW.document_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Optimisation : si l'écriture existe déjà, ne rien faire
  IF v_document.linked_accounting_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- VALIDATION COMPLÉTUDE : vérifier que toutes les lignes sont insérées
  -- Somme des lignes doit égaler le total du document
  SELECT COALESCE(SUM(amount_incl_vat), 0) INTO v_sum_lines_ttc
  FROM expense_lines
  WHERE document_id = NEW.document_id;

  -- Si somme des lignes ≠ total document → lignes manquantes → RETURN
  IF v_sum_lines_ttc != v_document.total_incl_vat THEN
    RETURN NEW;
  END IF;

  -- Toutes les lignes sont insérées → générer l'écriture comptable
  PERFORM auto_create_expense_accounting_entry_impl(v_document);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/*
  Comportement amélioré :
  
  Document : 600 € TTC (2 lignes de 360 + 240)
  
  - Insert ligne 1 (360 €) :
    * Somme lignes = 360 €
    * Total document = 600 €
    * 360 ≠ 600 → RETURN (incomplet)
  
  - Insert ligne 2 (240 €) :
    * Somme lignes = 600 €
    * Total document = 600 €
    * 600 = 600 → Génération ✓
  
  Résultat : écriture complète et équilibrée
*/
