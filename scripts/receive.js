#!/usr/bin/env node
/**
 * Receive a Cashu token
 * Usage: node receive.js <cashu_token>
 */

const { Wallet, getDecodedToken } = require('@cashu/cashu-ts');
const store = require('./wallet-store');

async function main() {
  const token = process.argv[2];
  
  if (!token) {
    console.error('Usage: node receive.js <cashu_token>');
    process.exit(1);
  }
  
  // Decode token to get mint URL
  const decoded = getDecodedToken(token);
  const mintUrl = decoded.mint;
  const tokenProofs = decoded.proofs;
  const tokenAmount = tokenProofs.reduce((s, p) => s + p.amount, 0);
  
  console.log(`Receiving ${tokenAmount} sats from ${mintUrl}...`);
  
  const wallet = new Wallet(mintUrl);
  await wallet.loadMint();
  
  // Receive token (swap with mint to get fresh proofs)
  const proofs = await wallet.receive(token);
  
  // Save to wallet
  store.addProofsForMint(mintUrl, proofs);
  
  const received = proofs.reduce((s, p) => s + p.amount, 0);
  const newBalance = store.getBalanceForMint(mintUrl);
  
  console.log(`\n✓ Received ${received} sats`);
  console.log(`New balance at ${mintUrl}: ${newBalance} sats`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
