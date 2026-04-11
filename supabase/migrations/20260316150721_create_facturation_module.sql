/*
  # Module de Facturation

  ## Nouvelles Tables
  
  ### 1. clients
  - Gestion des clients (particuliers et entreprises)
  
  ### 2. factures
  - Factures émises
  
  ### 3. lignes_factures
  - Lignes de détail des factures

  ## Sécurité
  - Enable RLS sur toutes les tables
  - Policies restrictives : accès limité aux membres de l'entreprise
*/

-- Table clients
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type_client text NOT NULL CHECK (type_client IN ('particulier', 'entreprise')),
  nom text,
  raison_sociale text,
  adresse text NOT NULL,
  pays text NOT NULL,
  email text,
  siren text,
  tva_intracommunautaire text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT client_nom_or_raison CHECK (
    (type_client = 'particulier' AND nom IS NOT NULL) OR
    (type_client = 'entreprise' AND raison_sociale IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_clients_company_id ON clients(company_id);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Policies pour clients
CREATE POLICY "Members can view clients"
  ON clients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = clients.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and admins can insert clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = clients.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can update clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = clients.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = clients.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners can delete clients"
  ON clients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = clients.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role = 'owner'
    )
  );

-- Table factures
CREATE TABLE IF NOT EXISTS factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  numero_facture text NOT NULL,
  date_facture date NOT NULL DEFAULT CURRENT_DATE,
  statut_paiement text NOT NULL DEFAULT 'non_payee' CHECK (statut_paiement IN ('non_payee', 'payee')),
  date_paiement date,
  montant_total_ht numeric(12,2) NOT NULL DEFAULT 0,
  montant_total_tva numeric(12,2) NOT NULL DEFAULT 0,
  montant_total_ttc numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_numero_facture_per_company UNIQUE (company_id, numero_facture),
  CONSTRAINT date_paiement_if_payee CHECK (
    (statut_paiement = 'payee' AND date_paiement IS NOT NULL) OR
    (statut_paiement = 'non_payee')
  )
);

CREATE INDEX IF NOT EXISTS idx_factures_company_id ON factures(company_id);
CREATE INDEX IF NOT EXISTS idx_factures_client_id ON factures(client_id);
CREATE INDEX IF NOT EXISTS idx_factures_numero ON factures(company_id, numero_facture);

ALTER TABLE factures ENABLE ROW LEVEL SECURITY;

-- Policies pour factures
CREATE POLICY "Members can view factures"
  ON factures FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = factures.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and admins can insert factures"
  ON factures FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = factures.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can update factures"
  ON factures FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = factures.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = factures.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners can delete factures"
  ON factures FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = factures.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role = 'owner'
    )
  );

-- Table lignes_factures
CREATE TABLE IF NOT EXISTS lignes_factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantite numeric(10,2) NOT NULL DEFAULT 1,
  prix_unitaire_ht numeric(12,2) NOT NULL,
  taux_tva numeric(5,2) NOT NULL DEFAULT 20.00,
  montant_ht numeric(12,2) NOT NULL,
  montant_tva numeric(12,2) NOT NULL,
  montant_ttc numeric(12,2) NOT NULL,
  ordre integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lignes_factures_facture_id ON lignes_factures(facture_id);

ALTER TABLE lignes_factures ENABLE ROW LEVEL SECURITY;

-- Policies pour lignes_factures
CREATE POLICY "Members can view lignes_factures"
  ON lignes_factures FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM factures
      JOIN memberships ON memberships.company_id = factures.company_id
      WHERE factures.id = lignes_factures.facture_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and admins can insert lignes_factures"
  ON lignes_factures FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM factures
      JOIN memberships ON memberships.company_id = factures.company_id
      WHERE factures.id = lignes_factures.facture_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can update lignes_factures"
  ON lignes_factures FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM factures
      JOIN memberships ON memberships.company_id = factures.company_id
      WHERE factures.id = lignes_factures.facture_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM factures
      JOIN memberships ON memberships.company_id = factures.company_id
      WHERE factures.id = lignes_factures.facture_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can delete lignes_factures"
  ON lignes_factures FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM factures
      JOIN memberships ON memberships.company_id = factures.company_id
      WHERE factures.id = lignes_factures.facture_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

-- Fonction pour générer le prochain numéro de facture
CREATE OR REPLACE FUNCTION generate_numero_facture(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year text;
  v_max_num integer;
  v_new_num text;
BEGIN
  v_year := to_char(CURRENT_DATE, 'YYYY');

  SELECT COALESCE(MAX(
    CASE
      WHEN numero_facture ~ ('^F-' || v_year || '-[0-9]+$')
      THEN CAST(substring(numero_facture from '[0-9]+$') AS integer)
      ELSE 0
    END
  ), 0) INTO v_max_num
  FROM factures
  WHERE company_id = p_company_id;

  v_new_num := 'F-' || v_year || '-' || LPAD((v_max_num + 1)::text, 4, '0');

  RETURN v_new_num;
END;
$$;

-- Trigger pour mettre à jour updated_at sur clients
CREATE OR REPLACE FUNCTION update_clients_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW
EXECUTE FUNCTION update_clients_updated_at();

-- Trigger pour mettre à jour updated_at sur factures
CREATE OR REPLACE FUNCTION update_factures_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER factures_updated_at
BEFORE UPDATE ON factures
FOR EACH ROW
EXECUTE FUNCTION update_factures_updated_at();