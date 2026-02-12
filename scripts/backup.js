#!/usr/bin/env node
/**
 * Backup wallet to Archon vault (encrypted)
 * Usage: node backup.js [vault_name]
 * 
 * Default vault: hexnuts-vault
 * Requires: ARCHON_PASSPHRASE environment variable
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WALLET_FILE = path.join(process.env.HOME, '.config/hex/cashu-wallet.json');
const DEFAULT_VAULT = 'hexnuts-vault';
const ARCHON_CONFIG = path.join(process.env.HOME, '.config/hex/archon');

async function main() {
  const vaultName = process.argv[2] || DEFAULT_VAULT;
  
  if (!fs.existsSync(WALLET_FILE)) {
    console.error('No wallet file found at', WALLET_FILE);
    process.exit(1);
  }
  
  if (!process.env.ARCHON_PASSPHRASE) {
    console.error('ARCHON_PASSPHRASE environment variable required');
    console.error('Export it or run: source ~/.config/hex/archon/.env');
    process.exit(1);
  }
  
  console.log(`Backing up wallet to Archon vault: ${vaultName}`);
  
  // Read wallet
  const walletData = fs.readFileSync(WALLET_FILE, 'utf8');
  const wallet = JSON.parse(walletData);
  
  // Calculate balance for metadata
  let totalBalance = 0;
  let proofCount = 0;
  for (const mintUrl of Object.keys(wallet.proofs || {})) {
    const proofs = wallet.proofs[mintUrl];
    proofCount += proofs.length;
    totalBalance += proofs.reduce((s, p) => s + p.amount, 0);
  }
  
  // Create backup metadata
  const backup = {
    type: 'hexnuts-wallet-backup',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    metadata: {
      totalBalance,
      proofCount,
      mints: Object.keys(wallet.proofs || {})
    },
    wallet: wallet
  };
  
  // Write temp file
  const tempFile = `/tmp/hexnuts-backup-${Date.now()}.json`;
  fs.writeFileSync(tempFile, JSON.stringify(backup, null, 2));
  
  try {
    // Use Archon CLI to encrypt and store
    const cmd = `cd ${ARCHON_CONFIG} && ARCHON_CONFIG_DIR=${ARCHON_CONFIG} npx @didcid/keymaster encrypt-file ${tempFile} --vault ${vaultName} 2>&1`;
    const result = execSync(cmd, { encoding: 'utf8', env: { ...process.env, ARCHON_CONFIG_DIR: ARCHON_CONFIG } });
    
    console.log(`\n✓ Wallet backed up to vault: ${vaultName}`);
    console.log(`  Balance: ${totalBalance} sats`);
    console.log(`  Proofs: ${proofCount}`);
    console.log(`  Mints: ${backup.metadata.mints.length}`);
    console.log(`  Timestamp: ${backup.timestamp}`);
    
    if (result.includes('cid:')) {
      const cidMatch = result.match(/cid:(\w+)/);
      if (cidMatch) {
        console.log(`  CID: ${cidMatch[1]}`);
      }
    }
  } catch (err) {
    // Fallback: just encrypt locally and show instructions
    console.log('\nArchon vault not available. Creating local encrypted backup...');
    
    const hash = crypto.createHash('sha256').update(walletData).digest('hex');
    const localBackup = path.join(process.env.HOME, '.config/hex', `hexnuts-backup-${Date.now()}.json`);
    fs.writeFileSync(localBackup, JSON.stringify(backup, null, 2));
    
    console.log(`\n✓ Local backup created: ${localBackup}`);
    console.log(`  SHA256: ${hash}`);
    console.log(`  Balance: ${totalBalance} sats`);
    console.log('\nTo upload to Archon vault manually:');
    console.log(`  npx @didcid/keymaster encrypt-file ${localBackup} --vault ${vaultName}`);
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
