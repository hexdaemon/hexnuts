#!/usr/bin/env node
/**
 * Melt Cashu tokens to pay a Lightning invoice
 * Usage: node melt.js <bolt11_invoice> [mint_url]
 */

const { Wallet } = require('@cashu/cashu-ts');
const store = require('./wallet-store');

async function main() {
  const invoice = process.argv[2];
  const mintUrl = process.argv[3] || store.DEFAULT_MINT;
  
  if (!invoice) {
    console.error('Usage: node melt.js <bolt11_invoice> [mint_url]');
    process.exit(1);
  }
  
  const proofs = store.getProofsForMint(mintUrl);
  const balance = proofs.reduce((s, p) => s + p.amount, 0);
  
  if (balance === 0) {
    console.error(`No tokens at ${mintUrl}`);
    process.exit(1);
  }
  
  console.log(`Melting tokens from ${mintUrl}...`);
  console.log(`Available balance: ${balance} sats`);
  
  const wallet = new Wallet(mintUrl);
  await wallet.loadMint();
  
  // Get melt quote
  const quote = await wallet.createMeltQuote(invoice);
  const amountNeeded = quote.amount + quote.fee_reserve;
  
  console.log(`\nInvoice amount: ${quote.amount} sats`);
  console.log(`Fee reserve: ${quote.fee_reserve} sats`);
  console.log(`Total needed: ${amountNeeded} sats`);
  
  if (balance < amountNeeded) {
    console.error(`\nInsufficient balance! Need ${amountNeeded}, have ${balance}`);
    process.exit(1);
  }
  
  // Select proofs to send
  const { keep, send } = await wallet.send(amountNeeded, proofs, { includeFees: true });
  
  // Melt (pay the invoice)
  const result = await wallet.meltProofs(quote, send);
  
  // Update wallet: keep the remaining proofs + any change
  const newProofs = [...keep];
  if (result.change && result.change.length > 0) {
    newProofs.push(...result.change);
  }
  store.saveProofsForMint(mintUrl, newProofs);
  
  const newBalance = store.getBalanceForMint(mintUrl);
  console.log(`\n✓ Paid ${quote.amount} sats`);
  console.log(`Payment preimage: ${result.preimage || 'N/A'}`);
  console.log(`New balance: ${newBalance} sats`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
