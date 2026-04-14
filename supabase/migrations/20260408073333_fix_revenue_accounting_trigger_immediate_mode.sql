/*
  # Modifier le trigger de vente pour gérer immediate vs deferred

  1. Objectif
    - Mode "immediate" : créer UNE SEULE écriture directe 512/7xx/TVA (journal BQ)
    - Mode "deferred" : comportement actuel 411/7xx/TVA (journal VT)
    - Éviter toute duplication d'écriture

  2. Logique modifiée
    - Garde stricte : si linked_accounting_entry_id existe → RETURN
    - Si payment_timing = 'immediate'
      → Écriture directe dans journal BQ avec compte 512
      → PAS de passage par 411
      → Cette écriture compte comme l'écriture de vente ET d'encaissement
    - Si payment_timing = 'deferred' ou NULL
      → Comportement actuel (journal VT, compte 411)

  3. Sécurité
    - Garde anti-duplication stricte en début de fonction
    - Gestion TVA identique dans les deux modes
    - Compatibilité avec données existantes (NULL → deferred)
*/

CREATE OR REPLACE FUNCTION auto_create_revenue_accounting_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_id uuid;
  v_entry_id uuid;
  v_fiscal_year int;
  v_account_411_id uuid;
  v_account_512_id uuid;
  v_account_44571_id uuid;
  v_line record;
  v_account_id uuid;
  v_line_counter int := 0;
  v_total_ttc numeric;
  total_debit decimal(15,2);
  total_credit decimal(15,2);
  v_is_immediate boolean;
BEGIN
  -- GARDE ANTI-DUPLICATION : Si l'écriture existe déjà, ne rien faire
  IF NEW.linked_accounting_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Déterminer le mode de paiement (NULL = deferred pour compatibilité)
  v_is_immediate := (NEW.payment_timing = 'immediate');

  -- Récupérer l'exercice comptable (année de la date de facture)
  v_fiscal_year := EXTRACT(YEAR FROM NEW.invoice_date);

  -- Récupérer le journal approprié selon le mode
  IF v_is_immediate THEN
    -- Mode immediate : utiliser le journal BQ (Banque)
    SELECT id INTO v_journal_id
    FROM journals
    WHERE company_id = NEW.company_id
      AND code = 'BQ'
      AND is_active = true
    LIMIT 1;
  ELSE
    -- Mode deferred : utiliser le journal VT (Ventes)
    SELECT id INTO v_journal_id
    FROM journals
    WHERE company_id = NEW.company_id
      AND code = 'VT'
      AND is_active = true
    LIMIT 1;
  END IF;

  -- Si le journal n'existe pas, on ne fait rien (sera géré manuellement)
  IF v_journal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer le compte 44571 (TVA collectée)
  SELECT id INTO v_account_44571_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '44571'
    AND is_active = true
  LIMIT 1;

  -- Récupérer les comptes de contrepartie selon le mode
  IF v_is_immediate THEN
    -- Mode immediate : récupérer le compte 512 (Banque)
    SELECT id INTO v_account_512_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND code = '512'
      AND is_active = true
    LIMIT 1;

    IF v_account_512_id IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    -- Mode deferred : récupérer le compte 411 (Clients)
    SELECT id INTO v_account_411_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND code = '411'
      AND is_active = true
    LIMIT 1;

    IF v_account_411_id IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Activer le batch mode pour désactiver le check d'équilibre ligne par ligne
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
      NEW.company_id,
      v_fiscal_year,
      v_journal_id,
      NEW.invoice_date,
      CASE 
        WHEN v_is_immediate THEN 'Revenu immédiat - '
        ELSE 'Revenu - '
      END || COALESCE((
        SELECT description 
        FROM revenue_lines 
        WHERE document_id = NEW.id 
        ORDER BY line_order 
        LIMIT 1
      ), 'Sans description'),
      auth.uid()
    )
    RETURNING id INTO v_entry_id;

    -- Ajouter d'abord la ligne de débit selon le mode
    v_total_ttc := NEW.total_incl_vat;

    IF v_is_immediate THEN
      -- Mode immediate : débit sur 512 (Banque)
      INSERT INTO accounting_lines (
        entry_id,
        account_id,
        label,
        debit,
        credit,
        line_order
      ) VALUES (
        v_entry_id,
        v_account_512_id,
        'Banque',
        v_total_ttc,
        0,
        1
      );
    ELSE
      -- Mode deferred : débit sur 411 (Client)
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
    END IF;

    v_line_counter := 1;

    -- Générer les lignes comptables pour chaque ligne de revenu
    -- CETTE LOGIQUE EST IDENTIQUE POUR LES DEUX MODES (immediate et deferred)
    FOR v_line IN
      SELECT 
        rl.description,
        rl.amount_excl_vat,
        rl.vat_rate,
        rl.vat_amount,
        rc.account_code
      FROM revenue_lines rl
      JOIN revenue_categories rc ON rc.id = rl.category_id
      WHERE rl.document_id = NEW.id
      ORDER BY rl.line_order
    LOOP
      v_line_counter := v_line_counter + 1;

      -- Récupérer l'ID du compte de produit
      SELECT id INTO v_account_id
      FROM chart_of_accounts
      WHERE company_id = NEW.company_id
        AND code = v_line.account_code
        AND is_active = true
      LIMIT 1;

      -- Si le compte existe, créer la ligne de crédit HT
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

        -- Si TVA > 0, créer la ligne de crédit TVA
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

    -- Désactiver le batch mode
    PERFORM set_config('app.batch_accounting_insert', 'false', true);

    -- Vérifier manuellement l'équilibre maintenant
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
      -- Désactiver le batch mode en cas d'erreur
      PERFORM set_config('app.batch_accounting_insert', 'false', true);
      RAISE;
  END;

  -- Lier l'écriture au document
  UPDATE revenue_documents
  SET linked_accounting_entry_id = v_entry_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recréer le trigger (il est déjà présent, cette commande le remplace)
DROP TRIGGER IF EXISTS trigger_auto_revenue_accounting_entry ON revenue_documents;
CREATE TRIGGER trigger_auto_revenue_accounting_entry
  AFTER INSERT ON revenue_documents
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_revenue_accounting_entry();
