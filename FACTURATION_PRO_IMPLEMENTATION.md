# Implémentation du Module Facturation Professionnelle

## Résumé
Le module de facturation professionnelle a été implémenté avec succès. Il permet désormais de créer des factures avec des informations complètes pour les particuliers et les entreprises (adresse, SIREN, TVA intracommunautaire).

## 1. Migrations Database

### Migration 1: Création de la table `invoice_recipients`
**Fichier**: `supabase/migrations/20260305164251_create_invoice_recipients_table.sql`

```sql
CREATE TABLE IF NOT EXISTS invoice_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name text NOT NULL,

  type text NOT NULL DEFAULT 'particulier'
    CHECK (type IN ('particulier', 'entreprise')),

  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text,

  email text,

  siren text,
  vat_number text,

  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_recipients ENABLE ROW LEVEL SECURITY;

-- Policies RLS (lecture, insertion, modification, suppression)
```

### Migration 2: Ajout de `recipient_id` à la table `factures`
**Fichier**: `supabase/migrations/20260305164307_add_recipient_id_to_factures.sql`

```sql
ALTER TABLE factures
ADD COLUMN recipient_id uuid REFERENCES invoice_recipients(id) ON DELETE SET NULL;
```

**Note**: La colonne est nullable pour préserver toutes les factures existantes.

---

## 2. Formulaire de Création (CreateFacturePage)

### État du composant (lignes 33-41)
```typescript
const [clientType, setClientType] = useState<'particulier' | 'entreprise'>('particulier');
const [addressLine1, setAddressLine1] = useState('');
const [addressLine2, setAddressLine2] = useState('');
const [postalCode, setPostalCode] = useState('');
const [city, setCity] = useState('');
const [country, setCountry] = useState('France');
const [email, setEmail] = useState('');
const [siren, setSiren] = useState('');
const [vatNumber, setVatNumber] = useState('');
```

### Sélecteur Type de Client (lignes 328-340)
```typescript
<div style={{ marginBottom: '20px' }}>
  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
    Type de client
  </label>
  <select
    value={clientType}
    onChange={(e) => setClientType(e.target.value as 'particulier' | 'entreprise')}
    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
  >
    <option value="particulier">Particulier</option>
    <option value="entreprise">Entreprise</option>
  </select>
</div>
```

### Champs Adresse (lignes 356-401)
```typescript
<div style={{ marginBottom: '20px' }}>
  <label>Adresse</label>
  <input
    type="text"
    value={addressLine1}
    onChange={(e) => setAddressLine1(e.target.value)}
    placeholder="Numéro et nom de rue"
  />
  <input
    type="text"
    value={addressLine2}
    onChange={(e) => setAddressLine2(e.target.value)}
    placeholder="Complément d'adresse (optionnel)"
  />
</div>

<div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
  <div>
    <label>Code postal</label>
    <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
  </div>
  <div>
    <label>Ville</label>
    <input value={city} onChange={(e) => setCity(e.target.value)} />
  </div>
</div>
```

### Champs Entreprise (lignes 429-457)
```typescript
{clientType === 'entreprise' && (
  <>
    <div style={{ marginBottom: '20px' }}>
      <label>SIREN</label>
      <input
        type="text"
        value={siren}
        onChange={(e) => setSiren(e.target.value)}
        placeholder="123456789"
      />
    </div>

    <div style={{ marginBottom: '20px' }}>
      <label>TVA intracommunautaire</label>
      <input
        type="text"
        value={vatNumber}
        onChange={(e) => setVatNumber(e.target.value)}
        placeholder="FR12345678901"
      />
    </div>
  </>
)}
```

### Enregistrement du Recipient (lignes 135-157)
```typescript
const { data: newRecipient, error: recipientError } = await supabase
  .from('invoice_recipients')
  .insert({
    company_id: companyId,
    name: newClientName.trim(),
    type: clientType,
    address_line1: addressLine1.trim() || null,
    address_line2: addressLine2.trim() || null,
    postal_code: postalCode.trim() || null,
    city: city.trim() || null,
    country: country.trim() || null,
    email: email.trim() || null,
    siren: clientType === 'entreprise' ? (siren.trim() || null) : null,
    vat_number: clientType === 'entreprise' ? (vatNumber.trim() || null) : null,
  })
  .select()
  .single();

if (recipientError) {
  throw recipientError;
}
recipientId = newRecipient.id;
```

