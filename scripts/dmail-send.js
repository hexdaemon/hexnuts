#!/usr/bin/env node
/**
 * Send encrypted P2PK ecash via Archon dmail
 * 
 * Creates a NUT-11 token locked to recipient's pubkey,
 * outputs ready to encrypt and send.
 * 
 * Usage:
 *   node dmail-send.js <amount> <recipient_did_or_npub> [message]
 * 
 * Examples:
 *   node dmail-send.js 100 did:cid:bagaaiera... "Happy birthday!"
 *   node dmail-send.js 50 npub1abc123...
 *   node dmail-send.js 25 02abc123...
 */

const { getEncodedTokenV4 } = require('@cashu/cashu-ts');
const { execSync } = require('child_process');
const store = require('./wallet-store');
const archon = require('../lib/archon');
const groups = require('../lib/groups');
const { createWallet } = require('../lib/wallet');
const path = require('path');

const SKILLS_DIR = path.join(process.env.HOME, 'clawd/skills');

/**
 * Resolve recipient to pubkey
 * Supports: npub, DID, raw pubkey
 */
function resolveRecipient(recipient) {
  // Raw pubkey (64 or 66 hex chars)
  if (/^(02|03)?[0-9a-f]{64}$/i.test(recipient)) {
    let pubkey = recipient;
    if (pubkey.length === 64) pubkey = '02' + pubkey;
    return { pubkey, type: 'pubkey', resolved: recipient };
  }
  
  // Nostr npub
  if (recipient.startsWith('npub1')) {
    try {
      const nak = process.env.NAK_PATH || '/home/sat/.local/bin/nak';
      const result = execSync(`${nak} decode ${recipient} 2>/dev/null`, { encoding: 'utf8' });
      const match = result.match(/"pubkey":\s*"([a-f0-9]{64})"/);
      if (match) {
        return { pubkey: '02' + match[1], type: 'npub', resolved: recipient };
      }
    } catch (e) {
      // Fall through to return null
    }
    return null;
  }
  
  // Archon DID
  if (recipient.startsWith('did:')) {
    try {
      // Use the groups.js DID resolution which extracts secp256k1 pubkey
      const pubkey = groups.resolveDIDPubkey(recipient);
      return { pubkey, type: 'did', resolved: recipient };
    } catch (e) {
      console.error(`Could not resolve DID: ${e.message}`);
      return null;
    }
  }
  
  // Try as Archon alias
  try {
    const aliasScript = path.join(SKILLS_DIR, 'archon-aliases/scripts/resolve-did.sh');
    const result = execSync(`bash ${aliasScript} ${recipient} 2>/dev/null`, { encoding: 'utf8' });
    const did = result.trim();
    if (did.startsWith('did:')) {
      const pubkey = groups.resolveDIDPubkey(did);
      return { pubkey, type: 'alias', resolved: did };
    }
  } catch (e) {
    // Not an alias
  }
  
  return null;
}

async function main() {
  const amount = parseInt(process.argv[2]);
  const recipient = process.argv[3];
  const memo = process.argv.slice(4).join(' ') || 'Encrypted ecash from HexNuts';
  
  if (!amount || isNaN(amount) || amount <= 0 || !recipient) {
    console.error('Usage: node dmail-send.js <amount> <did|npub|pubkey|alias> [message]');
    console.error('');
    console.error('Recipient formats:');
    console.error('  npub1...           Nostr public key');
    console.error('  did:cid:...        Archon DID');
    console.error('  02abc123...        Raw secp256k1 pubkey');
    console.error('  my-contact         Archon alias');
    console.error('');
    console.error('Examples:');
    console.error('  node dmail-send.js 100 npub1qkjnsgk6zrs... "Happy birthday!"');
    console.error('  node dmail-send.js 50 did:cid:bagaaiera...');
    console.error('  node dmail-send.js 25 sat   # Using Archon alias');
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
  console.log(`Resolving recipient: ${recipient}...`);
  const resolved = resolveRecipient(recipient);
  
  if (!resolved || !resolved.pubkey) {
    console.error('Could not resolve recipient to pubkey');
    console.error('');
    console.error('For DIDs, ensure the DID document contains a secp256k1 key.');
    console.error('For npubs, ensure nak is installed at ~/.local/bin/nak');
    process.exit(1);
  }
  
  console.log(`✓ Resolved (${resolved.type}): ${resolved.pubkey.slice(0, 20)}...`);
  
  const wallet = await createWallet(mintUrl);
  
  // Create P2PK-locked token
  console.log(`Creating P2PK token for ${amount} sats...`);
  
  const { keep, send } = await wallet.ops
    .send(amount, proofs)
    .asP2PK({ pubkey: resolved.pubkey })
    .run();
  
  store.saveProofsForMint(mintUrl, keep);
  const token = getEncodedTokenV4({ mint: mintUrl, proofs: send });
  const lockedAmount = send.reduce((s, p) => s + p.amount, 0);
  
  // Build the dmail content
  console.log('\n' + '='.repeat(60));
  console.log('ENCRYPTED ECASH DMAIL');
  console.log('='.repeat(60));
  
  console.log(`
Amount: ${lockedAmount} sats
Mint: ${mintUrl}
Locked to: ${resolved.pubkey.slice(0, 20)}... (${resolved.type})
Message: ${memo}

--- P2PK TOKEN (only recipient can spend) ---
${token}
--- END TOKEN ---
`);
  
  // Delivery instructions
  const skills = archon.getAvailableSkills();
  
  console.log('='.repeat(60));
  console.log('DELIVERY OPTIONS');
  console.log('='.repeat(60));
  
  if (resolved.type === 'npub') {
    console.log(`
• Nostr DM (recommended):
  ~/clawd/skills/nostr/scripts/nostr-dm.sh ${recipient} "${token}"
`);
  }
  
  if (skills.crypto) {
    console.log(`• Archon encrypted message:
  ~/clawd/skills/archon-crypto/scripts/encrypt-message.sh "${token}" <recipient-alias>
`);
  }
  
  console.log(`• Copy token and send via any secure channel
  (Signal, Telegram, encrypted email)

Recipient claims with:
  node receive.js "${token.slice(0, 20)}..." --self
`);
  
  const newBalance = store.getBalanceForMint(mintUrl);
  console.log(`Your new balance: ${newBalance} sats`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
