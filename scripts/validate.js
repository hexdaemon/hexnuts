#!/usr/bin/env node
/**
 * Validate HexNuts installation and configuration
 * Checks all dependencies and integration points
 */

const fs = require('fs');
const path = require('path');
const archon = require('../lib/archon');
const store = require('./wallet-store');

console.log('=== HexNuts Validation ===\n');

let errors = 0;
let warnings = 0;

// Check @cashu/cashu-ts
try {
  const cashu = require('@cashu/cashu-ts');
  console.log('✓ @cashu/cashu-ts loaded');
  console.log(`  Version: ${require('../package.json').dependencies['@cashu/cashu-ts']}`);
} catch (e) {
  console.log('✗ @cashu/cashu-ts not found - run: npm install');
  errors++;
}

// Check wallet storage
const walletPath = path.join(process.env.HOME, '.config/hex/cashu-wallet.json');
if (fs.existsSync(walletPath)) {
  const balance = store.getTotalBalance();
  console.log(`✓ Wallet exists: ${walletPath}`);
  console.log(`  Balance: ${balance} sats`);
} else {
  console.log('○ Wallet not yet created (will be created on first mint)');
}

// Check archon skills
console.log('\n--- Archon Integration ---');
const skills = archon.getAvailableSkills();

if (skills.nostr) {
  console.log('✓ archon-nostr skill available');
} else {
  console.log('○ archon-nostr skill not found');
  warnings++;
}

if (skills.crypto) {
  console.log('✓ archon-crypto skill available');
} else {
  console.log('○ archon-crypto skill not found');
  warnings++;
}

if (skills.backup) {
  console.log('✓ archon-backup skill available');
} else {
  console.log('○ archon-backup skill not found');
  warnings++;
}

// Check keys
console.log('\n--- Identity Keys ---');
const keys = archon.loadKeys();
if (keys) {
  console.log(`✓ Keys loaded from: ${keys.source}`);
  console.log(`  Pubkey: ${keys.pubkey.slice(0, 16)}...`);
  console.log(`  Privkey: [loaded]`);
} else {
  console.log('✗ No keys found');
  console.log('  Run archon-nostr skill or create ~/.config/hex/nostr.env');
  errors++;
}

// Check default mint
console.log('\n--- Default Mint ---');
const mintUrl = store.DEFAULT_MINT;
console.log(`  URL: ${mintUrl}`);

// Test mint connectivity
const https = require('https');
const http = require('http');
const url = new URL(mintUrl);
const client = url.protocol === 'https:' ? https : http;

let finished = false;

const req = client.get(`${mintUrl}/v1/info`, { timeout: 5000 }, (res) => {
  if (finished) return;
  finished = true;
  if (res.statusCode === 200) {
    console.log('✓ Mint reachable');
  } else {
    console.log(`○ Mint returned status ${res.statusCode}`);
    warnings++;
  }
  finish();
});

req.on('error', (e) => {
  if (finished) return;
  finished = true;
  console.log(`✗ Mint unreachable: ${e.message}`);
  errors++;
  finish();
});

req.on('timeout', () => {
  if (finished) return;
  finished = true;
  console.log('✗ Mint connection timeout');
  errors++;
  req.destroy();
  finish();
});

function finish() {
  console.log('\n--- Summary ---');
  if (errors === 0 && warnings === 0) {
    console.log('✓ All checks passed! HexNuts is production ready.');
  } else if (errors === 0) {
    console.log(`○ ${warnings} warning(s) - HexNuts will work with reduced functionality.`);
  } else {
    console.log(`✗ ${errors} error(s), ${warnings} warning(s) - fix errors before use.`);
    process.exit(1);
  }
}
