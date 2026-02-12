#!/usr/bin/env node
/**
 * Receive a Cashu token (including P2PK-locked tokens)
 * Usage: 
 *   node receive.js <cashu_token>              # Regular token
 *   node receive.js <cashu_token> --self       # P2PK token locked to own key
 *   node receive.js <cashu_token> <privkey>    # P2PK token with explicit privkey
 * 
 * Integrates with archon-nostr skill for key management.
 */

const { Wallet, getDecodedToken, getSecretKind } = require('@cashu/cashu-ts');
const store = require('./wallet-store');
const archon = require('../lib/archon');

async function main() {
  const token = process.argv[2];
  const keyArg = process.argv[3];
  
  if (!token) {
    console.error('Usage: node receive.js <cashu_token> [--self|privkey]');
    process.exit(1);
  }
  
  // Decode token to get mint URL
  const decoded = getDecodedToken(token);
  const mintUrl = decoded.mint;
  const tokenProofs = decoded.proofs;
  const tokenAmount = tokenProofs.reduce((s, p) => s + p.amount, 0);
  
  // Check if token is P2PK-locked
  let isP2PK = false;
  try {
    for (const proof of tokenProofs) {
      const kind = getSecretKind(proof.secret);
      if (kind === 'P2PK') {
        isP2PK = true;
        break;
      }
    }
  } catch (e) {
    // Not a structured secret, regular token
  }
  
  console.log(`Receiving ${tokenAmount} sats from ${mintUrl}...`);
  if (isP2PK) console.log('🔐 Token is P2PK-locked');
  
  const wallet = new Wallet(mintUrl);
  await wallet.loadMint();
  
  // Determine private key for P2PK tokens
  let privkey = null;
  if (isP2PK) {
    if (keyArg === '--self') {
      privkey = archon.getCashuPrivkey();
      if (!privkey) {
        console.error('Could not load own privkey.');
        console.error('Ensure archon-nostr skill has run or ~/.config/hex/nostr.env exists.');
        process.exit(1);
      }
      console.log('Using own Archon/Nostr key to unlock...');
    } else if (keyArg) {
      privkey = keyArg;
    } else {
      console.error('P2PK token requires --self or explicit privkey');
      process.exit(1);
    }
  }
  
  // Receive token (swap with mint to get fresh proofs)
  const receiveOpts = privkey ? { privkey } : {};
  const proofs = await wallet.receive(token, receiveOpts);
  
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
