/*
  # Correction définitive — Ajout de label aux lignes comptables de paiement fournisseur

  1. Problème identifié
    - La colonne label est NOT NULL dans accounting_lines
    - Les 2 INSERT de lignes comptables du paiement fournisseur n'incluent pas label
    - Erreur SQL 23502: null value in column "label" violates not-null constraint
    - Conséquence: aucune écriture de paiement 401 -> 512 créée
    - payment_entry_id reste NULL

  2. Solution
    - Ajouter la colonne label aux 2 INSERT uniquement
    - Valeur: 'Paiement fournisseur' pour les 2 lignes
    - Aucune autre modification de la fonction

  3. Notes
    - Patch minimal définitif
    - Ne touche pas à automatch, immediate/deferred, autres triggers
    - Le log de debug reste présent (sera retiré dans migration suivante)
*/

CREATE OR REPLACE FUNCTION public.auto_create_expense_payment_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
v_journal_id uuid;
v_entry_id uuid;
v_fiscal_year int;
v_account_512_id uuid;
v_account_401_id uuid;
v_payment_date date;
v_total_ttc numeric;
BEGIN
-- GARDE 1 : Vérifier si paiement déjà enregistré
IF NEW.payment_entry_id IS NOT NULL THEN
RETURN NEW;
END IF;

-- GARDE 2 : Si mode immediate, ne JAMAIS créer d'écriture de paiement
-- (l'écriture d'achat sert déjà de paiement)
IF NEW.payment_timing = 'immediate' THEN
RETURN NEW;
END IF;

-- GARDE 3 : Vérifier si le document est marqué comme payé
IF NEW.payment_status IS NULL OR NEW.payment_status != 'paid' THEN
RETURN NEW;
END IF;

-- Mode deferred : créer l'écriture de paiement habituelle
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
'Paiement fournisseur',
auth.uid()
) RETURNING id INTO v_entry_id;

-- Ligne 1 : Débit 401 (Fournisseurs) - Apurement de la dette
INSERT INTO accounting_lines (
entry_id,
account_id,
label,
debit,
credit,
line_order
) VALUES (
v_entry_id,
v_account_401_id,
'Paiement fournisseur',
v_total_ttc,
0,
1
);

-- Ligne 2 : Crédit 512 (Banque) - Sortie de trésorerie
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
'Paiement fournisseur',
0,
v_total_ttc,
2
);

-- Désactiver le batch mode
PERFORM set_config('app.batch_accounting_insert', 'false', true);

-- Lier l'écriture de paiement ET valider automatiquement
IF v_entry_id IS NOT NULL THEN
UPDATE expense_documents
SET
payment_entry_id = v_entry_id,
accounting_status = 'validated'
WHERE id = NEW.id
AND accounting_status IS DISTINCT FROM 'validated';
END IF;

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.batch_accounting_insert', 'false', true);

  BEGIN
    INSERT INTO public.expense_payment_trigger_debug (
      expense_document_id,
      step,
      sqlstate,
      sqlerrm
    )
    VALUES (
      NEW.id,
      'auto_create_expense_payment_entry_exception',
      SQLSTATE,
      SQLERRM
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;

RETURN NEW;
END;
$function$;
