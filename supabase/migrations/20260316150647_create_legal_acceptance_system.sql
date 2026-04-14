/*
  # Système d'acceptation légale (CGU & IA)

  ## Tables créées
  
  ### 1. legal_documents
  Stocke les versions des documents légaux (CGU, IA)
  
  ### 2. legal_acceptances
  Stocke les acceptations des documents par utilisateur/entreprise
  
  ### 3. legal_settings_company
  Paramètres légaux par entreprise

  ## Sécurité (RLS)
  - legal_documents: lecture publique authentifiée (documents actifs uniquement)
  - legal_acceptances: utilisateur peut lire/créer ses propres acceptations
  - legal_settings_company: lecture sur entreprise accessible

  ## Seed Data
  - CGU v1.0.0
  - Conditions IA v1.0.0
*/

-- Table des documents légaux (versions)
CREATE TABLE IF NOT EXISTS legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  version text NOT NULL,
  title text NOT NULL,
  content_md text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Table des acceptations
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_key text NOT NULL,
  document_version text NOT NULL,
  accepted_at timestamptz DEFAULT now() NOT NULL,
  context jsonb
);

-- Index unique pour éviter les doublons d'acceptation
CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_user_company_doc_version_idx 
  ON legal_acceptances(user_id, company_id, document_key, document_version);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS legal_acceptances_user_id_idx ON legal_acceptances(user_id);
CREATE INDEX IF NOT EXISTS legal_acceptances_company_id_idx ON legal_acceptances(company_id);

-- Table des paramètres légaux par entreprise
CREATE TABLE IF NOT EXISTS legal_settings_company (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  require_cgu boolean DEFAULT true,
  require_ia boolean DEFAULT true
);

-- Enable RLS
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_settings_company ENABLE ROW LEVEL SECURITY;

-- RLS Policies pour legal_documents (lecture publique des documents actifs)
CREATE POLICY "Authenticated users can read active legal documents"
  ON legal_documents FOR SELECT
  TO authenticated
  USING (is_active = true);

-- RLS Policies pour legal_acceptances
CREATE POLICY "Users can view their own legal acceptances"
  ON legal_acceptances FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    AND company_id IN (
      SELECT company_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own legal acceptances"
  ON legal_acceptances FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() 
    AND company_id IN (
      SELECT company_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- RLS Policies pour legal_settings_company
CREATE POLICY "Users can view legal settings for their companies"
  ON legal_settings_company FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Seed data: Document CGU v1.0.0
INSERT INTO legal_documents (key, version, title, content_md, is_active)
VALUES (
  'cgu',
  '1.0.0',
  'Conditions Générales d''Utilisation (CGU)',
  '# Conditions Générales d''Utilisation

## 1. Acceptation des conditions

En utilisant ComptaApp, vous acceptez d''être lié par les présentes Conditions Générales d''Utilisation.

## 2. Description du service

ComptaApp est un outil de gestion comptable simplifié destiné aux micro-entrepreneurs et petites entreprises.

## 3. Utilisation du service

### 3.1 Responsabilité de l''utilisateur

Vous êtes seul responsable de l''exactitude des données saisies et de la conformité de votre comptabilité.

### 3.2 Limitation de responsabilité

ComptaApp est un outil d''aide à la gestion. Il ne remplace en aucun cas un expert-comptable ou un conseiller fiscal.

**ComptaApp ne fournit aucun conseil fiscal, financier, juridique ou commercial.**

## 4. Acceptation

En cliquant sur "J''accepte", vous reconnaissez avoir lu et accepté l''intégralité des présentes CGU.

---

*Version : 1.0.0*',
  true
) ON CONFLICT (key) DO NOTHING;

-- Seed data: Document Conditions IA v1.0.0
INSERT INTO legal_documents (key, version, title, content_md, is_active)
VALUES (
  'ia',
  '1.0.0',
  'Assistant IA — Conditions d''utilisation',
  '# Assistant IA — Conditions d''utilisation

## Important

L''Assistant IA de ComptaApp est un outil pédagogique et explicatif uniquement.

## 1. Rôle de l''assistant IA

L''assistant IA peut expliquer des concepts comptables de base et vous guider dans l''utilisation de ComptaApp.

## 2. Ce que l''assistant IA ne peut PAS faire

L''assistant IA ne fournit AUCUN conseil fiscal, financier, bancaire, juridique, commercial ou stratégique.

## 3. Responsabilité de l''utilisateur

Vous êtes entièrement responsable de la vérification de toute information fournie par l''IA et de vos décisions comptables.

## 4. Acceptation

En cliquant sur "J''accepte", vous reconnaissez que l''IA ne remplace aucun professionnel et ne fournit aucun conseil.

---

*Version : 1.0.0*',
  true
) ON CONFLICT (key) DO NOTHING;