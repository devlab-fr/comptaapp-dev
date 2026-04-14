/*
  # Create bank_match_memory table (V3 Phase 1)

  1. New Tables
    - `bank_match_memory`
      - `id` (uuid, primary key)
      - `company_id` (uuid, not null)
      - `normalized_label` (text, not null) - Libellé bancaire normalisé
      - `account_code` (text, not null) - Code compte comptable (6xx, 7xx)
      - `journal_code` (text, not null) - Code journal (ACH, VT, BQ, etc.)
      - `usage_count` (int, not null, default 1) - Nombre d'utilisations
      - `last_used_at` (timestamptz, not null) - Dernière utilisation
      - `created_at` (timestamptz, not null)
      - UNIQUE(company_id, normalized_label, account_code)

  2. Purpose
    - Store user matching decisions for learning
    - Enable future scoring improvements based on usage patterns
    - Passive storage only - no impact on current matching logic

  3. Security
    - Enable RLS on table
    - Members can read their company's memory
    - Write operations only via SQL functions (not from frontend)

  4. Notes
    - Phase 1: Storage only, no scoring impact yet
    - No modifications to existing functions or frontend
    - Memory capture is non-blocking (errors are silently ignored)
    - Only business accounts (6xx, 7xx) are stored, not 512/401/411
*/

-- ============================================
-- 1. CREATE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS bank_match_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  normalized_label text NOT NULL,
  account_code text NOT NULL CHECK (account_code ~ '^[0-9]+$'),
  journal_code text NOT NULL CHECK (journal_code ~ '^[A-Z]+$'),
  usage_count int NOT NULL DEFAULT 1 CHECK (usage_count > 0),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_company_label_account UNIQUE (company_id, normalized_label, account_code)
);

-- ============================================
-- 2. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_bank_match_memory_company_label
ON bank_match_memory(company_id, normalized_label);

CREATE INDEX IF NOT EXISTS idx_bank_match_memory_company_label_usage
ON bank_match_memory(company_id, normalized_label, usage_count DESC);

-- ============================================
-- 3. RLS POLICIES
-- ============================================

ALTER TABLE bank_match_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view company bank match memory"
  ON bank_match_memory FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_match_memory.company_id
      AND memberships.user_id = auth.uid()
    )
  );

-- Note: No INSERT/UPDATE/DELETE policies - write operations only via SQL functions
