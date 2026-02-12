#!/usr/bin/env node
/**
 * Backup wallet to Archon vault (encrypted)
 * Usage: node backup.js [vault_name]
 * 
 * Default vault: hexnuts-vault
 * 
 * Integrates with archon-backup and archon-crypto skills when available.
 * Falls back to local backup if skills unavailable.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archon = require('../lib/archon');

const WALLET_FILE = path.join(process.env.HOME, '.config/hex/cashu-wallet.json');
const DEFAULT_VAULT = 'hexnuts-vault';

async function main() {
  const vaultName = process.argv[2] || DEFAULT_VAULT;
  
  if (!fs.existsSync(WALLET_FILE)) {
    console.error('No wallet file found at', WALLET_FILE);
    process.exit(1);
  }
  
  // Check available archon skills
  const skills = archon.getAvailableSkills();
  console.log('Archon skills available:', JSON.stringify(skills));
  
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
    if (skills.backup && skills.crypto && process.env.ARCHON_PASSPHRASE) {
      // Use archon skills for encrypted vault backup
      console.log(`\nBacking up to Archon vault: ${vaultName}`);
      
      try {
        const result = archon.backupToVault(tempFile, vaultName);
        
        console.log(`\n✓ Wallet backed up to vault: ${vaultName}`);
        console.log(`  Balance: ${totalBalance} sats`);
        console.log(`  Proofs: ${proofCount}`);
        console.log(`  Mints: ${backup.metadata.mints.length}`);
        console.log(`  Timestamp: ${backup.timestamp}`);
        return;
      } catch (e) {
        console.log(`Vault backup failed: ${e.message}`);
        console.log('Falling back to local encrypted backup...');
      }
      
    }
    
    if (skills.crypto) {
      // Encrypt locally using archon-crypto
      console.log('\nArchon backup skill not available. Creating encrypted local backup...');
      
      const encryptedFile = path.join(process.env.HOME, '.config/hex', `hexnuts-backup-${Date.now()}.enc`);
      archon.encryptFile(tempFile, encryptedFile);
      
      console.log(`\n✓ Encrypted backup created: ${encryptedFile}`);
      console.log(`  Balance: ${totalBalance} sats`);
      console.log(`\nTo upload to vault manually, use archon-backup skill.`);
      
    } else {
      // Fallback: plain local backup with hash
      console.log('\nArchon skills not available. Creating local backup...');
      
      const hash = crypto.createHash('sha256').update(walletData).digest('hex');
      const localBackup = path.join(process.env.HOME, '.config/hex', `hexnuts-backup-${Date.now()}.json`);
      fs.writeFileSync(localBackup, JSON.stringify(backup, null, 2));
      
      console.log(`\n✓ Local backup created: ${localBackup}`);
      console.log(`  SHA256: ${hash}`);
      console.log(`  Balance: ${totalBalance} sats`);
      console.log('\n⚠️  Backup is NOT encrypted. Install archon skills for encryption.');
    }
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
