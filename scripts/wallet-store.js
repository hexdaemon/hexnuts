/**
 * Cashu Wallet Storage
 * Manages proof storage and mint keyset caching
 */

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(process.env.HOME, '.config', 'hex');
const WALLET_FILE = path.join(CONFIG_DIR, 'cashu-wallet.json');
const DEFAULT_MINT = 'https://bolverker.com/cashu';

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
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
  fs.writeFileSync(WALLET_FILE, JSON.stringify(wallet, null, 2));
}

function getProofsForMint(mintUrl) {
  const wallet = loadWallet();
  return wallet.proofs[mintUrl] || [];
}

function saveProofsForMint(mintUrl, proofs) {
  const wallet = loadWallet();
  wallet.proofs[mintUrl] = proofs;
  saveWallet(wallet);
}

function addProofsForMint(mintUrl, newProofs) {
  const existing = getProofsForMint(mintUrl);
  saveProofsForMint(mintUrl, [...existing, ...newProofs]);
}

function removeProofsForMint(mintUrl, proofsToRemove) {
  const existing = getProofsForMint(mintUrl);
  const secretsToRemove = new Set(proofsToRemove.map(p => p.secret));
  const remaining = existing.filter(p => !secretsToRemove.has(p.secret));
  saveProofsForMint(mintUrl, remaining);
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
  loadWallet,
  saveWallet,
  getProofsForMint,
  saveProofsForMint,
  addProofsForMint,
  removeProofsForMint,
  getAllMints,
  getBalanceForMint,
  getTotalBalance
};
