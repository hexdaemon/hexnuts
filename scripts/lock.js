#!/usr/bin/env node
/**
 * Create P2PK-locked Cashu tokens (NUT-11)
 * Tokens can only be spent by the holder of the private key
 * 
 * Usage: 
 *   node lock.js <amount_sats> [pubkey]     # Lock to specific pubkey
 *   node lock.js <amount_sats> --self       # Lock to own Archon/Nostr pubkey
 * 
 * Integrates with archon-nostr skill for key management.
 */

const { Wallet, getEncodedTokenV4 } = require('@cashu/cashu-ts');
const store = require('./wallet-store');
const archon = require('../lib/archon');

async function main() {
  const args = process.argv.slice(2);
  const amount = parseInt(args[0]);
  
  if (!amount || isNaN(amount)) {
    console.error('Usage: node lock.js <amount_sats> [pubkey|--self]');
    console.error('       node lock.js 100 --self          # Lock to your Archon pubkey');
    console.error('       node lock.js 100 02abc123...     # Lock to specific pubkey');
    process.exit(1);
  }
  
  let pubkey;
  const mintUrl = store.DEFAULT_MINT;
  
  if (args[1] === '--self') {
    pubkey = archon.getCashuPubkey();
    if (!pubkey) {
      console.error('Could not load own pubkey.');
      console.error('Ensure archon-nostr skill has run or ~/.config/hex/nostr.env exists.');
      const available = archon.getAvailableSkills();
      console.error('Available archon skills:', JSON.stringify(available));
      process.exit(1);
    }
    console.log(`Locking to own pubkey: ${pubkey.slice(0, 16)}...`);
  } else if (args[1]) {
    pubkey = args[1];
    // Ensure pubkey has proper format (02 or 03 prefix for compressed)
    if (pubkey.length === 64) {
      pubkey = '02' + pubkey;
    }
  } else {
    console.error('Must specify pubkey or --self');
    process.exit(1);
  }
  
  const proofs = store.getProofsForMint(mintUrl);
  const balance = proofs.reduce((s, p) => s + p.amount, 0);
  
  if (balance < amount) {
    console.error(`Insufficient balance: have ${balance}, need ${amount}`);
    process.exit(1);
  }
  
  console.log(`Creating P2PK-locked token for ${amount} sats...`);
  
  const wallet = new Wallet(mintUrl);
  await wallet.loadMint();
  
  // Create P2PK-locked token using WalletOps
  const { keep, send } = await wallet.ops
    .send(amount, proofs)
    .asP2PK({ pubkey })
    .run();
  
  // Update wallet with remaining proofs
  store.saveProofsForMint(mintUrl, keep);
  
  // Encode token
  const token = getEncodedTokenV4({ mint: mintUrl, proofs: send });
  
  const lockedAmount = send.reduce((s, p) => s + p.amount, 0);
  const newBalance = store.getBalanceForMint(mintUrl);
  
  console.log(`\n=== P2PK-Locked Token (${lockedAmount} sats) ===`);
  console.log(`\nLocked to: ${pubkey}`);
  console.log(`\n${token}`);
  console.log(`\nNew balance: ${newBalance} sats`);
  console.log(`\n⚠️  Only the holder of the private key can spend this token!`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
