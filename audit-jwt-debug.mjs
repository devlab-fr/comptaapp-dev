/**
 * AUDIT SCRIPT — Décoder le JWT access_token d'un utilisateur authentifié
 *
 * Usage:
 * 1. Ouvrir la console navigateur sur l'app
 * 2. Exécuter:
 *    const { data: { session } } = await supabase.auth.getSession();
 *    console.log('ACCESS TOKEN:', session.access_token);
 * 3. Copier le token et le passer à ce script
 */

const accessToken = process.argv[2];

if (!accessToken) {
  console.log('\n❌ Usage: node audit-jwt-debug.mjs <access_token>\n');
  console.log('Pour obtenir le access_token:');
  console.log('1. Ouvrir la console navigateur sur l\'app');
  console.log('2. Exécuter:');
  console.log('   const { data: { session } } = await supabase.auth.getSession();');
  console.log('   console.log(\'ACCESS TOKEN:\', session.access_token);');
  console.log('3. Copier le token et le passer à ce script\n');
  process.exit(1);
}

try {
  const parts = accessToken.split('.');

  if (parts.length !== 3) {
    console.error('❌ JWT invalide (doit avoir 3 parties séparées par des points)');
    process.exit(1);
  }

  // Décoder le header
  const header = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));

  // Décoder le payload
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

  console.log('\n=== AUDIT JWT ACCESS TOKEN ===\n');

  console.log('📋 HEADER:');
  console.log(JSON.stringify(header, null, 2));

  console.log('\n📋 PAYLOAD:');
  console.log(JSON.stringify(payload, null, 2));

  console.log('\n🔍 ANALYSE:');
  console.log('─────────────────────────────────────────────');
  console.log(`Issuer (iss):          ${payload.iss || 'N/A'}`);
  console.log(`Audience (aud):        ${payload.aud || 'N/A'}`);
  console.log(`Subject (sub):         ${payload.sub || 'N/A'}`);
  console.log(`Role:                  ${payload.role || 'N/A'}`);
  console.log(`Email:                 ${payload.email || 'N/A'}`);
  console.log(`Projet Supabase (ref): ${payload.ref || 'N/A'}`);

  const now = Math.floor(Date.now() / 1000);
  const exp = payload.exp;
  const iat = payload.iat;

  if (exp) {
    const expiresAt = new Date(exp * 1000).toISOString();
    const timeLeft = exp - now;
    const isExpired = timeLeft < 0;

    console.log(`Expires at (exp):      ${expiresAt}`);
    console.log(`Issued at (iat):       ${iat ? new Date(iat * 1000).toISOString() : 'N/A'}`);
    console.log(`Status:                ${isExpired ? '❌ EXPIRÉ' : '✅ VALIDE'}`);

    if (!isExpired) {
      const minutes = Math.floor(timeLeft / 60);
      const seconds = timeLeft % 60;
      console.log(`Temps restant:         ${minutes}m ${seconds}s`);
    }
  }

  console.log('─────────────────────────────────────────────');

  console.log('\n🎯 VALIDATION PROJET:');
  const expectedProject = 'lmbxmluyggwvvjpyvlnt';

  // Vérifier si le payload contient une référence au projet
  const projectMatches = payload.ref === expectedProject ||
                        (payload.iss && payload.iss.includes(expectedProject)) ||
                        (payload.aud && payload.aud.includes(expectedProject));

  console.log(`Projet attendu:        ${expectedProject}`);
  console.log(`Projet dans payload:   ${payload.ref || 'N/A'}`);
  console.log(`Correspondance:        ${projectMatches ? '✅ OK' : '❌ MISMATCH'}`);

  if (!projectMatches) {
    console.log('\n⚠️  WARNING: Le JWT ne correspond PAS au projet attendu !');
    console.log('Cela explique pourquoi Supabase rejette le token avec 401.');
  }

  console.log('\n=== FIN AUDIT ===\n');

} catch (error) {
  console.error('❌ Erreur lors du décodage du JWT:', error.message);
  process.exit(1);
}
