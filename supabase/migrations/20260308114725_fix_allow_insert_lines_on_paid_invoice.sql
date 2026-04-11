/*
  # Correction trigger lignes_factures - Autoriser INSERT initial

  1. Modification
    - Supprimer trigger_prevent_paid_invoice_lines_insert
    - Conserver trigger_prevent_paid_invoice_lines_update
    - Conserver trigger_prevent_paid_invoice_lines_delete

  2. Règle métier
    - Autorisé : INSERT lignes lors de création facture payée
    - Interdit : UPDATE lignes si facture déjà payée
    - Interdit : DELETE lignes si facture déjà payée
*/

-- Supprimer uniquement le trigger INSERT
DROP TRIGGER IF EXISTS trigger_prevent_paid_invoice_lines_insert ON lignes_factures;

-- Les triggers UPDATE et DELETE restent actifs (pas de modification)
