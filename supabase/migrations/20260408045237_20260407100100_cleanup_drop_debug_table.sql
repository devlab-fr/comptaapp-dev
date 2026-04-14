/*
  # Nettoyage — Suppression table debug temporaire
  
  1. Modifications
    - Supprimer UNIQUEMENT la table expense_payment_trigger_debug
    - Aucune autre modification
    
  2. Notes
    - Patch minimal de nettoyage uniquement
    - Table créée temporairement pour diagnostic
    - N'est plus nécessaire après validation du système
*/

DROP TABLE IF EXISTS public.expense_payment_trigger_debug;
