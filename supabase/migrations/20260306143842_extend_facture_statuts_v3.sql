/*
  # Extension des statuts de facture (v3)

  1. Modifications
    - Ajouter les statuts 'brouillon', 'en_attente', 'annulee' aux factures
    - Conserver la compatibilité avec les factures existantes

  2. Nouveaux statuts
    - brouillon: facture en cours de création, modifiable
    - en_attente: facture émise, en attente de paiement (ancien "non_payee")
    - payee: facture payée
    - annulee: facture annulée (reste dans l'historique)
*/

-- Étape 1: Supprimer d'abord la contrainte date_paiement_if_payee
ALTER TABLE factures
DROP CONSTRAINT IF EXISTS date_paiement_if_payee;

-- Étape 2: Supprimer la contrainte CHECK existante sur statut_paiement
ALTER TABLE factures
DROP CONSTRAINT IF EXISTS factures_statut_paiement_check;

-- Étape 3: Mettre à jour les factures existantes
UPDATE factures
SET statut_paiement = 'en_attente'
WHERE statut_paiement = 'non_payee';

-- Étape 4: Ajouter la nouvelle contrainte CHECK avec tous les statuts
ALTER TABLE factures
ADD CONSTRAINT factures_statut_paiement_check
CHECK (statut_paiement IN ('brouillon', 'en_attente', 'payee', 'annulee'));

-- Étape 5: Ajouter une nouvelle contrainte pour date_paiement (plus souple)
ALTER TABLE factures
ADD CONSTRAINT date_paiement_logic CHECK (
  (statut_paiement = 'payee' AND date_paiement IS NOT NULL) OR
  (statut_paiement IN ('brouillon', 'en_attente', 'annulee'))
);
