#!/usr/bin/env node
/**
 * Create a Cashu token to send to someone
 * Usage: node send.js <amount_sats> [mint_url] [--verify]
 * 
 * Options:
 *   --verify  Check proofs are still valid before spending (slower, extra mint roundtrip)
 */

const { getEncodedTokenV4 } = require('@cashu/cashu-ts');
const store = require('./wallet-store');
const { createWallet } = require('../lib/wallet');

async function main() {
  const args = process.argv.slice(2);
  const verify = args.includes('--verify');
  const positional = args.filter(a => !a.startsWith('--'));
  
  const amount = parseInt(positional[0]);
  const mintUrl = positional[1] || store.DEFAULT_MINT;
  
  if (!amount || isNaN(amount) || amount <= 0) {
    console.error('Usage: node send.js <amount_sats> [mint_url] [--verify]');
    console.error('');
    console.error('Options:');
    console.error('  --verify  Check proofs are still valid before spending');
    process.exit(1);
  }
  
  let proofs = store.getProofsForMint(mintUrl);
  let balance = proofs.reduce((s, p) => s + p.amount, 0);
  
  if (balance < amount) {
    console.error(`Insufficient balance at ${mintUrl}`);
    console.error(`Have: ${balance} sats, need: ${amount} sats`);
    process.exit(1);
  }
  
  console.log(`Creating ${amount} sat token from ${mintUrl}...`);
  
  const wallet = await createWallet(mintUrl);
  
  // Optional: verify proofs are still spendable
  if (verify) {
    console.log('Verifying proofs with mint...');
    const spendable = await wallet.checkProofsSpent(proofs);
    const validProofs = proofs.filter((p, i) => !spendable[i].spent);
    
    if (validProofs.length < proofs.length) {
      const spent = proofs.length - validProofs.length;
      console.log(`⚠️  ${spent} proof(s) already spent, removing from wallet`);
      store.saveProofsForMint(mintUrl, validProofs);
      proofs = validProofs;
      balance = proofs.reduce((s, p) => s + p.amount, 0);
      
      if (balance < amount) {
        console.error(`Insufficient balance after removing spent proofs`);
        console.error(`Have: ${balance} sats, need: ${amount} sats`);
        process.exit(1);
      }
    } else {
      console.log('✓ All proofs valid');
    }
  }
  
  // Split proofs: keep some, send some
  const { keep, send } = await wallet.send(amount, proofs);
  
  // Update wallet with remaining proofs
  store.saveProofsForMint(mintUrl, keep);
  
  // Encode token
  const token = getEncodedTokenV4({ mint: mintUrl, proofs: send });
  
  const sentAmount = send.reduce((s, p) => s + p.amount, 0);
  const newBalance = store.getBalanceForMint(mintUrl);
  
  console.log(`\n=== Cashu Token (${sentAmount} sats) ===\n`);
  console.log(token);
  console.log(`\nNew balance: ${newBalance} sats`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
