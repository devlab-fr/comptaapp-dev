/*
  # Modifier le trigger de paiement pour ignorer les revenus immédiats

  1. Objectif
    - Les revenus en mode "immediate" ne doivent JAMAIS générer d'écriture de paiement
    - L'écriture de vente (512/7xx/TVA) sert déjà d'encaissement
    - Éviter toute duplication

  2. Logique modifiée
    - Garde 1 : si payment_entry_id existe → RETURN
    - Garde 2 : si payment_timing = 'immediate' → RETURN (même si payment_status change)
    - Sinon : comportement actuel (créer écriture 512→411)

  3. Sécurité
    - Double garde anti-duplication
    - Mode immediate complètement isolé du flux de paiement
    - Compatibilité avec données existantes (NULL → deferred)
*/

CREATE OR REPLACE FUNCTION auto_create_revenue_payment_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_id uuid;
  v_entry_id uuid;
  v_fiscal_year int;
  v_account_512_id uuid;
  v_account_411_id uuid;
  v_payment_date date;
  v_total_ttc numeric;
BEGIN
  -- GARDE 1 : Vérifier si paiement déjà enregistré
  IF NEW.payment_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- GARDE 2 : Si mode immediate, ne JAMAIS créer d'écriture de paiement
  -- (l'écriture de vente sert déjà d'encaissement)
  IF NEW.payment_timing = 'immediate' THEN
    RETURN NEW;
  END IF;

  -- GARDE 3 : Vérifier si le document est marqué comme payé
  IF NEW.payment_status IS NULL OR NEW.payment_status != 'paid' THEN
    RETURN NEW;
  END IF;

  -- Mode deferred : créer l'écriture de paiement habituelle
  -- Déterminer la date de paiement avec fallback
  v_payment_date := COALESCE(NEW.paid_at, NEW.invoice_date);
  v_fiscal_year := EXTRACT(YEAR FROM v_payment_date);
  v_total_ttc := NEW.total_incl_vat;

  -- Récupérer le journal BQ (Banque)
  SELECT id INTO v_journal_id
  FROM journals
  WHERE company_id = NEW.company_id
    AND code = 'BQ'
    AND is_active = true
  LIMIT 1;

  -- Si le journal n'existe pas, ne rien faire
  IF v_journal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer le compte 512 (Banque)
  SELECT id INTO v_account_512_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '512'
    AND is_active = true
  LIMIT 1;

  -- Récupérer le compte 411 (Clients)
  SELECT id INTO v_account_411_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '411'
    AND is_active = true
  LIMIT 1;

  -- Si les comptes n'existent pas, ne rien faire
  IF v_account_512_id IS NULL OR v_account_411_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Activer le batch mode pour éviter le check d'équilibre ligne par ligne
  PERFORM set_config('app.batch_accounting_insert', 'true', true);

  BEGIN
    -- Créer l'écriture de paiement
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
      v_payment_date,
      'Paiement client',
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    ) RETURNING id INTO v_entry_id;

    -- Ligne 1 : Débit 512 (Banque) - Entrée de trésorerie
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

    -- Ligne 2 : Crédit 411 (Clients) - Apurement de la créance
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
      0,
      v_total_ttc,
      2
    );

    -- Désactiver le batch mode
    PERFORM set_config('app.batch_accounting_insert', 'false', true);

    -- Lier l'écriture de paiement ET valider automatiquement
    IF v_entry_id IS NOT NULL THEN
      UPDATE revenue_documents
      SET
        payment_entry_id = v_entry_id,
        accounting_status = 'validated'
      WHERE id = NEW.id
        AND accounting_status IS DISTINCT FROM 'validated';
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- En cas d'erreur, désactiver le batch mode et ignorer
    PERFORM set_config('app.batch_accounting_insert', 'false', true);
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recréer le trigger
DROP TRIGGER IF EXISTS trigger_auto_revenue_payment_entry ON revenue_documents;
CREATE TRIGGER trigger_auto_revenue_payment_entry
  AFTER INSERT OR UPDATE OF payment_status, paid_at
  ON revenue_documents
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_revenue_payment_entry();
