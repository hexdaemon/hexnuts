#!/usr/bin/env node
/**
 * Restore wallet from backup
 * Usage:
 *   node restore.js <backup_file>              # Restore from local file
 *   node restore.js --vault [vault_name]       # Restore from Archon vault
 *   node restore.js --list-vault [vault_name]  # List vault backups
 * 
 * Supports JSON backups and encrypted .enc files.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WALLET_FILE = path.join(process.env.HOME, '.config/hex/cashu-wallet.json');
const DEFAULT_VAULT = 'hex-vault';
const ARCHON_CONFIG = process.env.ARCHON_CONFIG_DIR || path.join(process.env.HOME, 'clawd/archon-personal');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { file: null, vault: null, listVault: false };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--vault' || args[i] === '-v') {
      result.vault = args[++i] || DEFAULT_VAULT;
    } else if (args[i] === '--list-vault' || args[i] === '-l') {
      result.listVault = true;
      result.vault = args[++i] || DEFAULT_VAULT;
    } else if (!args[i].startsWith('-')) {
      result.file = args[i];
    }
  }
  
  return result;
}

async function listVaultItems(vaultName) {
  try {
    const cmd = `cd ${ARCHON_CONFIG} && npx @didcid/keymaster list-vault-items ${vaultName} 2>/dev/null`;
    const result = execSync(cmd, { encoding: 'utf8' });
    const items = JSON.parse(result);
    
    // Filter for wallet backups
    const backups = Object.entries(items)
      .filter(([name]) => name.includes('cashu') || name.includes('hexnuts') || name.includes('wallet'))
      .sort(([, a], [, b]) => new Date(b.added) - new Date(a.added));
    
    return backups;
  } catch (e) {
    throw new Error(`Could not list vault items: ${e.message}`);
  }
}

async function restoreFromVault(vaultName, itemName) {
  const tempFile = `/tmp/hexnuts-restore-${Date.now()}.json`;
  
  try {
    const cmd = `cd ${ARCHON_CONFIG} && npx @didcid/keymaster get-vault-item ${vaultName} "${itemName}" ${tempFile} 2>/dev/null`;
    execSync(cmd, { encoding: 'utf8' });
    
    if (!fs.existsSync(tempFile)) {
      throw new Error('Failed to retrieve item from vault');
    }
    
    return tempFile;
  } catch (e) {
    throw new Error(`Could not restore from vault: ${e.message}`);
  }
}

function restoreFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  let backup;
  
  try {
    backup = JSON.parse(content);
  } catch (e) {
    throw new Error('Invalid JSON in backup file');
  }
  
  // Handle both direct wallet format and wrapped backup format
  let wallet;
  if (backup.type === 'hexnuts-wallet-backup' && backup.wallet) {
    console.log(`Backup from: ${backup.timestamp}`);
    console.log(`Original balance: ${backup.metadata?.totalBalance || 'unknown'} sats`);
    wallet = backup.wallet;
  } else if (backup.proofs) {
    wallet = backup;
  } else {
    throw new Error('Unrecognized backup format');
  }
  
  return wallet;
}

async function main() {
  const opts = parseArgs();
  
  if (!opts.file && !opts.vault && !opts.listVault) {
    console.error('Usage: node restore.js <backup_file>');
    console.error('       node restore.js --vault [vault_name]');
    console.error('       node restore.js --list-vault [vault_name]');
    console.error('');
    console.error('Options:');
    console.error('  --vault, -v         Restore latest backup from Archon vault');
    console.error('  --list-vault, -l    List available backups in vault');
    console.error('');
    console.error(`Default vault: ${DEFAULT_VAULT}`);
    process.exit(1);
  }
  
  // List vault contents
  if (opts.listVault) {
    console.log(`=== Backups in vault: ${opts.vault} ===\n`);
    
    try {
      const backups = await listVaultItems(opts.vault);
      
      if (backups.length === 0) {
        console.log('No wallet backups found in vault.');
        console.log('\nTo backup your wallet:');
        console.log('  node backup.js ' + opts.vault);
      } else {
        for (const [name, info] of backups) {
          console.log(`${name}`);
          console.log(`  Added: ${info.added}`);
          console.log(`  Size: ${info.bytes} bytes`);
          console.log(`  CID: ${info.cid}`);
          console.log('');
        }
        console.log(`To restore: node restore.js --vault ${opts.vault}`);
      }
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
    return;
  }
  
  // Restore from vault
  if (opts.vault) {
    console.log(`=== Restoring from vault: ${opts.vault} ===\n`);
    
    try {
      const backups = await listVaultItems(opts.vault);
      
      if (backups.length === 0) {
        console.error('No wallet backups found in vault.');
        process.exit(1);
      }
      
      // Use most recent backup
      const [itemName, itemInfo] = backups[0];
      console.log(`Latest backup: ${itemName}`);
      console.log(`  Added: ${itemInfo.added}`);
      
      const tempFile = await restoreFromVault(opts.vault, itemName);
      const wallet = restoreFromFile(tempFile);
      
      // Clean up temp file
      fs.unlinkSync(tempFile);
      
      // Backup existing wallet
      if (fs.existsSync(WALLET_FILE)) {
        const backupPath = WALLET_FILE + '.pre-restore.' + Date.now();
        fs.copyFileSync(WALLET_FILE, backupPath);
        console.log(`\nExisting wallet backed up to: ${backupPath}`);
      }
      
      // Write restored wallet
      fs.writeFileSync(WALLET_FILE, JSON.stringify(wallet, null, 2), { mode: 0o600 });
      fs.chmodSync(WALLET_FILE, 0o600);
      
      // Calculate restored balance
      let balance = 0;
      for (const mintUrl of Object.keys(wallet.proofs || {})) {
        balance += wallet.proofs[mintUrl].reduce((s, p) => s + p.amount, 0);
      }
      
      console.log(`\n✓ Wallet restored!`);
      console.log(`  Balance: ${balance} sats`);
      console.log(`  Mints: ${Object.keys(wallet.proofs || {}).length}`);
      
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
    return;
  }
  
  // Restore from local file
  console.log(`=== Restoring from file: ${opts.file} ===\n`);
  
  try {
    const wallet = restoreFromFile(opts.file);
    
    // Backup existing wallet
    if (fs.existsSync(WALLET_FILE)) {
      const backupPath = WALLET_FILE + '.pre-restore.' + Date.now();
      fs.copyFileSync(WALLET_FILE, backupPath);
      console.log(`Existing wallet backed up to: ${backupPath}`);
    }
    
    // Write restored wallet
    fs.writeFileSync(WALLET_FILE, JSON.stringify(wallet, null, 2), { mode: 0o600 });
    fs.chmodSync(WALLET_FILE, 0o600);
    
    // Calculate restored balance
    let balance = 0;
    for (const mintUrl of Object.keys(wallet.proofs || {})) {
      balance += wallet.proofs[mintUrl].reduce((s, p) => s + p.amount, 0);
    }
    
    console.log(`\n✓ Wallet restored!`);
    console.log(`  Balance: ${balance} sats`);
    console.log(`  Mints: ${Object.keys(wallet.proofs || {}).length}`);
    
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
