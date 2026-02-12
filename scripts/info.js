#!/usr/bin/env node
/**
 * Show info about a Cashu token without claiming it
 * Usage: node info.js <cashu_token>
 */

const { getDecodedToken } = require('@cashu/cashu-ts');

async function main() {
  const token = process.argv[2];
  
  if (!token) {
    console.error('Usage: node info.js <cashu_token>');
    process.exit(1);
  }
  
  try {
    const decoded = getDecodedToken(token);
    const amount = decoded.proofs.reduce((s, p) => s + p.amount, 0);
    
    console.log('=== Token Info ===\n');
    console.log(`Mint: ${decoded.mint}`);
    console.log(`Amount: ${amount} sats`);
    console.log(`Proofs: ${decoded.proofs.length}`);
    console.log(`Memo: ${decoded.memo || '(none)'}`);
    
    // Show denomination breakdown
    const denoms = {};
    for (const p of decoded.proofs) {
      denoms[p.amount] = (denoms[p.amount] || 0) + 1;
    }
    console.log('\nDenominations:');
    for (const [amt, count] of Object.entries(denoms).sort((a, b) => b[0] - a[0])) {
      console.log(`  ${amt} sats × ${count}`);
    }
  } catch (err) {
    console.error('Invalid token:', err.message);
    process.exit(1);
  }
}

main().catch(console.error);
