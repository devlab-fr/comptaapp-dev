/*
  # Fix timing issue in create_revenue_from_paid_invoice

  1. Problème identifié
    - create_revenue_from_paid_invoice() insère revenue_document d'abord
    - Le trigger AFTER INSERT se déclenche immédiatement
    - auto_create_revenue_accounting_entry() s'exécute AVANT que les revenue_lines soient créées
    - Résultat : crédit = 0 car aucune revenue_line n'existe encore

  2. Solution minimale
    - Désactiver temporairement le trigger durant create_revenue_from_paid_invoice()
    - Utiliser session_replication_role = 'replica' (désactive les triggers non-replica)
    - Appeler manuellement auto_create_revenue_accounting_entry() à la fin
    - Pattern utilisé : similaire au batch mode mais pour un seul document

  3. Impact
    - Le trigger continue de fonctionner pour les insertions manuelles
    - Uniquement désactivé pendant la conversion facture → revenue
    - Aucune autre logique impactée
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

  -- 4. Désactiver temporairement le trigger pour éviter qu'il se déclenche avant la création des lignes
  PERFORM set_config('app.skip_revenue_accounting_trigger', 'true', true);

  -- 5. Créer le revenue_document
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
    'validated',
    'paid',
    v_facture.date_paiement,
    false
  )
  RETURNING id INTO v_revenue_id;

  -- 6. Créer les revenue_lines depuis lignes_factures
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

  -- 7. Réactiver le trigger et appeler manuellement la fonction de génération comptable
  PERFORM set_config('app.skip_revenue_accounting_trigger', 'false', true);
  
  -- 8. Appeler manuellement la génération de l'écriture comptable maintenant que les lignes existent
  PERFORM auto_create_revenue_accounting_entry_manual(v_revenue_id);

  RETURN v_revenue_id;
END;
$$;

-- Fonction helper pour appeler manuellement le trigger
CREATE OR REPLACE FUNCTION auto_create_revenue_accounting_entry_manual(p_revenue_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_revenue_record revenue_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_revenue_record
  FROM revenue_documents
  WHERE id = p_revenue_id;
  
  IF v_revenue_record.linked_accounting_entry_id IS NULL THEN
    -- Simuler le NEW du trigger
    PERFORM auto_create_revenue_accounting_entry_impl(v_revenue_record);
  END IF;
END;
$$;

-- Extraire la logique du trigger dans une fonction réutilisable
CREATE OR REPLACE FUNCTION auto_create_revenue_accounting_entry_impl(p_revenue revenue_documents)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_journal_id uuid;
  v_entry_id uuid;
  v_fiscal_year int;
  v_account_411_id uuid;
  v_account_44571_id uuid;
  v_line record;
  v_account_id uuid;
  v_line_counter int := 0;
  v_total_ttc numeric;
  total_debit decimal(15,2);
  total_credit decimal(15,2);
  v_line_count int;
BEGIN
  -- Ne rien faire si l'écriture existe déjà
  IF p_revenue.linked_accounting_entry_id IS NOT NULL THEN
    RETURN p_revenue.linked_accounting_entry_id;
  END IF;

  -- SÉCURITÉ : Vérifier qu'il existe au moins 1 revenue_line
  SELECT COUNT(*) INTO v_line_count
  FROM revenue_lines
  WHERE document_id = p_revenue.id;

  IF v_line_count = 0 THEN
    -- Pas de lignes, on ne fait rien
    RETURN NULL;
  END IF;

  -- Récupérer l'exercice comptable
  v_fiscal_year := EXTRACT(YEAR FROM p_revenue.invoice_date);

  -- Récupérer le journal VT
  SELECT id INTO v_journal_id
  FROM journals
  WHERE company_id = p_revenue.company_id
    AND code = 'VT'
    AND is_active = true
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Récupérer le compte 411
  SELECT id INTO v_account_411_id
  FROM chart_of_accounts
  WHERE company_id = p_revenue.company_id
    AND code = '411'
    AND is_active = true
  LIMIT 1;

  IF v_account_411_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Récupérer le compte 44571
  SELECT id INTO v_account_44571_id
  FROM chart_of_accounts
  WHERE company_id = p_revenue.company_id
    AND code = '44571'
    AND is_active = true
  LIMIT 1;

  -- Activer le batch mode
  PERFORM set_config('app.batch_accounting_insert', 'true', true);

  BEGIN
    -- Créer l'écriture comptable
    INSERT INTO accounting_entries (
      company_id,
      fiscal_year,
      journal_id,
      entry_date,
      description,
      created_by
    ) VALUES (
      p_revenue.company_id,
      v_fiscal_year,
      v_journal_id,
      p_revenue.invoice_date,
      'Revenu - ' || COALESCE((
        SELECT description 
        FROM revenue_lines 
        WHERE document_id = p_revenue.id 
        ORDER BY line_order 
        LIMIT 1
      ), 'Sans description'),
      auth.uid()
    )
    RETURNING id INTO v_entry_id;

    -- Ligne de débit sur compte 411
    v_total_ttc := p_revenue.total_incl_vat;

    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      label,
      debit,
      credit,
      line_order
    ) VALUES (
      v_entry_id,
      v_account_411_id,
      'Client',
      v_total_ttc,
      0,
      1
    );

    v_line_counter := 1;

    -- Lignes de crédit pour chaque revenue_line
    FOR v_line IN
      SELECT 
        rl.description,
        rl.amount_excl_vat,
        rl.vat_rate,
        rl.vat_amount,
        rc.account_code
      FROM revenue_lines rl
      JOIN revenue_categories rc ON rc.id = rl.category_id
      WHERE rl.document_id = p_revenue.id
      ORDER BY rl.line_order
    LOOP
      v_line_counter := v_line_counter + 1;

      SELECT id INTO v_account_id
      FROM chart_of_accounts
      WHERE company_id = p_revenue.company_id
        AND code = v_line.account_code
        AND is_active = true
      LIMIT 1;

      IF v_account_id IS NOT NULL THEN
        INSERT INTO accounting_lines (
          entry_id,
          account_id,
          label,
          debit,
          credit,
          vat_rate,
          line_order
        ) VALUES (
          v_entry_id,
          v_account_id,
          v_line.description,
          0,
          v_line.amount_excl_vat,
          v_line.vat_rate,
          v_line_counter
        );

        v_line_counter := v_line_counter + 1;

        IF v_line.vat_amount > 0 AND v_account_44571_id IS NOT NULL THEN
          INSERT INTO accounting_lines (
            entry_id,
            account_id,
            label,
            debit,
            credit,
            vat_rate,
            line_order
          ) VALUES (
            v_entry_id,
            v_account_44571_id,
            'TVA collectée - ' || v_line.description,
            0,
            v_line.vat_amount,
            v_line.vat_rate,
            v_line_counter
          );

          v_line_counter := v_line_counter + 1;
        END IF;
      END IF;
    END LOOP;

    PERFORM set_config('app.batch_accounting_insert', 'false', true);

    -- Vérifier l'équilibre
    SELECT 
      COALESCE(SUM(debit), 0),
      COALESCE(SUM(credit), 0)
    INTO total_debit, total_credit
    FROM accounting_lines
    WHERE entry_id = v_entry_id;

    IF total_debit != total_credit THEN
      RAISE EXCEPTION 'Écriture déséquilibrée: débit=% crédit=%', total_debit, total_credit;
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('app.batch_accounting_insert', 'false', true);
      RAISE;
  END;

  -- Lier l'écriture au document
  UPDATE revenue_documents
  SET linked_accounting_entry_id = v_entry_id
  WHERE id = p_revenue.id;

  RETURN v_entry_id;
END;
$$;

-- Modifier le trigger pour vérifier le flag
CREATE OR REPLACE FUNCTION auto_create_revenue_accounting_entry()
RETURNS TRIGGER AS $$
DECLARE
  skip_trigger text;
BEGIN
  -- Vérifier si on doit skip le trigger
  skip_trigger := current_setting('app.skip_revenue_accounting_trigger', true);
  
  IF skip_trigger = 'true' THEN
    RETURN NEW;
  END IF;

  -- Appeler la fonction d'implémentation
  PERFORM auto_create_revenue_accounting_entry_impl(NEW);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
