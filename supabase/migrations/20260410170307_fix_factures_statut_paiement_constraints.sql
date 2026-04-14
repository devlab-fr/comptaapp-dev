/*
  # Fix factures statut_paiement constraints

  ## Problème
  Deux contraintes CHECK sur la table `factures` n'autorisaient que
  'payee' et 'non_payee', bloquant les statuts métier utilisés par l'application.

  ## Contraintes supprimées
  1. `factures_statut_paiement_check` — CHECK (statut_paiement = ANY (ARRAY['non_payee', 'payee']))
  2. `date_paiement_if_payee` — CHECK (...OR statut_paiement = 'non_payee') — incomplet

  ## Nouvelles contraintes
  1. `factures_statut_paiement_check` — autorise tous les statuts métier :
     'brouillon', 'en_attente', 'non_payee', 'payee', 'annulee'
  2. `date_paiement_if_payee` — si statut = 'payee' alors date_paiement obligatoire,
     sinon date_paiement peut être null — compatible avec tous les statuts

  ## Données existantes
  Seul le statut 'payee' est présent en base (3 lignes) — aucun risque de violation.

  ## Périmètre
  - Backend uniquement
  - Aucun changement frontend, RPC, trigger
*/

ALTER TABLE public.factures
  DROP CONSTRAINT IF EXISTS factures_statut_paiement_check;

ALTER TABLE public.factures
  DROP CONSTRAINT IF EXISTS date_paiement_if_payee;

ALTER TABLE public.factures
  ADD CONSTRAINT factures_statut_paiement_check
    CHECK (statut_paiement = ANY (ARRAY['brouillon'::text, 'en_attente'::text, 'non_payee'::text, 'payee'::text, 'annulee'::text]));

ALTER TABLE public.factures
  ADD CONSTRAINT date_paiement_if_payee
    CHECK (
      (statut_paiement = 'payee' AND date_paiement IS NOT NULL)
      OR
      (statut_paiement != 'payee')
    );
