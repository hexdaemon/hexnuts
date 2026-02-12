/**
 * NUT-13 Deterministic Wallet Integration
 * 
 * Derives Cashu wallet seed from Archon mnemonic.
 * Requires ARCHON_PASSPHRASE environment variable.
 * 
 * Security: The mnemonic is accessed only during derivation,
 * never stored. Counter state is persisted to allow recovery.
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COUNTER_FILE = path.join(process.env.HOME, '.config/hex/cashu-counters.json');
const ARCHON_CONFIG = path.join(process.env.HOME, '.config/hex/archon');

/**
 * Get the Archon mnemonic (requires ARCHON_PASSPHRASE)
 * Returns null if not available
 */
function getMnemonic() {
  if (!process.env.ARCHON_PASSPHRASE) {
    return null;
  }
  
  try {
    const cmd = `cd ${ARCHON_CONFIG} && ARCHON_CONFIG_DIR=${ARCHON_CONFIG} npx @didcid/keymaster show-mnemonic 2>/dev/null`;
    const result = execSync(cmd, { 
      encoding: 'utf8',
      env: { ...process.env, ARCHON_CONFIG_DIR: ARCHON_CONFIG }
    });
    
    // Extract mnemonic words (12 or 24 words)
    const words = result.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 12) {
      return words.slice(0, words.length >= 24 ? 24 : 12).join(' ');
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Derive BIP-39 seed from mnemonic
 * Uses PBKDF2 with 2048 iterations (BIP-39 standard)
 */
function mnemonicToSeed(mnemonic, passphrase = '') {
  const salt = 'mnemonic' + passphrase;
  return crypto.pbkdf2Sync(
    Buffer.from(mnemonic.normalize('NFKD'), 'utf8'),
    Buffer.from(salt.normalize('NFKD'), 'utf8'),
    2048,
    64,
    'sha512'
  );
}

/**
 * Derive Cashu-specific seed from Archon mnemonic
 * Uses additional derivation to separate Cashu from other uses
 */
function deriveCashuSeed() {
  const mnemonic = getMnemonic();
  if (!mnemonic) {
    return null;
  }
  
  // Derive base seed
  const baseSeed = mnemonicToSeed(mnemonic);
  
  // Additional HMAC derivation for Cashu-specific seed
  // This ensures Cashu secrets are different from Archon/Nostr secrets
  const cashuSeed = crypto.createHmac('sha512', 'HexNuts/Cashu/v1')
    .update(baseSeed)
    .digest();
  
  return cashuSeed;
}

/**
 * Load counter state from file
 */
function loadCounters() {
  if (fs.existsSync(COUNTER_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

/**
 * Save counter state to file
 */
function saveCounters(counters) {
  const dir = path.dirname(COUNTER_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(COUNTER_FILE, JSON.stringify(counters, null, 2));
}

/**
 * Update counter for a keyset
 */
function updateCounter(keysetId, next) {
  const counters = loadCounters();
  counters[keysetId] = Math.max(counters[keysetId] || 0, next);
  saveCounters(counters);
}

/**
 * Check if deterministic mode is available
 */
function isDeterministicAvailable() {
  return !!process.env.ARCHON_PASSPHRASE && !!getMnemonic();
}

/**
 * Get deterministic wallet config for cashu-ts
 */
function getDeterministicConfig() {
  const seed = deriveCashuSeed();
  if (!seed) {
    return null;
  }
  
  return {
    bip39seed: seed,
    counterInit: loadCounters()
  };
}

module.exports = {
  getMnemonic,
  mnemonicToSeed,
  deriveCashuSeed,
  loadCounters,
  saveCounters,
  updateCounter,
  isDeterministicAvailable,
  getDeterministicConfig,
  COUNTER_FILE
};
