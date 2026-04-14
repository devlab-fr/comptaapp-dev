/*
  # Bonus scoring sur similarité libellé (matching bancaire)

  1. Contexte
    - Fonction suggest_bank_matches déjà opérationnelle
    - Score existant : 100 base + proximité date + mot-clé
    - Logique métier (montant, date, signe, BQ/512) inchangée

  2. Amélioration
    - Ajout d'un bonus de score si similarité textuelle entre :
      * libellé de la ligne bancaire (p_line_description)
      * description de l'écriture comptable (et.description)
    - Bonus +20 si inclusion textuelle détectée (case-insensitive)
    - Normalisation simple : LOWER() + TRIM()

  3. Modification minimale
    - Ligne 119 : ajout du bonus dans le calcul de score existant
    - Aucune modification des filtres, tables, triggers
    - Aucune modification de la logique métier

  4. Résultat
    - Suggestions plus pertinentes quand les libellés se ressemblent
    - Score existant conservé et additionné
*/

CREATE OR REPLACE FUNCTION suggest_bank_matches(
  p_company_id uuid,
  p_line_id uuid,
  p_line_amount decimal,
  p_line_date date,
  p_line_description text
)
RETURNS TABLE (
  entry_id uuid,
  entry_number text,
  entry_date date,
  description text,
  montant_ecriture decimal,
  journal_code text,
  score int
) AS $$
DECLARE
  v_keyword text;
BEGIN
  -- Extraire premier mot significatif du libellé (>3 chars)
  v_keyword := COALESCE(
    (SELECT word FROM regexp_split_to_table(p_line_description, '\s+') AS word
     WHERE length(word) > 3 LIMIT 1),
    ''
  );

  RETURN QUERY
  WITH entry_totals AS (
    SELECT
      ae.id,
      ae.entry_number,
      ae.entry_date,
      ae.description,
      ae.journal_id,
      ae.is_locked,
      ae.bank_statement_line_id,
      j.code as journal_code,
      -- Calcul montant SIGNÉ : spécial pour BQ (compte 512), standard pour autres journaux
      CASE
        -- CAS BQ : utiliser la ligne du compte 512 uniquement
        WHEN j.code = 'BQ' THEN (
          SELECT
            CASE
              WHEN SUM(al2.debit) > 0 THEN SUM(al2.debit)   -- Débit 512 = encaissement (+)
              WHEN SUM(al2.credit) > 0 THEN -SUM(al2.credit) -- Crédit 512 = décaissement (-)
              ELSE 0
            END
          FROM accounting_lines al2
          JOIN chart_of_accounts coa2 ON coa2.id = al2.account_id
          WHERE al2.entry_id = ae.id
            AND coa2.code = '512'
        )
        -- CAS STANDARD : calcul global inchangé pour ACH, VT, FA, BL, DC
        ELSE
          CASE
            WHEN COALESCE(SUM(al.debit), 0) >= COALESCE(SUM(al.credit), 0)
            THEN COALESCE(SUM(al.debit), 0) - COALESCE(SUM(al.credit), 0)
            ELSE -(COALESCE(SUM(al.credit), 0) - COALESCE(SUM(al.debit), 0))
          END
      END as montant_signe
    FROM accounting_entries ae
    JOIN journals j ON j.id = ae.journal_id
    LEFT JOIN accounting_lines al ON al.entry_id = ae.id
    WHERE ae.company_id = p_company_id
      AND j.company_id = p_company_id
      AND ae.bank_statement_line_id IS NULL
      AND ae.is_locked = false
      AND ae.entry_date BETWEEN (p_line_date - INTERVAL '7 days') AND (p_line_date + INTERVAL '7 days')
      -- Filtre par journal selon sens du mouvement (ajout de BQ dans les deux sens)
      AND (
        (p_line_amount > 0 AND j.code IN ('VT', 'FA', 'BL', 'BQ'))
        OR
        (p_line_amount < 0 AND j.code IN ('ACH', 'DC', 'BQ'))
      )
    GROUP BY ae.id, ae.entry_number, ae.entry_date, ae.description, ae.journal_id, ae.is_locked, ae.bank_statement_line_id, j.code
  )
  SELECT
    et.id as entry_id,
    et.entry_number,
    et.entry_date,
    et.description,
    ABS(et.montant_signe) as montant_ecriture,
    et.journal_code,
    (
      100 -- base score
      + (7 - ABS(et.entry_date - p_line_date))::int * 5 -- proximité date (max +35)
      + CASE
          WHEN v_keyword != '' AND et.description ILIKE '%' || v_keyword || '%'
          THEN 15
          ELSE 0
        END -- bonus mot-clé existant
      + CASE
          WHEN LOWER(TRIM(et.description)) LIKE '%' || LOWER(TRIM(p_line_description)) || '%'
            OR LOWER(TRIM(p_line_description)) LIKE '%' || LOWER(TRIM(et.description)) || '%'
          THEN 20
          ELSE 0
        END -- bonus similarité libellé (nouveau)
    ) as score
  FROM entry_totals et
  WHERE
    -- Vérification cohérence signe
    (
      (p_line_amount > 0 AND et.montant_signe > 0)
      OR
      (p_line_amount < 0 AND et.montant_signe < 0)
    )
    -- Comparaison montant avec tolérance
    AND ABS(p_line_amount - et.montant_signe) <= 0.02
  ORDER BY score DESC, et.entry_date DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
