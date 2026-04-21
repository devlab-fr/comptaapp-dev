
/*
  # Consolidation des doublons Powens dans bank_accounts

  Remappage de toutes les transactions et relevés bancaires
  des 4 comptes doublons vers la ligne canonique unique,
  puis suppression des doublons.

  Ligne canonique conservée :
    907f2ce8-bc2e-4082-862c-3d465fecb140 (EURL S.RAM, iban rempli, sync la plus récente)

  Doublons supprimés :
    8038e2c7-0b67-4bbb-b967-2751050bf8d1
    1297d2bf-3686-4acb-8112-39925a935f6c
    09ec093b-2577-4d68-99fc-6deac5113dfd
    f9775873-4893-479d-933f-8cc7a296e82d

  Non touché :
    ad0cf6bb-390e-40a0-bd35-67e4f533ebde (Compte ENTREPRISE1, compte manuel)
*/

UPDATE bank_statement_lines
SET bank_account_id = '907f2ce8-bc2e-4082-862c-3d465fecb140'
WHERE bank_account_id IN (
  '8038e2c7-0b67-4bbb-b967-2751050bf8d1',
  '1297d2bf-3686-4acb-8112-39925a935f6c',
  '09ec093b-2577-4d68-99fc-6deac5113dfd',
  'f9775873-4893-479d-933f-8cc7a296e82d'
);

UPDATE bank_statements
SET bank_account_id = '907f2ce8-bc2e-4082-862c-3d465fecb140'
WHERE bank_account_id IN (
  '8038e2c7-0b67-4bbb-b967-2751050bf8d1',
  '1297d2bf-3686-4acb-8112-39925a935f6c',
  '09ec093b-2577-4d68-99fc-6deac5113dfd',
  'f9775873-4893-479d-933f-8cc7a296e82d'
);

DELETE FROM bank_accounts
WHERE id IN (
  '8038e2c7-0b67-4bbb-b967-2751050bf8d1',
  '1297d2bf-3686-4acb-8112-39925a935f6c',
  '09ec093b-2577-4d68-99fc-6deac5113dfd',
  'f9775873-4893-479d-933f-8cc7a296e82d'
);
