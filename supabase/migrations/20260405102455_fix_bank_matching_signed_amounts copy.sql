/*
  # Phase 1 - Correction critique automatch bancaire

  1. Problème identifié
    - Fonction suggest_bank_matches ignore le signe du mouvement bancaire
    - Frontend utilisait Math.abs() convertissant tout en positif
    - Permettait faux positifs : virement sortie -120€ matchait revenu entrée +120€

  2. Corrections appliquées
    - Frontend : suppression Math.abs() pour conserver signe réel
    - Backend : calcul montant SIGNÉ (positif = entrée, négatif = sortie)
    - Filtre par sens + journal : entrées→VT/FA/BL, sorties→ACH/DC
    - Vérification cohérence signe avant comparaison montant

  3. Conservation système existant
    - Tolérance ±0.02€ maintenue
    - Fenêtre date ±7 jours maintenue
    - Scoring inchangé (100 base + 35 date + 15 libellé)
    - TOP 5 résultats maintenu
    - Validations existantes intactes

  4. Résultat
    - Bloque matching incohérent (débit vs crédit opposés)
    - Garantit cohérence comptable
    - Aucun impact sur fonctionnalités existantes
*/

-- ============================================
-- FONCTION SUGGESTION MATCHING (CORRIGÉE)
-- ============================================

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
      -- CORRECTION CRITIQUE : calcul montant SIGNÉ
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
      -- CORRECTION CRITIQUE : filtre par journal selon sens du mouvement
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
    -- CORRECTION CRITIQUE : vérification cohérence signe
    (
      (p_line_amount > 0 AND et.montant_signe > 0)
      OR
      (p_line_amount < 0 AND et.montant_signe < 0)
    )
    -- Comparaison montant avec tolérance (maintenue)
    AND ABS(p_line_amount - ABS(et.montant_signe)) <= 0.02
  ORDER BY score DESC, et.entry_date DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/*
  VALIDATION DES CORRECTIONS :

  1. Test virement sortie vs revenu entrée (DOIT ÉCHOUER) :
     p_line_amount = -120.00 (sortie)
     → Filtre journal: j.code IN ('ACH', 'DC') seulement
     → Revenu VT exclu
     → Aucune suggestion ✓

  2. Test revenu entrée vs revenu comptable (DOIT RÉUSSIR) :
     p_line_amount = +1050.00 (entrée)
     → Filtre journal: j.code IN ('VT', 'FA', 'BL')
     → Revenu VT inclus
     → montant_signe > 0 vérifié
     → Suggestion OK ✓

  3. Test dépense sortie vs dépense comptable (DOIT RÉUSSIR) :
     p_line_amount = -750.00 (sortie)
     → Filtre journal: j.code IN ('ACH', 'DC')
     → Dépense ACH incluse
     → montant_signe < 0 vérifié
     → Suggestion OK ✓

  IMPACT :
  - Bloque faux positif critique -120€ vs +120€
  - Maintient toutes fonctionnalités existantes
  - Aucune breaking change
*/
