#!/usr/bin/env node
/**
 * Recover wallet from Archon mnemonic (NUT-13)
 * 
 * Scans the mint for proofs that match the deterministic derivation.
 * Requires ARCHON_PASSPHRASE environment variable.
 * 
 * Usage: 
 *   ARCHON_PASSPHRASE=... node recover.js [mint_url]
 */

const { Wallet } = require('@cashu/cashu-ts');
const deterministic = require('../lib/deterministic');
const store = require('./wallet-store');

async function main() {
  const mintUrl = process.argv[2] || store.DEFAULT_MINT;
  
  console.log('=== HexNuts Recovery (NUT-13) ===\n');
  
  if (!process.env.ARCHON_PASSPHRASE) {
    console.error('ARCHON_PASSPHRASE required for recovery');
    console.error('  export ARCHON_PASSPHRASE="your-passphrase"');
    process.exit(1);
  }
  
  const seed = deterministic.deriveCashuSeed();
  if (!seed) {
    console.error('Could not derive seed from Archon mnemonic');
    process.exit(1);
  }
  
  console.log(`Recovering from: ${mintUrl}`);
  console.log(`Seed fingerprint: ${seed.slice(0, 4).toString('hex')}...`);
  
  // Load existing counters (recovery will scan beyond these)
  const counters = deterministic.loadCounters();
  console.log(`Starting counters: ${JSON.stringify(counters)}`);
  
  try {
    const wallet = new Wallet(mintUrl, {
      unit: 'sat',
      bip39seed: seed,
      counterInit: counters
    });
    
    await wallet.loadMint();
    console.log(`Keyset: ${wallet.keysetId}`);
    
    // Batch restore scans for proofs
    console.log('\nScanning for proofs...');
    const result = await wallet.batchRestore();
    
    if (result.proofs && result.proofs.length > 0) {
      const amount = result.proofs.reduce((s, p) => s + p.amount, 0);
      console.log(`\n✓ Recovered ${result.proofs.length} proofs (${amount} sats)`);
      
      // Save recovered proofs
      store.addProofsForMint(mintUrl, result.proofs);
      console.log('  Proofs added to wallet');
      
      // Update counter past recovered proofs
      if (result.lastCounterWithSignature != null) {
        const next = result.lastCounterWithSignature + 1;
        deterministic.updateCounter(wallet.keysetId, next);
        console.log(`  Counter advanced to ${next}`);
      }
    } else {
      console.log('\n○ No proofs found to recover');
      console.log('  (This is normal for a fresh wallet)');
    }
    
    const balance = store.getBalanceForMint(mintUrl);
    console.log(`\nFinal balance at ${mintUrl}: ${balance} sats`);
    
  } catch (err) {
    console.error('Recovery failed:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
