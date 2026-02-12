#!/usr/bin/env node
/**
 * Create multi-signature P2PK tokens (NUT-11)
 * 
 * Lock tokens to multiple pubkeys with threshold requirements.
 * 
 * Usage:
 *   node lock-multisig.js <amount> --pubkeys <pk1,pk2,pk3> [--threshold N]
 *   node lock-multisig.js <amount> --pubkeys <pk1,pk2> --refund <refund_pk> --locktime <unix_ts>
 * 
 * Examples:
 *   # 2-of-3 multisig
 *   node lock-multisig.js 100 --pubkeys pk1,pk2,pk3 --threshold 2
 *   
 *   # 1-of-2 with refund after timeout
 *   node lock-multisig.js 100 --pubkeys pk1,pk2 --refund pk3 --locktime 1710000000
 */

const { Wallet, P2PKBuilder, getEncodedTokenV4 } = require('@cashu/cashu-ts');
const store = require('./wallet-store');
const archon = require('../lib/archon');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    amount: parseInt(args[0]),
    pubkeys: [],
    threshold: null,
    refundKeys: [],
    refundThreshold: null,
    locktime: null
  };
  
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--pubkeys':
        result.pubkeys = args[++i].split(',').map(k => k.trim());
        break;
      case '--threshold':
        result.threshold = parseInt(args[++i]);
        break;
      case '--refund':
        result.refundKeys = args[++i].split(',').map(k => k.trim());
        break;
      case '--refund-threshold':
        result.refundThreshold = parseInt(args[++i]);
        break;
      case '--locktime':
        result.locktime = parseInt(args[++i]);
        break;
      case '--self':
        const myPubkey = archon.getCashuPubkey();
        if (myPubkey) result.pubkeys.push(myPubkey);
        break;
    }
  }
  
  return result;
}

function normalizePubkey(pk) {
  // Remove 02/03 prefix if present, cashu-ts normalizes internally
  if (pk.length === 66 && (pk.startsWith('02') || pk.startsWith('03'))) {
    return pk;
  }
  if (pk.length === 64) {
    return '02' + pk;
  }
  return pk;
}

async function main() {
  const opts = parseArgs();
  
  if (!opts.amount || isNaN(opts.amount) || opts.amount <= 0 || opts.pubkeys.length === 0) {
    console.error('Usage: node lock-multisig.js <amount> --pubkeys <pk1,pk2,...> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --pubkeys <pk1,pk2,...>   Comma-separated pubkeys (required)');
    console.error('  --threshold N             Require N signatures (default: all)');
    console.error('  --refund <pk1,pk2,...>    Refund pubkeys (requires --locktime)');
    console.error('  --refund-threshold N      Require N refund signatures');
    console.error('  --locktime <unix_ts>      Unix timestamp for refund activation');
    console.error('  --self                    Include your own pubkey');
    console.error('');
    console.error('Examples:');
    console.error('  # 2-of-3 multisig');
    console.error('  node lock-multisig.js 100 --pubkeys pk1,pk2,pk3 --threshold 2');
    console.error('');
    console.error('  # Any of 2 keys, with refund to pk3 after 24h');
    console.error('  node lock-multisig.js 100 --pubkeys pk1,pk2 --refund pk3 --locktime $(date -d "+24 hours" +%s)');
    process.exit(1);
  }
  
  const mintUrl = store.DEFAULT_MINT;
  
  // Check balance
  const proofs = store.getProofsForMint(mintUrl);
  const balance = proofs.reduce((s, p) => s + p.amount, 0);
  
  if (balance < opts.amount) {
    console.error(`Insufficient balance: have ${balance}, need ${opts.amount}`);
    process.exit(1);
  }
  
  // Normalize pubkeys
  const pubkeys = opts.pubkeys.map(normalizePubkey);
  const refundKeys = opts.refundKeys.map(normalizePubkey);
  
  // Build P2PK options
  const builder = new P2PKBuilder();
  
  // Add lock pubkeys
  builder.addLockPubkey(pubkeys);
  
  // Set threshold (default: all keys required)
  const threshold = opts.threshold || pubkeys.length;
  if (threshold < pubkeys.length) {
    builder.requireLockSignatures(threshold);
  }
  
  // Add refund if specified
  if (refundKeys.length > 0 && opts.locktime) {
    builder.addRefundPubkey(refundKeys);
    builder.lockUntil(opts.locktime);
    if (opts.refundThreshold) {
      builder.requireRefundSignatures(opts.refundThreshold);
    }
  }
  
  const p2pkOpts = builder.toOptions();
  
  console.log('=== Multi-Signature P2PK Token ===\n');
  console.log(`Amount: ${opts.amount} sats`);
  console.log(`Lock pubkeys (${pubkeys.length}):`);
  pubkeys.forEach((pk, i) => console.log(`  ${i + 1}. ${pk.slice(0, 20)}...`));
  console.log(`Threshold: ${threshold}-of-${pubkeys.length}`);
  
  if (refundKeys.length > 0) {
    console.log(`\nRefund pubkeys (${refundKeys.length}):`);
    refundKeys.forEach((pk, i) => console.log(`  ${i + 1}. ${pk.slice(0, 20)}...`));
    console.log(`Locktime: ${new Date(opts.locktime * 1000).toISOString()}`);
  }
  
  // Create token
  const wallet = new Wallet(mintUrl);
  await wallet.loadMint();
  
  const { keep, send } = await wallet.ops
    .send(opts.amount, proofs)
    .asP2PK(p2pkOpts)
    .run();
  
  store.saveProofsForMint(mintUrl, keep);
  
  const token = getEncodedTokenV4({ mint: mintUrl, proofs: send });
  const lockedAmount = send.reduce((s, p) => s + p.amount, 0);
  
  console.log(`\n=== Token (${lockedAmount} sats) ===\n`);
  console.log(token);
  console.log(`\nNew balance: ${store.getBalanceForMint(mintUrl)} sats`);
  console.log(`\n⚠️  Requires ${threshold} signature(s) from the specified pubkeys to spend!`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
