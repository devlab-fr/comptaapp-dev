/*
  # Correction comparaison montant signé dans automatch bancaire

  1. Problème identifié
    - Ligne 117 : AND ABS(p_line_amount - ABS(et.montant_signe)) <= 0.02
    - Double ABS() casse les montants négatifs
    - Exemple : -750 vs -750 → ABS(-750 - ABS(-750)) = ABS(-750 - 750) = 1500
    - Rejet incorrect des matches cohérents

  2. Correction appliquée
    - Suppression du ABS() interne
    - Nouvelle ligne : AND ABS(p_line_amount - et.montant_signe) <= 0.02
    - Conserve tolérance ±0.02€
    - Aucune autre modification

  3. Résultat
    - +1050 bancaire ↔ +1050 écriture = match OK
    - -750 bancaire ↔ -750 écriture = match OK
    - -120 bancaire ↔ +120 écriture = rejet OK (filtre signe ligne 111-115)
    - +120 bancaire ↔ -120 écriture = rejet OK (filtre signe ligne 111-115)
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
      + (7 - ABS(EXTRACT(DAY FROM (et.entry_date - p_line_date))))::int * 5 -- proximité date (max +35)
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
    -- CORRECTION : suppression ABS() interne pour comparaison correcte
    AND ABS(p_line_amount - et.montant_signe) <= 0.02
  ORDER BY score DESC, et.entry_date DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;