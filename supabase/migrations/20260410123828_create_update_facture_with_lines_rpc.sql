/*
  # Create RPC update_facture_with_lines

  ## Purpose
  Provides an atomic transactional function to update a facture and replace all
  its lignes in a single database round-trip.

  ## Behaviour
  1. Raises an exception if the facture is already marked as 'payee' (immutable)
  2. Updates the facture row with all provided fields
  3. Deletes all existing lignes_factures rows for that facture
  4. Inserts the new lignes provided via the p_lignes JSONB array

  ## Parameters
  - p_facture_id       uuid      — target facture
  - p_client_id        uuid      — linked client / recipient
  - p_date_facture     date      — invoice date
  - p_statut_paiement  text      — payment status
  - p_date_paiement    date      — payment date (nullable)
  - p_montant_total_ht numeric   — total HT after discount
  - p_montant_total_tva numeric  — total TVA
  - p_montant_total_ttc numeric  — total TTC
  - p_remise_type      text      — discount type (nullable)
  - p_remise_value     numeric   — discount value
  - p_montant_remise   numeric   — computed discount amount
  - p_lignes           jsonb     — array of ligne objects

  ## p_lignes expected shape (each element)
  {
    "description":     text,
    "quantite":        numeric,
    "prix_unitaire_ht": numeric,
    "taux_tva":        numeric,
    "montant_ht":      numeric,
    "montant_tva":     numeric,
    "montant_ttc":     numeric,
    "ordre":           integer,
    "category_id":     uuid | null
  }

  ## Security
  - SECURITY DEFINER so it can bypass RLS for the internal delete/insert
    while still validating ownership via the caller's auth.uid()
  - The ownership check ensures the caller is a member of the company
    that owns the facture before any write is performed
*/

CREATE OR REPLACE FUNCTION public.update_facture_with_lines(
  p_facture_id       uuid,
  p_client_id        uuid,
  p_date_facture     date,
  p_statut_paiement  text,
  p_date_paiement    date,
  p_montant_total_ht numeric,
  p_montant_total_tva numeric,
  p_montant_total_ttc numeric,
  p_remise_type      text,
  p_remise_value     numeric,
  p_montant_remise   numeric,
  p_lignes           jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_statut text;
  v_company_id     uuid;
  v_is_member      boolean;
BEGIN
  SELECT statut_paiement, company_id
  INTO v_current_statut, v_company_id
  FROM factures
  WHERE id = p_facture_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture introuvable : %', p_facture_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE company_id = v_company_id
      AND user_id = auth.uid()
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF v_current_statut = 'payee' THEN
    RAISE EXCEPTION 'Impossible de modifier une facture déjà payée';
  END IF;

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

  DELETE FROM lignes_factures
  WHERE facture_id = p_facture_id;

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
END;
$$;
