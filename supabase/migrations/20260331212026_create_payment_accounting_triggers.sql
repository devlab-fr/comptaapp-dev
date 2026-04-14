/*
  # Génération automatique des écritures de paiement

  1. Objectif
    - Créer automatiquement une écriture de paiement lors du passage à payment_status = 'paid'
    - Revenue : Débit 512 (Banque) / Crédit 411 (Clients)
    - Expense : Débit 401 (Fournisseurs) / Crédit 512 (Banque)

  2. Mécanisme
    - Fonction : auto_create_revenue_payment_entry()
    - Fonction : auto_create_expense_payment_entry()
    - Triggers AFTER INSERT OR UPDATE sur revenue_documents et expense_documents
    - Génération uniquement si payment_status = 'paid' ET payment_entry_id IS NULL

  3. Sécurité
    - Idempotence : vérifier payment_entry_id IS NULL avant création
    - Fallback date : utiliser paid_at si présent, sinon invoice_date
    - Ne rien faire si journal BQ ou comptes manquants

  4. Notes
    - Compatible avec les données existantes (pas de rétroaction)
    - Pas de modification des triggers actuels (facturation/achat)
    - Utilise le compte 512 (Banque) pour tous les paiements
*/

-- ============================================================
-- FONCTION : Créer écriture de paiement pour REVENUE
-- ============================================================
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
  -- Vérifier si paiement déjà enregistré
  IF NEW.payment_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Vérifier si le document est marqué comme payé
  IF NEW.payment_status IS NULL OR NEW.payment_status != 'paid' THEN
    RETURN NEW;
  END IF;

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
      'Paiement - ' || COALESCE(NEW.description, 'Revenu'),
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    ) RETURNING id INTO v_entry_id;

    -- Ligne 1 : Débit 512 (Banque) - Entrée de trésorerie
    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      debit,
      credit,
      line_number
    ) VALUES (
      v_entry_id,
      v_account_512_id,
      v_total_ttc,
      0,
      1
    );

    -- Ligne 2 : Crédit 411 (Clients) - Apurement de la créance
    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      debit,
      credit,
      line_number
    ) VALUES (
      v_entry_id,
      v_account_411_id,
      0,
      v_total_ttc,
      2
    );

    -- Désactiver le batch mode
    PERFORM set_config('app.batch_accounting_insert', 'false', true);

    -- Lier l'écriture de paiement au document
    UPDATE revenue_documents
    SET payment_entry_id = v_entry_id
    WHERE id = NEW.id;

  EXCEPTION WHEN OTHERS THEN
    -- En cas d'erreur, désactiver le batch mode et ignorer
    PERFORM set_config('app.batch_accounting_insert', 'false', true);
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FONCTION : Créer écriture de paiement pour EXPENSE
-- ============================================================
CREATE OR REPLACE FUNCTION auto_create_expense_payment_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_id uuid;
  v_entry_id uuid;
  v_fiscal_year int;
  v_account_512_id uuid;
  v_account_401_id uuid;
  v_payment_date date;
  v_total_ttc numeric;
BEGIN
  -- Vérifier si paiement déjà enregistré
  IF NEW.payment_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Vérifier si le document est marqué comme payé
  IF NEW.payment_status IS NULL OR NEW.payment_status != 'paid' THEN
    RETURN NEW;
  END IF;

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

  -- Récupérer le compte 401 (Fournisseurs)
  SELECT id INTO v_account_401_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '401'
    AND is_active = true
  LIMIT 1;

  -- Si les comptes n'existent pas, ne rien faire
  IF v_account_512_id IS NULL OR v_account_401_id IS NULL THEN
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
      'Paiement - ' || COALESCE(NEW.description, 'Dépense'),
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    ) RETURNING id INTO v_entry_id;

    -- Ligne 1 : Débit 401 (Fournisseurs) - Apurement de la dette
    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      debit,
      credit,
      line_number
    ) VALUES (
      v_entry_id,
      v_account_401_id,
      v_total_ttc,
      0,
      1
    );

    -- Ligne 2 : Crédit 512 (Banque) - Sortie de trésorerie
    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      debit,
      credit,
      line_number
    ) VALUES (
      v_entry_id,
      v_account_512_id,
      0,
      v_total_ttc,
      2
    );

    -- Désactiver le batch mode
    PERFORM set_config('app.batch_accounting_insert', 'false', true);

    -- Lier l'écriture de paiement au document
    UPDATE expense_documents
    SET payment_entry_id = v_entry_id
    WHERE id = NEW.id;

  EXCEPTION WHEN OTHERS THEN
    -- En cas d'erreur, désactiver le batch mode et ignorer
    PERFORM set_config('app.batch_accounting_insert', 'false', true);
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TRIGGERS : Déclencher la création des écritures de paiement
-- ============================================================

-- Trigger pour revenue_documents
DROP TRIGGER IF EXISTS trigger_auto_revenue_payment_entry ON revenue_documents;
CREATE TRIGGER trigger_auto_revenue_payment_entry
  AFTER INSERT OR UPDATE OF payment_status, paid_at
  ON revenue_documents
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_revenue_payment_entry();

-- Trigger pour expense_documents
DROP TRIGGER IF EXISTS trigger_auto_expense_payment_entry ON expense_documents;
CREATE TRIGGER trigger_auto_expense_payment_entry
  AFTER INSERT OR UPDATE OF payment_status, paid_at
  ON expense_documents
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_expense_payment_entry();
