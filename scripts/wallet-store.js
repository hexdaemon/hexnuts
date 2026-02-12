/**
 * Cashu Wallet Storage
 * Manages proof storage and mint keyset caching
 * 
 * Uses file locking to prevent race conditions in concurrent access.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(process.env.HOME, '.config', 'hex');
const WALLET_FILE = path.join(CONFIG_DIR, 'cashu-wallet.json');
const LOCK_FILE = WALLET_FILE + '.lock';
const DEFAULT_MINT = 'https://bolverker.com/cashu';

// Lock timeout in ms
const LOCK_TIMEOUT = 5000;
const LOCK_RETRY_INTERVAL = 50;

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Acquire file lock (blocking with timeout)
 */
function acquireLock() {
  const startTime = Date.now();
  
  while (true) {
    try {
      // Try to create lock file exclusively
      fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx', mode: 0o600 });
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      
      // Check if lock is stale (process that created it is gone)
      try {
        const lockPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'));
        try {
          process.kill(lockPid, 0); // Check if process exists
        } catch (e) {
          // Process doesn't exist, remove stale lock
          fs.unlinkSync(LOCK_FILE);
          continue;
        }
      } catch (e) {
        // Can't read lock file, try again
      }
      
      // Check timeout
      if (Date.now() - startTime > LOCK_TIMEOUT) {
        throw new Error('Failed to acquire wallet lock (timeout)');
      }
      
      // Wait and retry
      const waitUntil = Date.now() + LOCK_RETRY_INTERVAL;
      while (Date.now() < waitUntil) { /* busy wait */ }
    }
  }
}

/**
 * Release file lock
 */
function releaseLock() {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch (e) {
    // Ignore errors releasing lock
  }
}

/**
 * Execute function with lock held
 */
function withLock(fn) {
  acquireLock();
  try {
    return fn();
  } finally {
    releaseLock();
  }
}

function loadWallet() {
  ensureConfigDir();
  if (fs.existsSync(WALLET_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    } catch (e) {
      console.error('Error loading wallet:', e.message);
      return { proofs: {}, mints: {} };
    }
  }
  return { proofs: {}, mints: {} };
}

function saveWallet(wallet) {
  ensureConfigDir();
  fs.writeFileSync(WALLET_FILE, JSON.stringify(wallet, null, 2), { mode: 0o600 });
  // Ensure permissions even if file existed
  fs.chmodSync(WALLET_FILE, 0o600);
}

function getProofsForMint(mintUrl) {
  const wallet = loadWallet();
  return wallet.proofs[mintUrl] || [];
}

function saveProofsForMint(mintUrl, proofs) {
  withLock(() => {
    const wallet = loadWallet();
    wallet.proofs[mintUrl] = proofs;
    saveWallet(wallet);
  });
}

function addProofsForMint(mintUrl, newProofs) {
  withLock(() => {
    const wallet = loadWallet();
    const existing = wallet.proofs[mintUrl] || [];
    wallet.proofs[mintUrl] = [...existing, ...newProofs];
    saveWallet(wallet);
  });
}

function removeProofsForMint(mintUrl, proofsToRemove) {
  withLock(() => {
    const wallet = loadWallet();
    const existing = wallet.proofs[mintUrl] || [];
    const secretsToRemove = new Set(proofsToRemove.map(p => p.secret));
    wallet.proofs[mintUrl] = existing.filter(p => !secretsToRemove.has(p.secret));
    saveWallet(wallet);
  });
}

function getAllMints() {
  const wallet = loadWallet();
  return Object.keys(wallet.proofs);
}

function getBalanceForMint(mintUrl) {
  const proofs = getProofsForMint(mintUrl);
  return proofs.reduce((sum, p) => sum + p.amount, 0);
}

function getTotalBalance() {
  const wallet = loadWallet();
  let total = 0;
  for (const mintUrl of Object.keys(wallet.proofs)) {
    total += wallet.proofs[mintUrl].reduce((sum, p) => sum + p.amount, 0);
  }
  return total;
}

module.exports = {
  DEFAULT_MINT,
  WALLET_FILE,
  loadWallet,
  saveWallet,
  getProofsForMint,
  saveProofsForMint,
  addProofsForMint,
  removeProofsForMint,
  getAllMints,
  getBalanceForMint,
  getTotalBalance,
  withLock
};
