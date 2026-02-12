#!/usr/bin/env node
/**
 * Mint Cashu tokens by paying a Lightning invoice
 * Usage: node mint.js <amount_sats> [mint_url]
 * 
 * With --quote <quote_id>: claim tokens for an already-paid quote
 */

const { MintQuoteState } = require('@cashu/cashu-ts');
const store = require('./wallet-store');
const { createWallet } = require('../lib/wallet');

async function main() {
  const args = process.argv.slice(2);
  
  // Check for --quote flag (claim existing quote)
  const quoteIdx = args.indexOf('--quote');
  if (quoteIdx !== -1) {
    const quoteId = args[quoteIdx + 1];
    const mintUrl = args[quoteIdx + 2] || store.DEFAULT_MINT;
    await claimQuote(quoteId, mintUrl);
    return;
  }
  
  const amount = parseInt(args[0]);
  const mintUrl = args[1] || store.DEFAULT_MINT;
  
  if (!amount || isNaN(amount) || amount <= 0) {
    console.error('Usage: node mint.js <amount_sats> [mint_url]');
    console.error('       node mint.js --quote <quote_id> [mint_url]');
    process.exit(1);
  }
  
  console.log(`Minting ${amount} sats from ${mintUrl}...`);
  
  const wallet = await createWallet(mintUrl);
  
  // Create mint quote (generates Lightning invoice)
  const quote = await wallet.createMintQuote(amount);
  
  console.log('\n=== Pay this invoice to mint tokens ===');
  console.log(`\nInvoice: ${quote.request}`);
  console.log(`\nQuote ID: ${quote.quote}`);
  console.log(`Amount: ${amount} sats`);
  console.log(`Expires: ${new Date(quote.expiry * 1000).toLocaleString()}`);
  console.log('\nAfter paying, claim with:');
  console.log(`  node mint.js --quote ${quote.quote} ${mintUrl}`);
}

async function claimQuote(quoteId, mintUrl) {
  console.log(`Claiming quote ${quoteId} from ${mintUrl}...`);
  
  const wallet = await createWallet(mintUrl);
  
  // Check quote status
  const quote = await wallet.checkMintQuote(quoteId);
  
  if (quote.state !== MintQuoteState.PAID) {
    console.error(`Quote not paid yet. State: ${quote.state}`);
    process.exit(1);
  }
  
  // Mint the proofs (returns array directly in v3)
  const proofs = await wallet.mintProofs(quote.amount, quoteId);
  
  // Save to wallet
  store.addProofsForMint(mintUrl, proofs);
  
  const total = proofs.reduce((s, p) => s + p.amount, 0);
  console.log(`\n✓ Minted ${total} sats (${proofs.length} proofs)`);
  console.log(`New balance at ${mintUrl}: ${store.getBalanceForMint(mintUrl)} sats`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
