/*
  # Fix update_facture_with_lines — ordre des opérations

  ## Problème
  L'ordre précédent était : UPDATE factures → DELETE lignes → INSERT lignes.
  Le trigger AFTER UPDATE sur `factures` (trigger_facture_paid_create_revenue) se
  déclenchait immédiatement après l'UPDATE, avant que les nouvelles lignes soient
  présentes. Si la facture passait à 'payee' dans ce même appel, la conversion
  en revenu lisait les anciennes lignes (ou aucune ligne après DELETE).

  ## Correction
  Nouvel ordre : DELETE lignes → INSERT lignes → UPDATE factures.
  Les lignes nouvelles sont garanties présentes quand le trigger se déclenche.

  ## Sécurité
  SECURITY DEFINER conservé : nécessaire pour que auth.uid() soit disponible
  et pour contourner les RLS restrictives sur les tables internes lors des
  opérations DELETE/INSERT sur lignes_factures.

  ## Impact
  - Aucun changement de signature → aucun changement frontend
  - Aucun trigger modifié
  - Aucune logique métier modifiée
*/

CREATE OR REPLACE FUNCTION public.update_facture_with_lines(
  p_facture_id        uuid,
  p_client_id         uuid,
  p_date_facture      date,
  p_statut_paiement   text,
  p_date_paiement     date,
  p_montant_total_ht  numeric,
  p_montant_total_tva numeric,
  p_montant_total_ttc numeric,
  p_remise_type       text,
  p_remise_value      numeric,
  p_montant_remise    numeric,
  p_lignes            jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_statut text;
  v_company_id     uuid;
  v_is_member      boolean;
BEGIN

  -- 1. Vérifier existence de la facture
  SELECT statut_paiement, company_id
  INTO v_current_statut, v_company_id
  FROM factures
  WHERE id = p_facture_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture introuvable : %', p_facture_id;
  END IF;

  -- 2. Vérifier membership
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE company_id = v_company_id
      AND user_id = auth.uid()
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- 3. Garde : facture non payée
  IF v_current_statut = 'payee' THEN
    RAISE EXCEPTION 'Impossible de modifier une facture déjà payée';
  END IF;

  -- 4. DELETE lignes existantes
  DELETE FROM lignes_factures
  WHERE facture_id = p_facture_id;

  -- 5. INSERT nouvelles lignes
  INSERT INTO lignes_factures (
    facture_id,
    description,
    quantite,
    prix_unitaire_ht,
    taux_tva,
    montant_ht,
    montant_tva,
    montant_ttc,
    ordre,
    category_id
  )
  SELECT
    p_facture_id,
    (ligne->>'description')::text,
    (ligne->>'quantite')::numeric,
    (ligne->>'prix_unitaire_ht')::numeric,
    (ligne->>'taux_tva')::numeric,
    (ligne->>'montant_ht')::numeric,
    (ligne->>'montant_tva')::numeric,
    (ligne->>'montant_ttc')::numeric,
    (ligne->>'ordre')::integer,
    CASE
      WHEN ligne->>'category_id' IS NOT NULL AND ligne->>'category_id' != 'null'
      THEN (ligne->>'category_id')::uuid
      ELSE NULL
    END
  FROM jsonb_array_elements(p_lignes) AS ligne;

  -- 6. UPDATE facture en dernier : le trigger AFTER UPDATE se déclenche
  --    quand les nouvelles lignes sont déjà présentes en base
  UPDATE factures SET
    client_id          = p_client_id,
    date_facture       = p_date_facture,
    statut_paiement    = p_statut_paiement,
    date_paiement      = p_date_paiement,
    montant_total_ht   = p_montant_total_ht,
    montant_total_tva  = p_montant_total_tva,
    montant_total_ttc  = p_montant_total_ttc,
    remise_type        = p_remise_type,
    remise_value       = p_remise_value,
    montant_remise     = p_montant_remise,
    updated_at         = now()
  WHERE id = p_facture_id;

END;
$function$;
