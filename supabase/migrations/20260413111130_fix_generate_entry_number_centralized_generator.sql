/*
  # Fix — Générateur centralisé et atomique de entry_number

  ## Contexte
  La fonction generate_entry_number() existait déjà avec un advisory lock (migration 20260403220144).
  Plusieurs faiblesses ont été identifiées :
  1. fiscal_year peut être NULL au moment du calcul du verrou → clé de verrou instable
  2. SUBSTRING('[0-9]+$') extrait les derniers chiffres sans valider le format exact
     → risque d'inclure des entry_number mal formés dans le calcul du MAX
  3. fiscal_year non renseigné automatiquement si la ligne est insérée sans cette valeur

  ## Modifications appliquées

  ### 1. Nouvelle fonction utilitaire next_entry_number(company_id, journal_id, entry_date)
  - Point unique de génération, appelable aussi en dehors d'un trigger
  - Reçoit entry_date et dérive fiscal_year en interne
  - Filtre les entry_number mal formés via regex exacte ^CODE-YYYY-[0-9]{5}$
  - Advisory lock calculé uniquement après résolution de journal_code et fiscal_year

  ### 2. Mise à jour de generate_entry_number() (trigger BEFORE INSERT)
  - Délègue entièrement à next_entry_number()
  - Assure que fiscal_year est aussi renseigné sur la ligne
  - Ne touche pas aux lignes déjà numérotées (guard identique)

  ## Garanties
  - entry_number ne peut plus être NULL pour une nouvelle insertion
  - Aucun doublon possible (advisory lock + UNIQUE constraint)
  - Les écritures existantes ne sont pas modifiées
  - Aucun autre trigger ni logique comptable modifié

  ## Sécurité
  - SECURITY DEFINER pour accéder à journals sans dépendre des RLS
  - Advisory lock transactionnel (pg_advisory_xact_lock) par (company_id, journal_id, fiscal_year)
  - Regex stricte pour ignorer les entry_number mal formés dans le calcul du MAX
*/

-- ────────────────────────────────────────────────────────────────────
-- 1. Fonction utilitaire centralisée : next_entry_number
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION next_entry_number(
  p_company_id  uuid,
  p_journal_id  uuid,
  p_entry_date  date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_journal_code text;
  v_fiscal_year  int;
  v_lock_key     bigint;
  v_next_seq     int;
  v_pattern      text;
BEGIN
  -- 1. Résoudre le code journal
  SELECT code INTO v_journal_code
  FROM journals
  WHERE id = p_journal_id;

  IF v_journal_code IS NULL THEN
    RAISE EXCEPTION 'Journal introuvable pour id=%', p_journal_id;
  END IF;

  -- 2. Dériver l'année fiscale depuis la date
  v_fiscal_year := EXTRACT(YEAR FROM p_entry_date)::int;

  -- 3. Acquérir un verrou transactionnel exclusif
  --    La clé est stable car journal_code et fiscal_year sont résolus avant
  v_lock_key := hashtext(
    p_company_id::text || '-' || p_journal_id::text || '-' || v_fiscal_year::text
  )::bigint;

  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 4. Calculer le pattern exact attendu pour filtrer les mal formés
  v_pattern := '^' || v_journal_code || '-' || v_fiscal_year || '-[0-9]{5}$';

  -- 5. MAX sur les entry_number bien formés uniquement dans ce périmètre strict
  SELECT COALESCE(
    MAX(CAST(RIGHT(entry_number, 5) AS int)),
    0
  ) + 1
  INTO v_next_seq
  FROM accounting_entries
  WHERE company_id  = p_company_id
    AND journal_id  = p_journal_id
    AND fiscal_year = v_fiscal_year
    AND entry_number ~ v_pattern;

  -- 6. Formater et retourner
  RETURN v_journal_code || '-' || v_fiscal_year || '-' || LPAD(v_next_seq::text, 5, '0');
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 2. Mise à jour du trigger BEFORE INSERT (point d'intégration unique)
--    Délègue à next_entry_number — aucune logique dupliquée
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_entry_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Guard : ne pas écraser un numéro déjà attribué
  IF NEW.entry_number IS NOT NULL AND NEW.entry_number != '' THEN
    RETURN NEW;
  END IF;

  -- Assurer fiscal_year cohérent avec entry_date
  NEW.fiscal_year  := EXTRACT(YEAR FROM NEW.entry_date)::int;

  -- Déléguer la génération au point centralisé
  NEW.entry_number := next_entry_number(NEW.company_id, NEW.journal_id, NEW.entry_date);

  RETURN NEW;
END;
$$;

-- Le trigger auto_generate_entry_number existant (BEFORE INSERT ON accounting_entries)
-- n'est pas recréé : il pointe déjà sur generate_entry_number() et reste inchangé.
