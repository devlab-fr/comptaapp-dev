/*
  # Ajout matching bancaire pour écritures BQ via compte 512

  1. Problème identifié
    - Les écritures du journal BQ (règlements bancaires) sont équilibrées : débit = crédit
    - Le calcul actuel du montant signé global retourne toujours 0
    - Résultat : les écritures BQ ne peuvent jamais être rapprochées avec les lignes bancaires
    - Impact : dépenses payées et revenus payés non rapprochables

  2. Solution appliquée
    - Pour le journal BQ uniquement : utiliser la ligne du compte 512 (Banque)
    - Débit 512 = encaissement (+montant) → match entrée bancaire
    - Crédit 512 = décaissement (-montant) → match sortie bancaire
    - Logique inchangée pour tous les autres journaux (ACH, VT, FA, BL, DC)

  3. Modifications minimales
    - Ligne 60-73 : ajout d'un CASE pour traiter spécifiquement le journal BQ
    - Ligne 72 : suppression du filtre j.code != 'BQ'
    - Ligne 75-79 : ajout de 'BQ' dans les journaux éligibles pour les deux sens
    - Aucune modification des triggers, tables, ou logique métier

  4. Résultat
    - Les écritures BQ de paiement sont maintenant rapprochables
    - Le montant utilisé pour le matching est celui de la ligne 512
    - Tous les autres journaux fonctionnent exactement comme avant
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
