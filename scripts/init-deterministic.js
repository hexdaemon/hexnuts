#!/usr/bin/env node
/**
 * Initialize HexNuts in deterministic mode (NUT-13)
 * 
 * Uses Archon mnemonic as the seed for deterministic secret derivation.
 * Requires ARCHON_PASSPHRASE environment variable.
 * 
 * Usage: 
 *   ARCHON_PASSPHRASE=... node init-deterministic.js
 *   node init-deterministic.js --check   # Just check if available
 */

const { Wallet } = require('@cashu/cashu-ts');
const deterministic = require('../lib/deterministic');
const store = require('./wallet-store');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(process.env.HOME, '.config/hex/cashu-config.json');

async function main() {
  const checkOnly = process.argv.includes('--check');
  
  console.log('=== HexNuts Deterministic Mode (NUT-13) ===\n');
  
  // Check prerequisites
  console.log('Checking prerequisites...');
  
  if (!process.env.ARCHON_PASSPHRASE) {
    console.log('✗ ARCHON_PASSPHRASE not set');
    console.log('\nTo enable deterministic mode:');
    console.log('  export ARCHON_PASSPHRASE="your-archon-passphrase"');
    console.log('  node init-deterministic.js');
    process.exit(1);
  }
  console.log('✓ ARCHON_PASSPHRASE set');
  
  // Try to get mnemonic
  const mnemonic = deterministic.getMnemonic();
  if (!mnemonic) {
    console.log('✗ Could not retrieve Archon mnemonic');
    console.log('  Ensure Archon wallet exists at ~/.config/hex/archon/');
    process.exit(1);
  }
  console.log('✓ Archon mnemonic accessible');
  console.log(`  Words: ${mnemonic.split(' ').length}`);
  
  // Derive Cashu seed
  const seed = deterministic.deriveCashuSeed();
  if (!seed) {
    console.log('✗ Could not derive Cashu seed');
    process.exit(1);
  }
  console.log('✓ Cashu seed derived');
  console.log(`  Fingerprint: ${seed.slice(0, 4).toString('hex')}...`);
  
  if (checkOnly) {
    console.log('\n✓ Deterministic mode is available!');
    console.log('  Run without --check to initialize.');
    return;
  }
  
  // Load counters
  const counters = deterministic.loadCounters();
  console.log(`✓ Counter state: ${Object.keys(counters).length} keysets tracked`);
  
  // Test with default mint
  const mintUrl = store.DEFAULT_MINT;
  console.log(`\nInitializing wallet with ${mintUrl}...`);
  
  try {
    const wallet = new Wallet(mintUrl, {
      unit: 'sat',
      bip39seed: seed,
      counterInit: counters
    });
    
    await wallet.loadMint();
    
    // Set up counter persistence
    wallet.on.countersReserved(({ keysetId, start, count, next }) => {
      console.log(`  Counter reserved: ${keysetId} -> ${next}`);
      deterministic.updateCounter(keysetId, next);
    });
    
    console.log('✓ Wallet initialized in deterministic mode');
    console.log(`  Keyset: ${wallet.keysetId}`);
    
    // Save config
    const config = {
      mode: 'deterministic',
      initialized: new Date().toISOString(),
      defaultMint: mintUrl,
      keysetId: wallet.keysetId
    };
    
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    console.log('\n=== Deterministic Mode Enabled ===');
    console.log('\nBenefits:');
    console.log('  • Wallet derived from Archon mnemonic');
    console.log('  • No separate seed phrase needed');
    console.log('  • Recover wallet by recovering Archon identity');
    console.log('  • Counter state saved to ~/.config/hex/cashu-counters.json');
    console.log('\nTo use deterministic mode, always set ARCHON_PASSPHRASE:');
    console.log('  export ARCHON_PASSPHRASE=...');
    console.log('  node scripts/mint.js 100');
    
  } catch (err) {
    console.error('✗ Wallet initialization failed:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
