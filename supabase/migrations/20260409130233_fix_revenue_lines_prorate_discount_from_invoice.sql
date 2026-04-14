/*
  # Fix create_revenue_from_paid_invoice — prorate revenue_lines when invoice has a discount

  ## Problem
  When a paid invoice has a global discount (remise), the revenue_document totals
  are already NET (after discount), but the revenue_lines were copied verbatim from
  lignes_factures which store GROSS amounts (before discount).

  This causes an unbalanced accounting entry:
    DEBIT  = revenue_documents.total_incl_vat  (NET  — e.g. 1512)
    CREDIT = SUM(revenue_lines.amount_excl_vat + vat_amount)  (GROSS — e.g. 1680)
  → EXCEPTION "Écriture déséquilibrée : débit=1512.00 crédit=1680.00"

  ## Fix
  Inside create_revenue_from_paid_invoice(), when factures.montant_remise > 0:
  1. Compute the GROSS total TTC of all lignes_factures for this invoice.
  2. Compute a proration factor: v_facture.montant_total_ttc / gross_total_ttc.
  3. In the revenue_lines INSERT loop, scale amount_excl_vat and recompute
     vat_amount and amount_incl_vat proportionally, rounded to 2 decimal places.
  4. After the loop, apply a rounding reconciliation on the LAST line to guarantee
     that SUM(revenue_lines) == revenue_document totals exactly (no residual cent).

  When montant_remise = 0, the behaviour is completely unchanged (factor = 1).

  ## Scope
  - ONLY create_revenue_from_paid_invoice() is modified
  - auto_create_revenue_accounting_entry_impl() is NOT touched
  - No frontend code is touched
  - No other function is touched
*/

