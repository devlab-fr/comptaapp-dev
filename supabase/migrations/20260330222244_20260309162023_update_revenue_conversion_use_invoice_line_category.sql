/*
  # Update revenue conversion to use invoice line category

  1. Changes
    - Remove hardcoded "Prestations de services" category lookup
    - Use category_id from lignes_factures.category_id instead
    - Use fallback category for backward compatibility with old invoices
  
  2. Purpose
    - Enable automatic category propagation from invoice lines to revenue lines
    - Preserve exact category selection made by user during invoice creation
  
  3. Compatibility
    - For old invoice lines without category_id, use "Prestations de services" as fallback
*/

CREATE OR REPLACE FUNCTION create_revenue_from_paid_invoice(p_facture_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_revenue_id uuid;
  v_fallback_category_id uuid;
  v_facture record;
  v_ligne record;
BEGIN
  -- 1. Vérifier si un revenu existe déjà pour cette facture
  SELECT id INTO v_revenue_id
  FROM revenue_documents
  WHERE source_type = 'invoice'
    AND source_invoice_id = p_facture_id;
  
  IF v_revenue_id IS NOT NULL THEN
    -- Revenu déjà créé, retourner l'ID existant (idempotent)
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

  -- 4. Créer le revenue_document
  INSERT INTO revenue_documents (
    company_id,
    invoice_date,
    total_excl_vat,
    total_vat,
    total_incl_vat,
    source_type,
    source_invoice_id,
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
    'draft',
    'paid',
    v_facture.date_paiement,
    false
  )
  RETURNING id INTO v_revenue_id;

  -- 5. Créer les revenue_lines depuis lignes_factures
  -- Utilise category_id de la ligne de facture si disponible, sinon fallback
  FOR v_ligne IN
    SELECT *
    FROM lignes_factures
    WHERE facture_id = p_facture_id
    ORDER BY ordre ASC
  LOOP
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
      v_ligne.montant_ht,
      v_ligne.taux_tva / 100.0,
      v_ligne.montant_tva,
      v_ligne.montant_ttc,
      v_ligne.ordre
    );
  END LOOP;

  RETURN v_revenue_id;
END;
$$;
