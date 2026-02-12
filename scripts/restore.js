#!/usr/bin/env node
/**
 * Restore wallet from Archon vault or local backup
 * Usage: 
 *   node restore.js <backup_file>           # Restore from local file
 *   node restore.js --vault [vault_name]    # Restore from Archon vault (future)
 * 
 * Integrates with archon-crypto skill for decryption when available.
 */

const fs = require('fs');
const path = require('path');
const archon = require('../lib/archon');

const WALLET_FILE = path.join(process.env.HOME, '.config/hex/cashu-wallet.json');
const DEFAULT_VAULT = 'hexnuts-vault';

async function main() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];
  
  if (!arg1) {
    console.error('Usage:');
    console.error('  node restore.js <backup_file>         # From local file');
    console.error('  node restore.js <encrypted_file>      # From encrypted backup');
    // console.error('  node restore.js --vault [vault_name]  # From Archon vault (future)');
    process.exit(1);
  }
  
  const skills = archon.getAvailableSkills();
  let backupData;
  
  if (arg1 === '--vault') {
    // TODO: Implement vault restore when archon-backup supports listing
    console.error('Vault restore not yet implemented.');
    console.error('Download the backup file from vault first, then restore from file.');
    process.exit(1);
    
  } else {
    // Restore from local file
    const backupFile = arg1;
    
    if (!fs.existsSync(backupFile)) {
      console.error(`Backup file not found: ${backupFile}`);
      process.exit(1);
    }
    
    console.log(`Restoring from: ${backupFile}`);
    
    // Check if encrypted (.enc extension or encrypted content)
    if (backupFile.endsWith('.enc')) {
      if (!skills.crypto) {
        console.error('Encrypted backup requires archon-crypto skill.');
        process.exit(1);
      }
      
      console.log('Decrypting backup...');
      const tempFile = `/tmp/hexnuts-restore-${Date.now()}.json`;
      
      try {
        archon.decryptFile(backupFile, tempFile);
        backupData = fs.readFileSync(tempFile, 'utf8');
        fs.unlinkSync(tempFile);
      } catch (e) {
        console.error('Decryption failed:', e.message);
        process.exit(1);
      }
    } else {
      backupData = fs.readFileSync(backupFile, 'utf8');
    }
  }
  
  // Parse backup
  let backup;
  try {
    backup = JSON.parse(backupData);
  } catch (e) {
    console.error('Invalid backup file format');
    process.exit(1);
  }
  
  // Validate backup
  if (backup.type !== 'hexnuts-wallet-backup') {
    console.error('Not a HexNuts backup file');
    process.exit(1);
  }
  
  // Check for existing wallet
  if (fs.existsSync(WALLET_FILE)) {
    const existing = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    let existingBalance = 0;
    for (const proofs of Object.values(existing.proofs || {})) {
      existingBalance += proofs.reduce((s, p) => s + p.amount, 0);
    }
    
    if (existingBalance > 0) {
      console.error(`\n⚠️  Existing wallet has ${existingBalance} sats!`);
      console.error('Restore would overwrite. To proceed:');
      console.error('  1. Backup existing: node backup.js');
      console.error('  2. Delete wallet: rm ~/.config/hex/cashu-wallet.json');
      console.error('  3. Re-run restore');
      process.exit(1);
    }
  }
  
  // Restore wallet
  const configDir = path.dirname(WALLET_FILE);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(WALLET_FILE, JSON.stringify(backup.wallet, null, 2));
  
  console.log(`\n✓ Wallet restored!`);
  console.log(`  Backup from: ${backup.timestamp}`);
  console.log(`  Balance: ${backup.metadata.totalBalance} sats`);
  console.log(`  Proofs: ${backup.metadata.proofCount}`);
  console.log(`  Mints: ${backup.metadata.mints.join(', ')}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