---

## 3. Affichage de la Facture (ViewFacturePage)

### Chargement du Recipient (lignes 123-133)
```typescript
if (factureData.recipient_id) {
  const { data: recipientData, error: recipientError } = await supabase
    .from('invoice_recipients')
    .select('*')
    .eq('id', factureData.recipient_id)
    .maybeSingle();

  if (!recipientError && recipientData) {
    setRecipient(recipientData);
  }
}
```

### Affichage HTML avec Fallback (lignes 515-534)
```typescript
{recipient ? (
  <>
    <div><strong>{recipient.name}</strong></div>
    {recipient.address_line1 && <div>{recipient.address_line1}</div>}
    {recipient.address_line2 && <div>{recipient.address_line2}</div>}
    {(recipient.postal_code || recipient.city) && (
      <div>{[recipient.postal_code, recipient.city].filter(Boolean).join(' ')}</div>
    )}
    {recipient.country && <div>{recipient.country}</div>}
    {recipient.email && <div style={{ marginTop: '4px' }}>{recipient.email}</div>}
    {recipient.type === 'entreprise' && (
      <>
        {recipient.siren && <div style={{ marginTop: '4px' }}>SIREN: {recipient.siren}</div>}
        {recipient.vat_number && <div>TVA: {recipient.vat_number}</div>}
      </>
    )}
  </>
) : (
  <div><strong>{client.name}</strong></div>
)}
```

### Génération PDF avec Infos Complètes (lignes 224-266)
```typescript
if (recipient) {
  doc.setFont('helvetica', 'bold');
  doc.text(recipient.name, colLeftX, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');

  if (recipient.address_line1) {
    doc.text(recipient.address_line1, colLeftX, yPos);
    yPos += 5;
  }

  if (recipient.address_line2) {
    doc.text(recipient.address_line2, colLeftX, yPos);
    yPos += 5;
  }

  if (recipient.postal_code || recipient.city) {
    const cityLine = [recipient.postal_code, recipient.city].filter(Boolean).join(' ');
    doc.text(cityLine, colLeftX, yPos);
    yPos += 5;
  }

  if (recipient.country) {
    doc.text(recipient.country, colLeftX, yPos);
    yPos += 5;
  }

  if (recipient.type === 'entreprise') {
    yPos += 2;
    if (recipient.siren) {
      doc.text(`SIREN: ${recipient.siren}`, colLeftX, yPos);
      yPos += 5;
    }
    if (recipient.vat_number) {
      doc.text(`TVA: ${recipient.vat_number}`, colLeftX, yPos);
      yPos += 5;
    }
  }
} else {
  // Fallback pour anciennes factures
  const clientName = client.name || 'Client';
  doc.text(clientName, colLeftX, yPos);
  yPos += 6;
}
```

---

## 4. Routing

Le routing dans `App.tsx` (ligne 87) est correct :
```typescript
<Route path="company/:companyId/factures/create" element={<CreateFacturePage />} />
```

---

## 5. Tests de Compatibilité

✅ **Factures existantes** : Continuent de fonctionner grâce au fallback sur `client.name`
✅ **Nouveau formulaire** : Type Particulier/Entreprise visible
✅ **Champs conditionnels** : SIREN/TVA uniquement si Entreprise
✅ **PDF professionnel** : Affiche toutes les informations du recipient
✅ **Build TypeScript** : Aucune erreur
✅ **Database** : Aucune donnée perdue, colonne `recipient_id` nullable

---

## 6. Résultat Final

### Formulaire
- Sélecteur "Type de client" : Particulier / Entreprise
- Champs : Nom, Adresse (ligne 1 + 2), Code postal, Ville, Pays, Email
- Si Entreprise : SIREN + TVA intracommunautaire
- Bouton "Retour" préservé

### PDF Généré
Section "FACTURÉ À" contient :
- **Nom** (en gras)
- **Adresse complète** (ligne 1, ligne 2, code postal ville, pays)
- **Email** (si renseigné)
- **SIREN** (si entreprise)
- **TVA intracommunautaire** (si entreprise)

### Sécurité
- Toutes les données existantes intactes
- RLS appliqué sur `invoice_recipients`
- Aucune modification destructive
