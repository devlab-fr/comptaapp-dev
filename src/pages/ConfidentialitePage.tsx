import LegalPageLayout from '../components/legal/LegalPageLayout';

export default function ConfidentialitePage() {
  return (
    <LegalPageLayout title="POLITIQUE DE CONFIDENTIALITÉ" updatedAt="22 janvier 2026">
      <h2>Responsable du traitement</h2>
      <p>SHOPTOO FZ-LLC<br />
      Free Zone Limited Liability Company (FZ-LLC)<br />
      FBC51082, Compass Building, Al Shohada Road<br />
      Al Hamra Industrial Zone – FZ<br />
      Ras Al Khaimah, United Arab Emirates<br />
      Email : manager.s.ram@gmail.com</p>

      <h2>1. Collecte des données</h2>
      <p>Dans le cadre de l'utilisation du service ComptaApp, SHOPTOO FZ-LLC peut collecter les données suivantes :</p>
      <ul>
        <li>Données d'identification (nom, prénom, email)</li>
        <li>Données relatives à l'entreprise</li>
        <li>Données comptables et financières (factures, dépenses, revenus)</li>
        <li>Données de connexion (logs, adresse IP)</li>
      </ul>
      <p>Les données comptables et financières sont considérées comme sensibles.</p>

      <h2>2. Finalité du traitement</h2>
      <p>Les données collectées sont utilisées exclusivement pour :</p>
      <ul>
        <li>Fournir le service ComptaApp</li>
        <li>Assurer la sécurité et le bon fonctionnement de la plateforme</li>
        <li>Améliorer le service</li>
        <li>Respecter les obligations légales applicables</li>
      </ul>
      <p>Aucune donnée n'est utilisée à des fins commerciales tierces.</p>

      <h2>3. Durée de conservation</h2>
      <p>Les données sont conservées pendant la durée nécessaire aux finalités pour lesquelles elles sont collectées, et conformément aux obligations légales applicables, notamment comptables et fiscales.</p>

      <h2>4. Sécurité des données</h2>
      <p>SHOPTOO FZ-LLC met en œuvre des mesures techniques et organisationnelles appropriées afin de garantir la sécurité et la confidentialité des données.<br />
      Les données sont hébergées sur des serveurs sécurisés (Supabase) avec chiffrement en transit et au repos.<br />
      L'accès aux données est strictement limité au personnel autorisé.</p>

      <h2>5. Droits des utilisateurs</h2>
      <p>Les utilisateurs disposent des droits suivants concernant leurs données personnelles :</p>
      <ul>
        <li>Droit d'accès</li>
        <li>Droit de rectification</li>
        <li>Droit à l'effacement, sous réserve des obligations légales</li>
        <li>Droit à la limitation du traitement</li>
        <li>Droit à la portabilité</li>
        <li>Droit d'opposition au traitement</li>
      </ul>
      <p>Toute demande peut être adressée à : manager.s.ram@gmail.com</p>

      <h2>6. Cookies</h2>
      <p>ComptaApp utilise uniquement des cookies strictement nécessaires au fonctionnement du service (authentification, session).<br />
      Aucun cookie de suivi ou publicitaire n'est utilisé.</p>

      <h2>7. Non-revente des données</h2>
      <p>SHOPTOO FZ-LLC s'engage à ne jamais vendre, louer ou céder les données personnelles ou comptables des utilisateurs à des tiers.<br />
      Les données restent la propriété exclusive de l'utilisateur.</p>

      <h2>8. Droit applicable et juridiction</h2>
      <p>La présente politique de confidentialité est régie par le droit des Émirats Arabes Unis.<br />
      Tout litige relève de la compétence exclusive des tribunaux des Émirats Arabes Unis, nonobstant le pays de résidence de l'utilisateur.</p>
    </LegalPageLayout>
  );
}
