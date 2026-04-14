/*
  # Créer fonction recompute_revenue_accounting_entry

  ## Contexte
  Fonction backend dédiée pour régénérer proprement la comptabilisation
  d'un revenu existant après modification (EditRevenuePage).

  ## Problème résolu
  - auto_create_revenue_accounting_entry_impl() bloque si linked_accounting_entry_id existe
  - la simple relance depuis le frontend n'est pas sûre
  - risque de double écriture ou d'écriture orpheline

  ## Stratégie minimale
  1. Vérifications de sécurité (is_locked, bank_statement_line_id)
  2. Suppression propre de l'ancienne écriture principale
  3. Suppression propre de l'ancienne écriture de paiement si présente
  4. Reset linked_accounting_entry_id et payment_entry_id
  5. Régénération via auto_create_revenue_accounting_entry_impl()
  6. Gestion automatique du payment_entry via trigger existant

  ## Sécurité
  - Vérification is_locked sur écriture principale
  - Vérification bank_statement_line_id sur écriture principale
  - Vérification is_locked sur écriture de paiement si présente
  - Vérification bank_statement_line_id sur écriture de paiement si présente
  - Suppression CASCADE des accounting_lines
  - Reset atomique avant régénération

  ## Compatibilité
  - Ne modifie pas auto_create_revenue_accounting_entry_impl()
  - Ne modifie pas les triggers existants
  - Ne casse pas AddRevenuePage
  - Ne casse pas deferred/immediate
  - Réutilise la logique comptable centrale existante
*/

-- ============================================
-- FONCTION : recompute_revenue_accounting_entry
-- ============================================

CREATE OR REPLACE FUNCTION recompute_revenue_accounting_entry(p_revenue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_revenue revenue_documents;
  v_old_entry_id uuid;
  v_old_payment_entry_id uuid;
  v_entry_is_locked boolean;
  v_entry_bank_reconciled boolean;
  v_payment_is_locked boolean;
  v_payment_bank_reconciled boolean;
  v_new_entry_id uuid;
BEGIN
  -- ============================================
  -- 1. CHARGER LE REVENUE DOCUMENT
  -- ============================================
  SELECT * INTO v_revenue
  FROM revenue_documents
  WHERE id = p_revenue_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Document de revenu introuvable'
    );
  END IF;

  -- ============================================
  -- 2. RÉCUPÉRER LES IDs DES ÉCRITURES EXISTANTES
  -- ============================================
  v_old_entry_id := v_revenue.linked_accounting_entry_id;
  v_old_payment_entry_id := v_revenue.payment_entry_id;

  -- Si aucune écriture existante, appeler directement auto_create_revenue_accounting_entry_impl()
  IF v_old_entry_id IS NULL THEN
    v_new_entry_id := auto_create_revenue_accounting_entry_impl(v_revenue);

    RETURN jsonb_build_object(
      'success', true,
      'entry_id', v_new_entry_id,
      'message', 'Écriture comptable créée (aucune écriture existante)'
    );
  END IF;

  -- ============================================
  -- 3. VÉRIFICATIONS DE SÉCURITÉ — ÉCRITURE PRINCIPALE
  -- ============================================
  SELECT is_locked, (bank_statement_line_id IS NOT NULL)
  INTO v_entry_is_locked, v_entry_bank_reconciled
  FROM accounting_entries
  WHERE id = v_old_entry_id;

  -- Vérifier verrouillage
  IF v_entry_is_locked THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Écriture comptable verrouillée, modification impossible'
    );
  END IF;

  -- Vérifier rapprochement bancaire
  IF v_entry_bank_reconciled THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Écriture comptable rapprochée bancairement, modification impossible'
    );
  END IF;

  -- ============================================
  -- 4. VÉRIFICATIONS DE SÉCURITÉ — ÉCRITURE DE PAIEMENT
  -- ============================================
  IF v_old_payment_entry_id IS NOT NULL THEN
    SELECT is_locked, (bank_statement_line_id IS NOT NULL)
    INTO v_payment_is_locked, v_payment_bank_reconciled
    FROM accounting_entries
    WHERE id = v_old_payment_entry_id;

    -- Vérifier verrouillage
    IF v_payment_is_locked THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Écriture de paiement verrouillée, modification impossible'
      );
    END IF;

    -- Vérifier rapprochement bancaire
    IF v_payment_bank_reconciled THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Écriture de paiement rapprochée bancairement, modification impossible'
      );
    END IF;
  END IF;

  -- ============================================
  -- 5. RESET ATOMIQUE
  -- ============================================

  -- 5.1 Dissocier les écritures du document AVANT suppression
  UPDATE revenue_documents
  SET
    linked_accounting_entry_id = NULL,
    payment_entry_id = NULL
  WHERE id = p_revenue_id;

  -- 5.2 Supprimer l'ancienne écriture principale (CASCADE supprime les accounting_lines)
  DELETE FROM accounting_entries
  WHERE id = v_old_entry_id;

  -- 5.3 Supprimer l'ancienne écriture de paiement si présente
  IF v_old_payment_entry_id IS NOT NULL THEN
    DELETE FROM accounting_entries
    WHERE id = v_old_payment_entry_id;
  END IF;

  -- ============================================
  -- 6. RECHARGER LE DOCUMENT DEPUIS LA BASE
  -- ============================================
  SELECT * INTO v_revenue
  FROM revenue_documents
  WHERE id = p_revenue_id;

  -- ============================================
  -- 7. RÉGÉNÉRATION VIA FONCTION CENTRALE
  -- ============================================
  v_new_entry_id := auto_create_revenue_accounting_entry_impl(v_revenue);

  IF v_new_entry_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Échec de la régénération de l''écriture comptable'
    );
  END IF;

  -- ============================================
  -- 8. GESTION PAYMENT_ENTRY (DEFERRED UNIQUEMENT)
  -- ============================================
  -- IMPORTANT : Ne pas recréer manuellement l'écriture de paiement ici.
  -- Le trigger auto_create_revenue_payment_entry() se déclenche automatiquement
  -- lors du passage payment_status → 'paid'.
  --
  -- Stratégie minimale :
  -- - Si payment_timing = 'immediate' : rien à faire (pas de payment_entry)
  -- - Si payment_timing = 'deferred' ET payment_status = 'paid' :
  --   → Le trigger existant s'occupe de régénérer l'écriture 512→411
  --   → Aucune action supplémentaire nécessaire ici
  --
  -- Le trigger vérifie déjà :
  -- - IF NEW.payment_entry_id IS NOT NULL THEN RETURN NEW (garde anti-duplication)
  -- - IF NEW.payment_timing = 'immediate' THEN RETURN NEW (ignore mode immediate)
  -- - IF NEW.payment_status = 'paid' THEN créer l'écriture
  --
  -- Conclusion : laisser le trigger gérer automatiquement la recréation

  RETURN jsonb_build_object(
    'success', true,
    'entry_id', v_new_entry_id,
    'message', 'Écriture comptable régénérée avec succès'
  );

