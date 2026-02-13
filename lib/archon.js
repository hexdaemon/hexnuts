/**
 * Archon Skills Integration
 * 
 * Integrates with archon-keymaster skill when available:
 * - crypto: encrypt/decrypt files
 * - backup: vault operations
 * - nostr: key derivation
 * - aliases: DID alias resolution
 * 
 * Falls back to direct file operations if skills unavailable.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Skill locations (archon-keymaster consolidated structure)
const CLAWD_DIR = process.env.CLAWD_DIR || path.join(process.env.HOME, 'clawd');
const KEYMASTER_DIR = path.join(CLAWD_DIR, 'skills/archon-keymaster/scripts');
const SKILLS = {
  crypto: path.join(KEYMASTER_DIR, 'crypto'),
  backup: path.join(KEYMASTER_DIR, 'backup'),
  nostr: path.join(KEYMASTER_DIR, 'nostr'),
  aliases: path.join(KEYMASTER_DIR, 'aliases'),
  identity: path.join(KEYMASTER_DIR, 'identity'),
  messaging: path.join(KEYMASTER_DIR, 'messaging')
};

// Check if a skill is available
function skillAvailable(skillName) {
  const skillPath = SKILLS[skillName];
  return skillPath && fs.existsSync(skillPath);
}

// Get all available skills
function getAvailableSkills() {
  return {
    crypto: skillAvailable('crypto'),
    backup: skillAvailable('backup'),
    nostr: skillAvailable('nostr'),
    aliases: skillAvailable('aliases'),
    identity: skillAvailable('identity'),
    messaging: skillAvailable('messaging')
  };
}

/**
 * Load keys from archon-nostr or fallback to nostr.env
 */
function loadKeys() {
  const nostrEnv = path.join(process.env.HOME, '.config/hex/nostr.env');
  
  // Try to load from nostr.env (already derived by archon-nostr)
  if (fs.existsSync(nostrEnv)) {
    const content = fs.readFileSync(nostrEnv, 'utf8');
    const pubMatch = content.match(/NOSTR_PUBLIC_KEY_HEX="?([a-f0-9]+)"?/i);
    const secMatch = content.match(/NOSTR_SECRET_KEY_HEX="?([a-f0-9]+)"?/i);
    
    if (pubMatch && secMatch) {
      return {
        pubkey: pubMatch[1],
        privkey: secMatch[1],
        source: 'nostr.env'
      };
    }
  }
  
  // If archon-nostr skill available, try to derive keys
  if (skillAvailable('nostr')) {
    try {
      const script = path.join(SKILLS.nostr, 'derive-nostr.sh');
      execSync(`bash ${script}`, { stdio: 'pipe' });
      // Re-read after derivation
      return loadKeys();
    } catch (e) {
      // Derivation failed, continue to fallback
    }
  }
  
  return null;
}

/**
 * Encrypt a file using archon-crypto skill
 */
function encryptFile(inputPath, outputPath, recipientAlias = null) {
  if (!skillAvailable('crypto')) {
    throw new Error('archon-crypto skill not available');
  }
  
  const script = path.join(SKILLS.crypto, 'encrypt-file.sh');
  const args = recipientAlias 
    ? [inputPath, recipientAlias, outputPath]
    : [inputPath, 'self', outputPath];
  
  const result = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: process.env
  });
  
  if (result.status !== 0) {
    throw new Error(`Encryption failed: ${result.stderr || result.stdout}`);
  }
  
  return { success: true, output: outputPath };
}

/**
 * Decrypt a file using archon-crypto skill
 */
function decryptFile(inputPath, outputPath) {
  if (!skillAvailable('crypto')) {
    throw new Error('archon-crypto skill not available');
  }
  
  const script = path.join(SKILLS.crypto, 'decrypt-file.sh');
  
  const result = spawnSync('bash', [script, inputPath, outputPath], {
    encoding: 'utf8',
    env: process.env
  });
  
  if (result.status !== 0) {
    throw new Error(`Decryption failed: ${result.stderr || result.stdout}`);
  }
  
  return { success: true, output: outputPath };
}

/**
 * Backup to Archon vault using archon-backup skill
 */
function backupToVault(sourcePath, vaultName) {
  if (!skillAvailable('backup')) {
    throw new Error('archon-backup skill not available');
  }
  
  const script = path.join(SKILLS.backup, 'backup-to-vault.sh');
  
  const result = spawnSync('bash', [script, sourcePath, vaultName], {
    encoding: 'utf8',
    env: process.env
  });
  
  if (result.status !== 0) {
    throw new Error(`Backup failed: ${result.stderr || result.stdout}`);
  }
  
  return { success: true, output: result.stdout };
}

/**
 * Get pubkey formatted for Cashu P2PK (with 02/03 prefix)
 */
function getCashuPubkey() {
  const keys = loadKeys();
  if (!keys) return null;
  
  let pubkey = keys.pubkey;
  // Add compressed pubkey prefix if missing
  if (pubkey.length === 64) {
    pubkey = '02' + pubkey;
  }
  return pubkey;
}

/**
 * Get privkey for Cashu P2PK signing
 */
function getCashuPrivkey() {
  const keys = loadKeys();
  return keys ? keys.privkey : null;
}

module.exports = {
  skillAvailable,
  getAvailableSkills,
  loadKeys,
  encryptFile,
  decryptFile,
  backupToVault,
  getCashuPubkey,
  getCashuPrivkey,
  SKILLS,
  CLAWD_DIR
};
