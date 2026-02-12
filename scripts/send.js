#!/usr/bin/env node
/**
 * Create a Cashu token to send to someone
 * Usage: node send.js <amount_sats> [mint_url]
 */

const { Wallet, getEncodedTokenV4 } = require('@cashu/cashu-ts');
const store = require('./wallet-store');

async function main() {
  const amount = parseInt(process.argv[2]);
  const mintUrl = process.argv[3] || store.DEFAULT_MINT;
  
  if (!amount || isNaN(amount) || amount <= 0) {
    console.error('Usage: node send.js <amount_sats> [mint_url]');
    process.exit(1);
  }
  
  const proofs = store.getProofsForMint(mintUrl);
  const balance = proofs.reduce((s, p) => s + p.amount, 0);
  
  if (balance < amount) {
    console.error(`Insufficient balance at ${mintUrl}`);
    console.error(`Have: ${balance} sats, need: ${amount} sats`);
    process.exit(1);
  }
  
  console.log(`Creating ${amount} sat token from ${mintUrl}...`);
  
  const wallet = new Wallet(mintUrl);
  await wallet.loadMint();
  
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
