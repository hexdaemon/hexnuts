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
 */

const fs = require('fs');
const { getDecodedToken, getSecretKind } = require('@cashu/cashu-ts');
const store = require('./wallet-store');
const archon = require('../lib/archon');
const { createWallet } = require('../lib/wallet');

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
  const proofs = await wallet.receive(opts.token, receiveOpts);
  
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
