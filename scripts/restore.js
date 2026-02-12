#!/usr/bin/env node
/**
 * Restore wallet from Archon vault or local backup
 * Usage: 
 *   node restore.js <backup_file>           # Restore from local file
 *   node restore.js --vault [vault_name]    # Restore from Archon vault
 * 
 * Requires: ARCHON_PASSPHRASE for vault restore
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WALLET_FILE = path.join(process.env.HOME, '.config/hex/cashu-wallet.json');
const DEFAULT_VAULT = 'hexnuts-vault';
const ARCHON_CONFIG = path.join(process.env.HOME, '.config/hex/archon');

async function main() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];
  
  if (!arg1) {
    console.error('Usage:');
    console.error('  node restore.js <backup_file>         # From local file');
    console.error('  node restore.js --vault [vault_name]  # From Archon vault');
    process.exit(1);
  }
  
  let backupData;
  
  if (arg1 === '--vault') {
    // Restore from Archon vault
    const vaultName = arg2 || DEFAULT_VAULT;
    
    if (!process.env.ARCHON_PASSPHRASE) {
      console.error('ARCHON_PASSPHRASE environment variable required');
      process.exit(1);
    }
    
    console.log(`Restoring from Archon vault: ${vaultName}...`);
    
    try {
      const cmd = `cd ${ARCHON_CONFIG} && ARCHON_CONFIG_DIR=${ARCHON_CONFIG} npx @didcid/keymaster vault-list ${vaultName} --json 2>&1`;
      const listResult = execSync(cmd, { encoding: 'utf8', env: { ...process.env, ARCHON_CONFIG_DIR: ARCHON_CONFIG } });
      
      // Parse vault contents and find latest backup
      const items = JSON.parse(listResult);
      const backups = items.filter(i => i.name && i.name.includes('hexnuts-backup'));
      
      if (backups.length === 0) {
        console.error('No backups found in vault');
        process.exit(1);
      }
      
      // Get latest
      const latest = backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      console.log(`Found backup: ${latest.name} (${latest.timestamp})`);
      
      // Decrypt
      const decryptCmd = `cd ${ARCHON_CONFIG} && ARCHON_CONFIG_DIR=${ARCHON_CONFIG} npx @didcid/keymaster decrypt-file ${latest.cid} 2>&1`;
      backupData = execSync(decryptCmd, { encoding: 'utf8', env: { ...process.env, ARCHON_CONFIG_DIR: ARCHON_CONFIG } });
      
    } catch (err) {
      console.error('Failed to restore from vault:', err.message);
      console.error('\nTry restoring from a local backup file instead.');
      process.exit(1);
    }
  } else {
    // Restore from local file
    const backupFile = arg1;
    
    if (!fs.existsSync(backupFile)) {
      console.error(`Backup file not found: ${backupFile}`);
      process.exit(1);
    }
    
    console.log(`Restoring from: ${backupFile}`);
    backupData = fs.readFileSync(backupFile, 'utf8');
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
