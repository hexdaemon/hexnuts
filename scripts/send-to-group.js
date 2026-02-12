#!/usr/bin/env node
/**
 * Create P2PK-locked Cashu tokens for an Archon group (NUT-11)
 * 
 * Tokens can be spent by any N members of the group (threshold signature).
 * 
 * Usage: 
 *   node send-to-group.js <amount_sats> <group> [--threshold N]
 * 
 * Examples:
 *   node send-to-group.js 1000 daemon-collective              # Any 1 member can spend
 *   node send-to-group.js 1000 daemon-collective --threshold 2  # Requires 2 signatures
 *   node send-to-group.js 1000 did:cid:bagaaiera...           # Use group DID directly
 * 
 * The group can be specified by:
 *   - Alias name (e.g., "daemon-collective")
 *   - Group DID (e.g., "did:cid:bagaaiera...")
 */

const { Wallet, getEncodedTokenV4 } = require('@cashu/cashu-ts');
const store = require('./wallet-store');
const groups = require('../lib/groups');

function parseArgs(args) {
  const result = { threshold: 1 };
  const positional = [];
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--threshold' || args[i] === '-t') {
      result.threshold = parseInt(args[++i]);
    } else if (args[i].startsWith('--threshold=')) {
      result.threshold = parseInt(args[i].split('=')[1]);
    } else {
      positional.push(args[i]);
    }
  }
  
  result.amount = parseInt(positional[0]);
  result.group = positional[1];
  
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  if (!args.amount || isNaN(args.amount) || args.amount <= 0 || !args.group) {
    console.error('Usage: node send-to-group.js <amount_sats> <group> [--threshold N]');
    console.error('');
    console.error('Options:');
    console.error('  --threshold N, -t N    Required signatures (default: 1 = any member)');
    console.error('');
    console.error('Examples:');
    console.error('  node send-to-group.js 1000 daemon-collective');
    console.error('  node send-to-group.js 1000 daemon-collective --threshold 2');
    console.error('');
    console.error('Available groups:');
    const groupList = groups.listGroups();
    if (groupList.length === 0) {
      console.error('  (none found)');
    } else {
      groupList.forEach(g => console.error(`  - ${g}`));
    }
    process.exit(1);
  }
  
  const { amount, group: groupId, threshold } = args;
  const mintUrl = store.DEFAULT_MINT;
  
  // Resolve group to pubkeys
  console.log('');
  const resolved = groups.resolveGroupPubkeys(groupId);
  
  if (resolved.pubkeys.length === 0) {
    console.error('\n✗ No valid pubkeys resolved from group');
    process.exit(1);
  }
  
  if (threshold > resolved.pubkeys.length) {
    console.error(`\n✗ Threshold ${threshold} exceeds group size ${resolved.pubkeys.length}`);
    process.exit(1);
  }
  
  // Check balance
  const proofs = store.getProofsForMint(mintUrl);
  const balance = proofs.reduce((s, p) => s + p.amount, 0);
  
  if (balance < amount) {
    console.error(`\nInsufficient balance: have ${balance}, need ${amount}`);
    process.exit(1);
  }
  
  console.log(`\nCreating group-locked token:`);
  console.log(`  Amount: ${amount} sats`);
  console.log(`  Group: ${resolved.name}`);
  console.log(`  Members: ${resolved.pubkeys.length}`);
  console.log(`  Threshold: ${threshold} of ${resolved.pubkeys.length}`);
  
  const wallet = new Wallet(mintUrl);
  await wallet.loadMint();
  
  // Create P2PK-locked token with multiple pubkeys and threshold
  // NUT-11 specifies: pubkeys array + n_sigs for threshold
  const p2pkOptions = {
    pubkeys: resolved.pubkeys,
    n_sigs: threshold
  };
  
  const { keep, send } = await wallet.ops
    .send(amount, proofs)
    .asP2PK(p2pkOptions)
    .run();
  
  // Update wallet with remaining proofs
  store.saveProofsForMint(mintUrl, keep);
  
  // Encode token
  const token = getEncodedTokenV4({ mint: mintUrl, proofs: send });
  
  const lockedAmount = send.reduce((s, p) => s + p.amount, 0);
  const newBalance = store.getBalanceForMint(mintUrl);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`GROUP-LOCKED TOKEN (${lockedAmount} sats)`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\nGroup: ${resolved.name}`);
  console.log(`Threshold: ${threshold} of ${resolved.pubkeys.length} signatures required`);
  console.log(`\nAuthorized members:`);
  resolved.members.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.did.slice(0, 40)}...`);
  });
  console.log(`\n${token}`);
  console.log(`\nYour new balance: ${newBalance} sats`);
  console.log(`\n⚠️  ${threshold === 1 ? 'Any single member' : `${threshold} members together`} can spend this token!`);
}

main().catch(err => {
  console.error('Error:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
