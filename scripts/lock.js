#!/usr/bin/env node
/**
 * Create P2PK-locked Cashu tokens (NUT-11)
 * Tokens can only be spent by the holder of the private key
 * 
 * Usage: 
 *   node lock.js <amount_sats> [pubkey]     # Lock to specific pubkey
 *   node lock.js <amount_sats> --self       # Lock to own Archon/Nostr pubkey
 */

const { Wallet, getEncodedTokenV4 } = require('@cashu/cashu-ts');
const store = require('./wallet-store');
const fs = require('fs');
const path = require('path');

// Load Archon/Nostr pubkey from env
function getOwnPubkey() {
  const envFile = path.join(process.env.HOME, '.config/hex/nostr.env');
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf8');
    const match = content.match(/NOSTR_PUBLIC_KEY_HEX="?([a-f0-9]+)"?/i);
    if (match) {
      // Cashu expects 02/03 prefix for compressed pubkey
      // Nostr pubkey is x-coordinate only, need to derive full compressed key
      return match[1];
    }
  }
  return null;
}

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
    pubkey = getOwnPubkey();
    if (!pubkey) {
      console.error('Could not find own pubkey. Check ~/.config/hex/nostr.env');
      process.exit(1);
    }
    console.log(`Locking to own pubkey: ${pubkey.slice(0, 16)}...`);
  } else if (args[1]) {
    pubkey = args[1];
  } else {
    console.error('Must specify pubkey or --self');
    process.exit(1);
  }
  
  // Ensure pubkey has proper format (02 or 03 prefix for compressed)
  if (pubkey.length === 64) {
    // x-coordinate only, add 02 prefix (assume even y)
    pubkey = '02' + pubkey;
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
