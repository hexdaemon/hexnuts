#!/usr/bin/env node
/**
 * Check Cashu wallet balance
 * Usage: node balance.js [mint_url]
 */

const store = require('./wallet-store');

async function main() {
  const mintUrl = process.argv[2];
  
  if (mintUrl) {
    const balance = store.getBalanceForMint(mintUrl);
    console.log(`Balance at ${mintUrl}: ${balance} sats`);
  } else {
    const mints = store.getAllMints();
    const total = store.getTotalBalance();
    
    if (mints.length === 0) {
      console.log('No tokens in wallet');
      return;
    }
    
    console.log('=== Cashu Wallet Balance ===\n');
    for (const mint of mints) {
      const balance = store.getBalanceForMint(mint);
      const proofCount = store.getProofsForMint(mint).length;
      console.log(`${mint}`);
      console.log(`  ${balance} sats (${proofCount} proofs)\n`);
    }
    console.log(`Total: ${total} sats`);
  }
}

main().catch(console.error);
