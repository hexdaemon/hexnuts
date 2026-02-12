#!/usr/bin/env node
/**
 * Send P2PK-locked Cashu tokens to a DID
 * Resolves the DID to get their pubkey, locks tokens to it.
 * 
 * Usage: 
 *   node send-to-did.js <amount_sats> <did>
 *   node send-to-did.js <amount_sats> <npub>  
 *   node send-to-did.js <amount_sats> <hex_pubkey>
 * 
 * Examples:
 *   node send-to-did.js 100 did:cid:bagaaiera...
 *   node send-to-did.js 100 npub1abc123...
 *   node send-to-did.js 100 02abc123...
 */

const { getEncodedTokenV4 } = require('@cashu/cashu-ts');
const { execSync } = require('child_process');
const store = require('./wallet-store');
const archon = require('../lib/archon');
const { createWallet } = require('../lib/wallet');

// Convert npub to hex pubkey
function npubToHex(npub) {
  if (!npub.startsWith('npub1')) return null;
  try {
    // Use nak to decode if available
    const result = execSync(`nak decode ${npub} 2>/dev/null`, { encoding: 'utf8' });
    const match = result.match(/"pubkey":\s*"([a-f0-9]{64})"/);
    return match ? match[1] : null;
  } catch (e) {
    // Fallback: bech32 decode (simplified)
    return null;
  }
}

// Resolve DID to pubkey via Archon
function resolveDIDPubkey(did) {
  if (!did.startsWith('did:')) return null;
  try {
    // Try local keymaster first
    const cmd = `npx @didcid/keymaster resolve ${did} 2>/dev/null`;
    const result = execSync(cmd, { encoding: 'utf8', timeout: 10000 });
    const doc = JSON.parse(result);
    
    // Extract secp256k1 key from DID document
    if (doc.verificationMethod) {
      for (const vm of doc.verificationMethod) {
        if (vm.type === 'EcdsaSecp256k1VerificationKey2019' || 
            vm.publicKeyHex || 
            vm.publicKeyMultibase) {
          if (vm.publicKeyHex) return vm.publicKeyHex;
          // Handle multibase encoding if needed
        }
      }
    }
    return null;
  } catch (e) {
    console.error('DID resolution failed:', e.message);
    return null;
  }
}

async function main() {
  const amount = parseInt(process.argv[2]);
  const recipient = process.argv[3];
  const mintUrl = process.argv[4] || store.DEFAULT_MINT;
  
  if (!amount || isNaN(amount) || amount <= 0 || !recipient) {
    console.error('Usage: node send-to-did.js <amount_sats> <did|npub|pubkey> [mint_url]');
    console.error('');
    console.error('Examples:');
    console.error('  node send-to-did.js 100 did:cid:bagaaiera...');
    console.error('  node send-to-did.js 100 npub1qkjnsgk6zrs...');
    console.error('  node send-to-did.js 100 02abc123...');
    process.exit(1);
  }
  
  // Resolve recipient to pubkey
  let pubkey;
  
  if (recipient.startsWith('did:')) {
    console.log(`Resolving DID: ${recipient.slice(0, 30)}...`);
    pubkey = resolveDIDPubkey(recipient);
    if (!pubkey) {
      console.error('Could not resolve DID to secp256k1 pubkey');
      process.exit(1);
    }
  } else if (recipient.startsWith('npub1')) {
    console.log(`Converting npub: ${recipient.slice(0, 20)}...`);
    pubkey = npubToHex(recipient);
    if (!pubkey) {
      console.error('Could not decode npub');
      process.exit(1);
    }
  } else if (/^[0-9a-f]{64,66}$/i.test(recipient)) {
    pubkey = recipient;
  } else {
    console.error('Invalid recipient format. Use DID, npub, or hex pubkey.');
    process.exit(1);
  }
  
  // Ensure pubkey has 02/03 prefix
  if (pubkey.length === 64) {
    pubkey = '02' + pubkey;
  }
  
  console.log(`Recipient pubkey: ${pubkey.slice(0, 20)}...`);
  
  // Check balance
  const proofs = store.getProofsForMint(mintUrl);
  const balance = proofs.reduce((s, p) => s + p.amount, 0);
  
  if (balance < amount) {
    console.error(`Insufficient balance: have ${balance}, need ${amount}`);
    process.exit(1);
  }
  
  console.log(`Creating ${amount} sat P2PK token for recipient...`);
  
  const wallet = await createWallet(mintUrl);
  
  // Create P2PK-locked token
  const { keep, send } = await wallet.ops
    .send(amount, proofs)
    .asP2PK({ pubkey })
    .run();
  
  // Update wallet
  store.saveProofsForMint(mintUrl, keep);
  
  // Encode token
  const token = getEncodedTokenV4({ mint: mintUrl, proofs: send });
  
  const lockedAmount = send.reduce((s, p) => s + p.amount, 0);
  const newBalance = store.getBalanceForMint(mintUrl);
  
  console.log(`\n=== P2PK-Locked Token for Recipient (${lockedAmount} sats) ===`);
  console.log(`\nLocked to: ${pubkey}`);
  console.log(`\n${token}`);
  console.log(`\nNew balance: ${newBalance} sats`);
  console.log(`\n📤 Send this token to the recipient. Only they can claim it!`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
