/*
  # Patch — Attribution des numéros d'écriture manquants (entry_number = NULL)

  ## Contexte
  L'audit du 2026-04-13 a identifié 8 écritures comptables sans entry_number ni fiscal_year,
  toutes datées du 2026-04-11, appartenant à la société a5bfd2f7.

  ## Détail des lignes concernées
  - 2 écritures journal VT (journal_id 67f1661b) → max existant VT-2026-00008
  - 6 écritures journal BQ (journal_id 9fe8df92) → max existant BQ-2026-00050

  ## Logique appliquée
  1. Seules les lignes avec entry_number IS NULL sont traitées
  2. fiscal_year est dérivé de EXTRACT(YEAR FROM entry_date)
  3. Le max existant est calculé via regexp_replace sur les écritures du même
     (company_id, journal_id, fiscal_year) au format exact JOURNAL-YYYY-XXXXX
  4. Un rang ROW_NUMBER() est attribué par (company_id, journal_id) ordonné par id
     pour distribuer les numéros séquentiellement
  5. Aucune autre écriture n'est touchée

  ## Résultat attendu
  - VT-2026-00009 et VT-2026-00010 attribués aux 2 écritures VT
  - BQ-2026-00051 à BQ-2026-00056 attribués aux 6 écritures BQ
  - fiscal_year = 2026 renseigné pour les 8 lignes

  ## Sécurité
  - Aucune modification des écritures déjà numérotées
  - Aucun trigger modifié
  - Aucune politique RLS modifiée
*/

DO $$
DECLARE
  rec RECORD;
  v_journal_code TEXT;
  v_fiscal_year INT;
  v_max_seq INT;
  v_counter INT;
  v_new_number TEXT;
BEGIN
  -- Traitement par groupe (company_id, journal_id) pour gérer les compteurs correctement
  FOR rec IN
    WITH null_entries AS (
      SELECT
        ae.id,
        ae.company_id,
        ae.journal_id,
        EXTRACT(YEAR FROM ae.entry_date)::INT AS fiscal_year,
        ROW_NUMBER() OVER (
          PARTITION BY ae.company_id, ae.journal_id
          ORDER BY ae.id
        ) AS rn
      FROM accounting_entries ae
      WHERE ae.entry_number IS NULL
    ),
    max_existing AS (
      SELECT
        ae.company_id,
        ae.journal_id,
        COALESCE(
          MAX(
            CASE
              WHEN ae.entry_number ~ ('^' || j.code || '-[0-9]{4}-[0-9]{5}$')
              THEN CAST(RIGHT(ae.entry_number, 5) AS INT)
              ELSE 0
            END
          ),
          0
        ) AS max_seq
      FROM accounting_entries ae
      JOIN journals j ON j.id = ae.journal_id
      WHERE ae.entry_number IS NOT NULL
      GROUP BY ae.company_id, ae.journal_id
    )
    SELECT
      ne.id,
      ne.company_id,
      ne.journal_id,
      ne.fiscal_year,
      ne.rn,
      COALESCE(mx.max_seq, 0) AS max_seq,
      j.code AS journal_code
    FROM null_entries ne
    JOIN journals j ON j.id = ne.journal_id
    LEFT JOIN max_existing mx
      ON mx.company_id = ne.company_id
      AND mx.journal_id = ne.journal_id
    ORDER BY ne.company_id, ne.journal_id, ne.rn
  LOOP
    v_new_number := rec.journal_code
      || '-' || rec.fiscal_year::TEXT
      || '-' || LPAD((rec.max_seq + rec.rn)::TEXT, 5, '0');

    UPDATE accounting_entries
    SET
      entry_number = v_new_number,
      fiscal_year  = rec.fiscal_year
    WHERE id = rec.id
      AND entry_number IS NULL;
  END LOOP;
END $$;
