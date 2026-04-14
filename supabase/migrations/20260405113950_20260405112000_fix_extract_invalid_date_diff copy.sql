/*
  # Correction EXTRACT() invalide sur différence de dates

  1. Problème identifié
    - Ligne 92 : EXTRACT(DAY FROM (et.entry_date - p_line_date))
    - En PostgreSQL : date - date = integer (nombre de jours)
    - EXTRACT() ne peut pas être appliqué sur un integer
    - Erreur 42883 : function pg_catalog.extract(unknown, integer) does not exist

  2. Correction appliquée
    - Suppression de EXTRACT(DAY FROM ...)
    - Utilisation directe de la différence de dates : (et.entry_date - p_line_date)
    - date - date retourne directement un nombre de jours (integer)
    - Logique métier inchangée : même calcul de score

  3. Résultat
    - Calcul d'écart en jours fonctionnel
    - Formule score identique : 100 + (7 - ABS(écart_jours)) * 5
    - Aucun impact sur matching ni filtres
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
      -- Calcul montant SIGNÉ (conserve signe positif/négatif)
      CASE
        WHEN COALESCE(SUM(al.debit), 0) >= COALESCE(SUM(al.credit), 0)
        THEN COALESCE(SUM(al.debit), 0) - COALESCE(SUM(al.credit), 0)
        ELSE -(COALESCE(SUM(al.credit), 0) - COALESCE(SUM(al.debit), 0))
      END as montant_signe
    FROM accounting_entries ae
    JOIN journals j ON j.id = ae.journal_id
    LEFT JOIN accounting_lines al ON al.entry_id = ae.id
    WHERE ae.company_id = p_company_id
      AND j.company_id = p_company_id
      AND ae.bank_statement_line_id IS NULL
      AND ae.is_locked = false
      AND j.code != 'BQ'
      AND ae.entry_date BETWEEN (p_line_date - INTERVAL '7 days') AND (p_line_date + INTERVAL '7 days')
      -- Filtre par journal selon sens du mouvement
      AND (
        (p_line_amount > 0 AND j.code IN ('VT', 'FA', 'BL'))
        OR
        (p_line_amount < 0 AND j.code IN ('ACH', 'DC'))
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
      + (7 - ABS(et.entry_date - p_line_date))::int * 5 -- proximité date (max +35) - CORRECTION : suppression EXTRACT()
      + CASE
          WHEN v_keyword != '' AND et.description ILIKE '%' || v_keyword || '%'
          THEN 15
          ELSE 0
        END -- bonus libellé
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