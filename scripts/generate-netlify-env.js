#!/usr/bin/env node
/**
 * Reads app/.env (or app/.env.local) and writes app/.env.netlify with server-only
 * variable names for Netlify. Then run from app/: netlify env:import .env.netlify
 * Do not commit .env.netlify (app/.gitignore already has .env*).
 */

const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'app');
const envPaths = [
  path.join(appDir, '.env'),
  path.join(appDir, '.env.local'),
];
const outPath = path.join(appDir, '.env.netlify');

let raw = '';
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    raw = fs.readFileSync(p, 'utf8');
    break;
  }
}
if (!raw) {
  console.error('No app/.env or app/.env.local found');
  process.exit(1);
}

const vars = {};
for (const line of raw.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

// Map NEXT_PUBLIC_* (or already server-only names) to Netlify server-only names
const out = [
  `ESCROW_CONTRACT_ADDRESS=${vars.ESCROW_CONTRACT_ADDRESS ?? vars.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS ?? ''}`,
  `DISPUTE_RESOLVER_ADDRESS=${vars.DISPUTE_RESOLVER_ADDRESS ?? vars.NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS ?? ''}`,
  `CHAIN_ID=${vars.CHAIN_ID ?? vars.NEXT_PUBLIC_CHAIN_ID ?? '421614'}`,
  `RPC_URL=${vars.RPC_URL ?? vars.NEXT_PUBLIC_RPC_URL ?? 'https://sepolia-rollup.arbitrum.io/rpc'}`,
  `RPC_URLS=${vars.RPC_URLS ?? vars.NEXT_PUBLIC_RPC_URLS ?? ''}`,
  `FHENIX_ENV=${vars.FHENIX_ENV ?? vars.NEXT_PUBLIC_FHENIX_ENV ?? 'TESTNET'}`,
].join('\n');

fs.writeFileSync(outPath, out);
console.log('Wrote app/.env.netlify. Run: cd app && netlify env:import .env.netlify');
