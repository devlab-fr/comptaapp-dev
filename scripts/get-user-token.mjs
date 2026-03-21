import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Load .env
const envContent = readFileSync(resolve(projectRoot, '.env'), 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseAnonKey = envVars.VITE_SUPABASE_ANON_KEY;

// Get any user from the system and create a session
// This uses the auth API to list users (requires service role in edge function context)
// For now, we'll use a direct SQL approach via the edge function itself

console.log('SUPABASE_URL:', supabaseUrl);
console.log('Using anon key (first 20 chars):', supabaseAnonKey.substring(0, 20) + '...');

// Try to call with anon key directly and see what the edge function returns
const companyId = 'c9103915-38dc-475e-b77e-9cf54044a5ca';
const expectedCompanyName = 'ENTREPRISE1';

try {
  const response = await fetch(`${supabaseUrl}/functions/v1/stripe-debug-company`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({
      companyId,
      expectedCompanyName,
    }),
  });

  const result = await response.json();
  console.log('\n=== Response Status:', response.status, '===\n');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error:', error.message);
}