END;
$$;

-- ============================================
-- COMMENTAIRE FINAL
-- ============================================

/*
  COMPORTEMENT ATTENDU :

  1. Cas nominal (écriture existante non verrouillée) :
     - Suppression propre de l'ancienne écriture principale
     - Suppression propre de l'ancienne écriture de paiement si présente
     - Régénération via auto_create_revenue_accounting_entry_impl()
     - Si payment_status = 'paid' ET payment_timing = 'deferred' :
       → Le trigger auto_create_revenue_payment_entry() régénère automatiquement l'écriture 512→411

  2. Cas bloqués (erreur retournée) :
     - Écriture principale verrouillée (is_locked = true)
     - Écriture principale rapprochée bancairement (bank_statement_line_id IS NOT NULL)
     - Écriture de paiement verrouillée (is_locked = true)
     - Écriture de paiement rapprochée bancairement (bank_statement_line_id IS NOT NULL)

  3. Cas sans écriture existante :
     - Appel direct à auto_create_revenue_accounting_entry_impl()
     - Comportement identique à AddRevenuePage

  SÉCURITÉ :
  - Aucune double écriture possible (reset complet avant régénération)
  - Aucune écriture orpheline (suppression CASCADE des accounting_lines)
  - Aucune perte de verrouillage (vérifications bloquantes)
  - Aucune perte de rapprochement bancaire (vérifications bloquantes)

  COMPATIBILITÉ :
  - Ne modifie pas auto_create_revenue_accounting_entry_impl()
  - Ne modifie pas les triggers existants
  - Ne casse pas AddRevenuePage
  - Ne casse pas deferred/immediate
  - Réutilise 100% de la logique comptable existante
*/