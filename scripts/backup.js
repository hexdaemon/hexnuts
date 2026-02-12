#!/usr/bin/env node
/**
 * Backup wallet to Archon vault or local file
 * Usage: 
 *   node backup.js [vault_name]           # Backup to Archon vault
 *   node backup.js --local                # Local unencrypted backup
 *   node backup.js --local --encrypt      # Local encrypted backup
 * 
 * Default vault: hex-vault
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const WALLET_FILE = path.join(process.env.HOME, '.config/hex/cashu-wallet.json');
const BACKUP_DIR = path.join(process.env.HOME, '.config/hex');
const DEFAULT_VAULT = 'hex-vault';
const ARCHON_CONFIG = process.env.ARCHON_CONFIG_DIR || path.join(process.env.HOME, 'clawd/archon-personal');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { vault: null, local: false, encrypt: false };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--local' || args[i] === '-l') {
      result.local = true;
    } else if (args[i] === '--encrypt' || args[i] === '-e') {
      result.encrypt = true;
    } else if (!args[i].startsWith('-')) {
      result.vault = args[i];
    }
  }
  
  // Default to vault backup if not local
  if (!result.local && !result.vault) {
    result.vault = DEFAULT_VAULT;
  }
  
  return result;
}

function getWalletStats(wallet) {
  let totalBalance = 0;
  let proofCount = 0;
  const mints = Object.keys(wallet.proofs || {});
  
  for (const mintUrl of mints) {
    const proofs = wallet.proofs[mintUrl];
    proofCount += proofs.length;
    totalBalance += proofs.reduce((s, p) => s + p.amount, 0);
  }
  
  return { totalBalance, proofCount, mints };
}

function createBackupObject(wallet) {
  const stats = getWalletStats(wallet);
  return {
    type: 'hexnuts-wallet-backup',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    metadata: stats,
    wallet: wallet
  };
}

async function backupToVault(vaultName) {
  console.log(`=== Backing up to Archon vault: ${vaultName} ===\n`);
  
  // Read and prepare wallet
  const walletData = fs.readFileSync(WALLET_FILE, 'utf8');
  const wallet = JSON.parse(walletData);
  const backup = createBackupObject(wallet);
  const stats = backup.metadata;
  
  // Write temp file with short name for vault compatibility
  const tempFile = `/tmp/hnwallet.json`;
  fs.writeFileSync(tempFile, JSON.stringify(backup, null, 2));
  
  try {
    // Add to vault using keymaster
    const cmd = `cd ${ARCHON_CONFIG} && npx @didcid/keymaster add-vault-item ${vaultName} ${tempFile} 2>&1`;
    const result = execSync(cmd, { encoding: 'utf8' });
    
    if (result.includes('OK') || result.trim() === '') {
      console.log(`✓ Wallet backed up to vault: ${vaultName}`);
      console.log(`  Balance: ${stats.totalBalance} sats`);
      console.log(`  Proofs: ${stats.proofCount}`);
      console.log(`  Mints: ${stats.mints.length}`);
      console.log(`  Timestamp: ${backup.timestamp}`);
      console.log(`\nTo restore: node restore.js --vault ${vaultName}`);
    } else {
      throw new Error(result);
    }
  } catch (e) {
    console.error('Vault backup failed:', e.message);
    console.error('\nFalling back to local backup...');
    await localBackup(false);
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

async function localBackup(encrypt) {
  console.log(`=== Creating local ${encrypt ? 'encrypted ' : ''}backup ===\n`);
  
  // Read and prepare wallet
  const walletData = fs.readFileSync(WALLET_FILE, 'utf8');
  const wallet = JSON.parse(walletData);
  const backup = createBackupObject(wallet);
  const stats = backup.metadata;
  
  const timestamp = Date.now();
  
  if (encrypt) {
    // Generate random key and IV
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    
    // Encrypt backup
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(backup), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Save encrypted file
    const encryptedFile = path.join(BACKUP_DIR, `hexnuts-backup-${timestamp}.enc`);
    const keyFile = path.join(BACKUP_DIR, `hexnuts-backup-${timestamp}.key`);
    
    fs.writeFileSync(encryptedFile, JSON.stringify({
      version: '1.0.0',
      algorithm: 'aes-256-cbc',
      iv: iv.toString('base64'),
      data: encrypted
    }, null, 2), { mode: 0o600 });
    
    fs.writeFileSync(keyFile, key.toString('base64'), { mode: 0o600 });
    fs.chmodSync(encryptedFile, 0o600);
    fs.chmodSync(keyFile, 0o600);
    
    console.log(`✓ Encrypted backup created`);
    console.log(`  Backup: ${encryptedFile}`);
    console.log(`  Key: ${keyFile}`);
    console.log(`  Balance: ${stats.totalBalance} sats`);
    console.log(`\n⚠️  Store the key file securely! Without it, backup cannot be restored.`);
    
  } else {
    // Plain backup
    const hash = crypto.createHash('sha256').update(walletData).digest('hex');
    const backupFile = path.join(BACKUP_DIR, `hexnuts-backup-${timestamp}.json`);
    
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), { mode: 0o600 });
    fs.chmodSync(backupFile, 0o600);
    
    console.log(`✓ Local backup created: ${backupFile}`);
    console.log(`  SHA256: ${hash}`);
    console.log(`  Balance: ${stats.totalBalance} sats`);
    console.log(`  Proofs: ${stats.proofCount}`);
    console.log(`\n⚠️  Backup is NOT encrypted. Use --encrypt for sensitive backups.`);
  }
}

async function main() {
  if (!fs.existsSync(WALLET_FILE)) {
    console.error('No wallet file found at', WALLET_FILE);
    console.error('Create a wallet first: node mint.js <amount>');
    process.exit(1);
  }
  
  const opts = parseArgs();
  
  if (opts.local) {
    await localBackup(opts.encrypt);
  } else {
    await backupToVault(opts.vault);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
