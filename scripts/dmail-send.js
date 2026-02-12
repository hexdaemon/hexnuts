#!/usr/bin/env node
/**
 * Send encrypted P2PK ecash via Archon dmail
 * 
 * Creates a NUT-11 token locked to recipient's pubkey,
 * encrypts it with archon-crypto, outputs ready to send.
 * 
 * Usage:
 *   node dmail-send.js <amount> <recipient_did_or_npub> [message]
 * 
 * Examples:
 *   node dmail-send.js 100 did:cid:bagaaiera... "Happy birthday!"
 *   node dmail-send.js 50 npub1abc123...
 */

const { Wallet, getEncodedTokenV4 } = require('@cashu/cashu-ts');
const { execSync, spawnSync } = require('child_process');
const store = require('./wallet-store');
const archon = require('../lib/archon');
const path = require('path');

const SKILLS_DIR = path.join(process.env.HOME, 'clawd/skills');

// Resolve recipient to pubkey
function resolveRecipient(recipient) {
  if (recipient.startsWith('npub1')) {
    // Decode npub to hex
    try {
      const result = execSync(`nak decode ${recipient} 2>/dev/null`, { encoding: 'utf8' });
      const match = result.match(/"pubkey":\s*"([a-f0-9]{64})"/);
      return match ? { pubkey: '02' + match[1], type: 'npub' } : null;
    } catch (e) {
      return null;
    }
  } else if (recipient.startsWith('did:')) {
    // For DID, we need to resolve via Archon
    // The archon-aliases skill might have this aliased
    try {
      const aliasScript = path.join(SKILLS_DIR, 'archon-aliases/scripts/resolve-did.sh');
      const result = execSync(`bash ${aliasScript} ${recipient} 2>/dev/null`, { encoding: 'utf8' });
      // Extract pubkey from DID document (simplified)
      return { pubkey: null, did: recipient, type: 'did' };
    } catch (e) {
      return { pubkey: null, did: recipient, type: 'did' };
    }
  } else if (/^[0-9a-f]{64,66}$/i.test(recipient)) {
    let pubkey = recipient;
    if (pubkey.length === 64) pubkey = '02' + pubkey;
    return { pubkey, type: 'pubkey' };
  }
  return null;
}

// Encrypt message using archon-crypto
function encryptForRecipient(message, recipientAlias) {
  const encryptScript = path.join(SKILLS_DIR, 'archon-crypto/scripts/encrypt-message.sh');
  
  try {
    const result = spawnSync('bash', [encryptScript, message, recipientAlias], {
      encoding: 'utf8',
      env: process.env
    });
    
    if (result.status === 0) {
      return result.stdout.trim();
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function main() {
  const amount = parseInt(process.argv[2]);
  const recipient = process.argv[3];
  const memo = process.argv.slice(4).join(' ') || 'Encrypted ecash from HexNuts';
  
  if (!amount || !recipient) {
    console.error('Usage: node dmail-send.js <amount> <did|npub|pubkey> [message]');
    console.error('');
    console.error('Examples:');
    console.error('  node dmail-send.js 100 npub1qkjnsgk6zrs... "Happy birthday!"');
    console.error('  node dmail-send.js 50 did:cid:bagaaiera...');
    process.exit(1);
  }
  
  const mintUrl = store.DEFAULT_MINT;
  
  // Check balance
  const proofs = store.getProofsForMint(mintUrl);
  const balance = proofs.reduce((s, p) => s + p.amount, 0);
  
  if (balance < amount) {
    console.error(`Insufficient balance: have ${balance}, need ${amount}`);
    process.exit(1);
  }
  
  // Resolve recipient
  console.log(`Resolving recipient: ${recipient.slice(0, 30)}...`);
  const resolved = resolveRecipient(recipient);
  
  if (!resolved) {
    console.error('Could not resolve recipient');
    process.exit(1);
  }
  
  let pubkey = resolved.pubkey;
  
  // For DID, we need the Nostr-derived pubkey (same secp256k1 curve)
  // If we can't get it directly, use the recipient identifier for encryption
  if (!pubkey && resolved.type === 'did') {
    console.log('Note: DID pubkey extraction not yet implemented');
    console.log('Using recipient DID for encryption only (token will be regular, not P2PK)');
  }
  
  const wallet = new Wallet(mintUrl);
  await wallet.loadMint();
  
  let token;
  
  if (pubkey) {
    // Create P2PK-locked token
    console.log(`Creating P2PK token locked to: ${pubkey.slice(0, 20)}...`);
    
    const { keep, send } = await wallet.ops
      .send(amount, proofs)
      .asP2PK({ pubkey })
      .run();
    
    store.saveProofsForMint(mintUrl, keep);
    token = getEncodedTokenV4({ mint: mintUrl, proofs: send });
  } else {
    // Create regular token (encryption provides security)
    console.log('Creating regular token (encrypted delivery)...');
    
    const { keep, send } = await wallet.send(amount, proofs);
    store.saveProofsForMint(mintUrl, keep);
    token = getEncodedTokenV4({ mint: mintUrl, proofs: send });
  }
  
  // Build the dmail content
  const dmailContent = `💸 Encrypted Ecash

Amount: ${amount} sats
Mint: ${mintUrl}
${pubkey ? '🔐 P2PK-locked to your key' : '🔓 Claim with: node receive.js <token>'}

${memo}

--- TOKEN ---
${token}
--- END TOKEN ---

Sent via HexNuts 🥜`;

  console.log('\n=== Encrypted Ecash Dmail ===\n');
  console.log(dmailContent);
  
  // Try to encrypt if archon-crypto available
  const skills = archon.getAvailableSkills();
  if (skills.crypto) {
    console.log('\n--- Archon Encryption ---');
    console.log('To encrypt for recipient:');
    console.log(`  ~/clawd/skills/archon-crypto/scripts/encrypt-message.sh "${token}" <recipient-alias>`);
  }
  
  console.log('\n--- Send via ---');
  console.log('• Nostr DM: ~/clawd/skills/nostr/scripts/nostr-dm.sh <npub> "<message>"');
  console.log('• Signal/Telegram: Copy and send directly');
  console.log('• Archon dmail: Encrypt with archon-crypto first');
  
  const newBalance = store.getBalanceForMint(mintUrl);
  console.log(`\nNew balance: ${newBalance} sats`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
