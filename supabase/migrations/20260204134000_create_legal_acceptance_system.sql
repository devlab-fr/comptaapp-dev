/*
  # Système d'acceptation légale (CGU & IA)

  ## Objectif
  Créer un système de versioning et d'acceptation des conditions légales avec soft gating.
  Permet de tracker les acceptations des CGU et des conditions IA par utilisateur/entreprise.

  ## Tables créées
  
  ### 1. legal_documents
  Stocke les versions des documents légaux (CGU, IA)
  - `id` (uuid, primary key)
  - `key` (text, unique) - Identifiant du document ("cgu", "ia")
  - `version` (text) - Version du document (ex: "1.0.0")
  - `title` (text) - Titre affiché
  - `content_md` (text) - Contenu markdown
  - `is_active` (boolean) - Document actif ou non
  - `created_at` (timestamptz) - Date de création

  ### 2. legal_acceptances
  Stocke les acceptations des documents par utilisateur/entreprise
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null) - Utilisateur ayant accepté
  - `company_id` (uuid, not null) - Entreprise concernée
  - `document_key` (text, not null) - Clé du document accepté
  - `document_version` (text, not null) - Version acceptée
  - `accepted_at` (timestamptz) - Date d'acceptation
  - `context` (jsonb) - Contexte optionnel (source, user agent, etc.)
  
  ### 3. legal_settings_company
  Paramètres légaux par entreprise
  - `company_id` (uuid, primary key)
  - `require_cgu` (boolean) - CGU obligatoires
  - `require_ia` (boolean) - Conditions IA obligatoires

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

ComptaApp est un outil de gestion comptable simplifié destiné aux micro-entrepreneurs et petites entreprises. Le service permet de :

- Gérer les dépenses et revenus
- Suivre la TVA
- Générer des rapports comptables (compte de résultat, bilan)
- Créer des factures
- Scanner des justificatifs avec l''IA (fonctionnalité PRO++)

## 3. Utilisation du service

### 3.1 Responsabilité de l''utilisateur

Vous êtes seul responsable de :
- L''exactitude des données saisies
- La conformité de votre comptabilité avec les réglementations en vigueur
- La validation de vos déclarations fiscales par un professionnel compétent

### 3.2 Limitation de responsabilité

ComptaApp est un outil d''aide à la gestion. Il ne remplace en aucun cas :
- Un expert-comptable
- Un conseiller fiscal
- Un avocat
- Un conseiller financier

**ComptaApp ne fournit aucun conseil fiscal, financier, juridique ou commercial.**

## 4. Données personnelles

Vos données sont traitées conformément à notre Politique de Confidentialité et au RGPD.

## 5. Propriété intellectuelle

Tous les éléments de ComptaApp (code, design, marques) sont protégés par les droits de propriété intellectuelle.

## 6. Modification des CGU

ComptaApp se réserve le droit de modifier ces CGU. En cas de modification substantielle, vous serez invité à accepter la nouvelle version.

## 7. Acceptation

En cliquant sur "J''accepte", vous reconnaissez avoir lu et accepté l''intégralité des présentes Conditions Générales d''Utilisation.

---

*Dernière mise à jour : Janvier 2026*
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

## ⚠️ Important : Nature de l''assistant IA

L''Assistant IA de ComptaApp est un **outil pédagogique et explicatif** uniquement.

## 1. Rôle de l''assistant IA

L''assistant IA peut :
- ✅ Expliquer des concepts comptables de base
- ✅ Vous guider dans l''utilisation de ComptaApp
- ✅ Scanner et extraire des données de justificatifs (tickets, factures)
- ✅ Répondre à des questions techniques sur l''application

## 2. Ce que l''assistant IA ne peut PAS faire

L''assistant IA **ne fournit AUCUN conseil** :
- ❌ Fiscal
- ❌ Financier
- ❌ Bancaire
- ❌ Juridique
- ❌ Commercial
- ❌ Stratégique

**L''assistant IA ne remplace en aucun cas un professionnel (expert-comptable, avocat, conseiller fiscal).**

## 3. Caractère non décisionnel

- L''IA fournit des informations générales uniquement
- Elle n''analyse pas votre situation spécifique
- Elle ne prend aucune décision à votre place
- Ses réponses sont indicatives et peuvent contenir des erreurs

## 4. Responsabilité de l''utilisateur

Vous êtes entièrement responsable de :
- ✓ La vérification de toute information fournie par l''IA
- ✓ Vos décisions comptables et fiscales
- ✓ La consultation de professionnels qualifiés pour toute question importante
- ✓ L''exactitude des données extraites par scan IA (toujours à vérifier)

## 5. Limitations techniques

- L''IA peut commettre des erreurs d''extraction lors du scan
- L''IA peut mal interpréter des questions ambiguës
- L''IA a une connaissance limitée et peut être obsolète
- L''IA ne connaît pas votre contexte spécifique

## 6. Utilisation raisonnable

Vous vous engagez à :
- Ne pas utiliser l''IA pour obtenir des conseils professionnels
- Ne pas vous fier uniquement aux réponses de l''IA pour des décisions importantes
- Toujours vérifier les données extraites par scan
- Consulter un professionnel en cas de doute

## 7. Données et confidentialité

- Les conversations avec l''IA peuvent être enregistrées pour amélioration du service
- Ne partagez jamais d''informations sensibles ou confidentielles avec l''IA
- L''IA utilise des services tiers (OpenAI) soumis à leurs propres conditions

## 8. Acceptation

En cliquant sur "J''accepte", vous reconnaissez :
- ✓ Avoir compris le caractère pédagogique et non décisionnel de l''IA
- ✓ Que l''IA ne remplace aucun professionnel
- ✓ Que l''IA ne fournit aucun conseil fiscal, financier, juridique ou commercial
- ✓ Être seul responsable de vos décisions et de la vérification des informations

---

**EN CAS DE DOUTE, CONSULTEZ TOUJOURS UN PROFESSIONNEL QUALIFIÉ.**

---

*Dernière mise à jour : Janvier 2026*
*Version : 1.0.0*',
  true
) ON CONFLICT (key) DO NOTHING;