CREATE OR REPLACE FUNCTION create_revenue_from_paid_invoice(p_facture_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_revenue_id            uuid;
  v_fallback_category_id  uuid;
  v_facture               record;
  v_ligne                 record;
  v_last_ligne_id         bigint;
  v_gross_total_ttc       numeric;
  v_remise_factor         numeric;
  v_ht_net                numeric;
  v_tva_net               numeric;
  v_ttc_net               numeric;
  v_sum_ht                numeric;
  v_sum_tva               numeric;
  v_sum_ttc               numeric;
  v_line_count            integer;
  v_current_line          integer;
BEGIN
  -- 1. Vérifier si un revenu existe déjà pour cette facture
  SELECT id INTO v_revenue_id
  FROM revenue_documents
  WHERE source_type = 'invoice'
    AND source_invoice_id = p_facture_id;

  IF v_revenue_id IS NOT NULL THEN
    RETURN v_revenue_id;
  END IF;

  -- 2. Récupérer la catégorie fallback pour anciennes factures sans catégorie
  SELECT id INTO v_fallback_category_id
  FROM revenue_categories
  WHERE name = 'Prestations de services'
    AND is_active = true
  LIMIT 1;

  IF v_fallback_category_id IS NULL THEN
    RAISE EXCEPTION 'Fallback category "Prestations de services" not found or inactive';
  END IF;

  -- 3. Récupérer les données de la facture
  SELECT * INTO v_facture
  FROM factures
  WHERE id = p_facture_id;

  IF v_facture.id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_facture_id;
  END IF;

  IF v_facture.statut_paiement != 'payee' THEN
    RAISE EXCEPTION 'Invoice % is not paid (status: %)', p_facture_id, v_facture.statut_paiement;
  END IF;

  IF v_facture.date_paiement IS NULL THEN
    RAISE EXCEPTION 'Invoice % has no payment date', p_facture_id;
  END IF;

  -- 4. Désactiver temporairement le trigger pour éviter qu'il se déclenche avant la création des lignes
  PERFORM set_config('app.skip_revenue_accounting_trigger', 'true', true);

  -- 5. Créer le revenue_document en état transitoire sûr (draft/unpaid)
  INSERT INTO revenue_documents (
    company_id,
    invoice_date,
    total_excl_vat,
    total_vat,
    total_incl_vat,
    source_type,
    source_invoice_id,
    payment_timing,
    accounting_status,
    payment_status,
    paid_at,
    is_test
  ) VALUES (
    v_facture.company_id,
    v_facture.date_paiement,
    v_facture.montant_total_ht,
    v_facture.montant_total_tva,
    v_facture.montant_total_ttc,
    'invoice',
    v_facture.id,
    'immediate',
    'draft',
    'unpaid',
    NULL,
    false
  )
  RETURNING id INTO v_revenue_id;

  -- 6. Calculer le facteur de proratisation si remise présente
  --    Si montant_remise <= 0 → facteur = 1 (comportement inchangé)
  IF COALESCE(v_facture.montant_remise, 0) > 0 THEN
    SELECT COALESCE(SUM(montant_ttc), 0)
    INTO v_gross_total_ttc
    FROM lignes_factures
    WHERE facture_id = p_facture_id;

    v_remise_factor := CASE
      WHEN v_gross_total_ttc > 0
        THEN v_facture.montant_total_ttc / v_gross_total_ttc
      ELSE 1
    END;
  ELSE
    v_remise_factor := 1;
  END IF;

  -- 7. Compter les lignes pour identifier la dernière (ajustement d'arrondi)
  SELECT COUNT(*), MAX(ordre)
  INTO v_line_count, v_last_ligne_id
  FROM lignes_factures
  WHERE facture_id = p_facture_id;

  -- 8. Créer les revenue_lines depuis lignes_factures
  v_sum_ht      := 0;
  v_sum_tva     := 0;
  v_sum_ttc     := 0;
  v_current_line := 0;

  FOR v_ligne IN
    SELECT *
    FROM lignes_factures
    WHERE facture_id = p_facture_id
    ORDER BY ordre ASC
  LOOP
    v_current_line := v_current_line + 1;

    IF v_remise_factor = 1 OR v_current_line < v_line_count THEN
      -- Pas de remise OU lignes intermédiaires : prorata + arrondi au centime
      v_ht_net  := ROUND(v_ligne.montant_ht  * v_remise_factor, 2);
      v_tva_net := ROUND(v_ligne.montant_ht  * v_remise_factor * (v_ligne.taux_tva / 100.0), 2);
      v_ttc_net := v_ht_net + v_tva_net;

      v_sum_ht  := v_sum_ht  + v_ht_net;
      v_sum_tva := v_sum_tva + v_tva_net;
      v_sum_ttc := v_sum_ttc + v_ttc_net;
    ELSE
      -- Dernière ligne : ajustement de réconciliation pour absorber les écarts d'arrondi
      v_ht_net  := ROUND(v_facture.montant_total_ht  - v_sum_ht,  2);
      v_tva_net := ROUND(v_facture.montant_total_tva - v_sum_tva, 2);
      v_ttc_net := ROUND(v_facture.montant_total_ttc - v_sum_ttc, 2);
    END IF;

    INSERT INTO revenue_lines (
      document_id,
      description,
      category_id,
      subcategory_id,
      amount_excl_vat,
      vat_rate,
      vat_amount,
      amount_incl_vat,
      line_order
    ) VALUES (
      v_revenue_id,
      v_ligne.description,
      COALESCE(v_ligne.category_id, v_fallback_category_id),
      NULL,
      v_ht_net,
      v_ligne.taux_tva / 100.0,
      v_tva_net,
      v_ttc_net,
      v_ligne.ordre
    );
  END LOOP;

  -- 9. Maintenant que les lignes existent, finaliser le revenue_document dans l'état métier attendu.
  UPDATE revenue_documents SET
    payment_status    = 'paid',
    accounting_status = 'validated',
    paid_at           = v_facture.date_paiement
  WHERE id = v_revenue_id;

  -- 10. Réactiver le trigger et appeler manuellement la génération comptable
  PERFORM set_config('app.skip_revenue_accounting_trigger', 'false', true);

  PERFORM auto_create_revenue_accounting_entry_manual(v_revenue_id);

  RETURN v_revenue_id;
END;
$$;
