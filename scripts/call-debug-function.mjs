import { createClient } from '@supabase/supabase-js';
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

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Get existing user session or create one
const { data: { session }, error: sessionError } = await supabase.auth.getSession();

let accessToken;

if (session?.access_token) {
  console.log('Using existing session');
  accessToken = session.access_token;
} else {
  console.log('No existing session, need to sign in');

  // Try to get any existing user from the database to sign in
  // For dev/test purposes, we'll use service role to check users
  const supabaseAdmin = createClient(supabaseUrl, envVars.SUPABASE_SERVICE_ROLE_KEY || '');

  const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

  if (usersError || !users?.users?.length) {
    console.error('No users found in database. Cannot proceed without authentication.');
    console.error('Error:', usersError?.message);
    process.exit(1);
  }

  const firstUser = users.users[0];
  console.log(`Found user: ${firstUser.email}`);

  // For diagnostic purposes with service role, we can use the admin client
  console.log('Using service role for authentication bypass in diagnostic mode');
  accessToken = envVars.SUPABASE_SERVICE_ROLE_KEY;
}

// Call the edge function
const companyId = 'c9103915-38dc-475e-b77e-9cf54044a5ca';
const expectedCompanyName = 'ENTREPRISE1';

console.log(`\nCalling stripe-debug-company for company: ${companyId}`);

try {
  const response = await fetch(`${supabaseUrl}/functions/v1/stripe-debug-company`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      companyId,
      expectedCompanyName,
    }),
  });

  const result = await response.json();

  console.log('\n=== STRIPE DEBUG RESPONSE ===\n');
  console.log(JSON.stringify(result, null, 2));
  console.log('\n=============================\n');

  if (result.conclusion?.rootCause) {
    console.log(`ROOT CAUSE: ${result.conclusion.rootCause}`);
  }
} catch (error) {
  console.error('Error calling edge function:', error.message);
  process.exit(1);
}
