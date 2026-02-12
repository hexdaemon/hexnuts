#!/usr/bin/env node
/**
 * Receive a Cashu token (including P2PK-locked tokens)
 * Usage: 
 *   node receive.js <cashu_token>                    # Regular token
 *   node receive.js <cashu_token> --self             # P2PK token locked to own key
 *   node receive.js <cashu_token> --privkey-file <f> # P2PK with key from file
 * 
 * Integrates with archon-nostr skill for key management.
 * 
 * Security: Use --privkey-file instead of passing key as argument
 *           to avoid exposing it in shell history.
 * 
 * Interoperability: Handles tokens locked to npub format by auto-converting
 *                   to hex pubkey format before verification.
 */

const fs = require('fs');
const { execSync } = require('child_process');
const { getDecodedToken, getSecretKind, getEncodedTokenV4 } = require('@cashu/cashu-ts');
const store = require('./wallet-store');
const archon = require('../lib/archon');
const { createWallet } = require('../lib/wallet');

/**
 * Convert npub to hex pubkey
 */
function npubToHex(npub) {
  if (!npub || !npub.startsWith('npub1')) return null;
  try {
    const nak = process.env.NAK_PATH || '/home/sat/.local/bin/nak';
    const result = execSync(`${nak} decode ${npub} 2>/dev/null`, { encoding: 'utf8' });
    const match = result.match(/"pubkey":\s*"([a-f0-9]{64})"/i);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

/**
 * Check if a string looks like an npub
 */
function isNpub(str) {
  return str && typeof str === 'string' && str.startsWith('npub1') && str.length > 60;
}

/**
 * Fix P2PK proofs that use npub format instead of hex
 * Returns fixed proofs and whether any were converted
 */
function fixNpubP2PKProofs(proofs) {
  let converted = false;
  const fixedProofs = proofs.map(proof => {
    try {
      const secret = JSON.parse(proof.secret);
      if (!Array.isArray(secret) || secret[0] !== 'P2PK') return proof;
      
      const p2pkData = secret[1];
      if (!p2pkData || !p2pkData.data) return proof;
      
      // Check if pubkey is in npub format
      if (isNpub(p2pkData.data)) {
        const hexPubkey = npubToHex(p2pkData.data);
        if (hexPubkey) {
          console.log(`🔄 Converting npub lock to hex: ${p2pkData.data.slice(0, 20)}... → ${hexPubkey.slice(0, 16)}...`);
          // Create new secret with hex pubkey
          const newSecret = ['P2PK', { ...p2pkData, data: hexPubkey }];
          converted = true;
          return { ...proof, secret: JSON.stringify(newSecret) };
        }
      }
      
      // Also check tags for additional pubkeys (multi-sig)
      if (p2pkData.tags && Array.isArray(p2pkData.tags)) {
        let tagsModified = false;
        const newTags = p2pkData.tags.map(tag => {
          if (Array.isArray(tag) && tag[0] === 'pubkeys') {
            const newPubkeys = tag.slice(1).map(pk => {
              if (isNpub(pk)) {
                const hex = npubToHex(pk);
                if (hex) {
                  console.log(`🔄 Converting npub in tags: ${pk.slice(0, 20)}... → ${hex.slice(0, 16)}...`);
                  tagsModified = true;
                  return hex;
                }
              }
              return pk;
            });
            return ['pubkeys', ...newPubkeys];
          }
          return tag;
        });
        
        if (tagsModified) {
          const newSecret = ['P2PK', { ...p2pkData, tags: newTags }];
          converted = true;
          return { ...proof, secret: JSON.stringify(newSecret) };
        }
      }
    } catch (e) {
      // Not JSON or not P2PK, return as-is
    }
    return proof;
  });
  
  return { proofs: fixedProofs, converted };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { token: null, privkey: null, useSelf: false };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--self') {
      result.useSelf = true;
    } else if (args[i] === '--privkey-file' || args[i] === '-k') {
      const keyFile = args[++i];
      if (!keyFile || !fs.existsSync(keyFile)) {
        console.error(`Key file not found: ${keyFile}`);
        process.exit(1);
      }
      result.privkey = fs.readFileSync(keyFile, 'utf8').trim();
    } else if (args[i].startsWith('cashu') || args[i].startsWith('ey')) {
      result.token = args[i];
    } else if (!args[i].startsWith('-') && !result.token) {
      // Legacy: accept privkey as positional arg (but warn)
      if (/^[0-9a-f]{64}$/i.test(args[i])) {
        console.warn('⚠️  Warning: Passing privkey as argument exposes it in shell history.');
        console.warn('   Use --privkey-file instead for better security.\n');
        result.privkey = args[i];
      } else {
        result.token = args[i];
      }
    }
  }
  
  return result;
}

async function main() {
  const opts = parseArgs();
  
  if (!opts.token) {
    console.error('Usage: node receive.js <cashu_token> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --self              Use own Archon/Nostr key to unlock P2PK token');
    console.error('  --privkey-file, -k  Read private key from file (safer than CLI arg)');
    console.error('');
    console.error('Examples:');
    console.error('  node receive.js cashuBo2F0... --self');
    console.error('  node receive.js cashuBo2F0... --privkey-file ~/.secrets/cashu.key');
    process.exit(1);
  }
  
  // Decode token to get mint URL
  let decoded;
  try {
    decoded = getDecodedToken(opts.token);
  } catch (e) {
    console.error('Invalid token format:', e.message);
    process.exit(1);
  }
  
  const mintUrl = decoded.mint;
  let tokenProofs = decoded.proofs;
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
  
  // Fix npub-format P2PK locks for interoperability
  let tokenToReceive = opts.token;
  if (isP2PK) {
    const { proofs: fixedProofs, converted } = fixNpubP2PKProofs(tokenProofs);
    if (converted) {
      // Re-encode token with fixed proofs
      tokenToReceive = getEncodedTokenV4({ 
        mint: mintUrl, 
        proofs: fixedProofs,
        memo: decoded.memo 
      });
      tokenProofs = fixedProofs;
    }
  }
  
  const wallet = await createWallet(mintUrl);
  
  // Determine private key for P2PK tokens
  let privkey = opts.privkey;
  if (isP2PK && !privkey) {
    if (opts.useSelf) {
      privkey = archon.getCashuPrivkey();
      if (!privkey) {
        console.error('Could not load own privkey.');
        console.error('Ensure archon-nostr skill has run or ~/.config/hex/nostr.env exists.');
        process.exit(1);
      }
      console.log('Using own Archon/Nostr key to unlock...');
    } else {
      console.error('P2PK token requires --self or --privkey-file');
      process.exit(1);
    }
  }
  
  // Receive token (swap with mint to get fresh proofs)
  const receiveOpts = privkey ? { privkey } : {};
  const proofs = await wallet.receive(tokenToReceive, receiveOpts);
  
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
