/**
 * Wallet Factory
 * 
 * Creates wallet instances with deterministic mode when available.
 */

const { Wallet } = require('@cashu/cashu-ts');
const deterministic = require('./deterministic');

/**
 * Create a wallet instance
 * Uses deterministic mode if ARCHON_PASSPHRASE is set
 */
async function createWallet(mintUrl, options = {}) {
  let walletConfig = { unit: 'sat', ...options };
  
  // Check for deterministic mode
  if (deterministic.isDeterministicAvailable()) {
    const detConfig = deterministic.getDeterministicConfig();
    if (detConfig) {
      walletConfig = { ...walletConfig, ...detConfig };
      console.log('🔐 Deterministic mode active');
    }
  }
  
  const wallet = new Wallet(mintUrl, walletConfig);
  await wallet.loadMint();
  
  // Set up counter persistence if deterministic
  if (walletConfig.bip39seed) {
    wallet.on.countersReserved(({ keysetId, next }) => {
      deterministic.updateCounter(keysetId, next);
    });
  }
  
  return wallet;
}

/**
 * Check if deterministic mode is active
 */
function isDeterministic() {
  return deterministic.isDeterministicAvailable();
}

module.exports = {
  createWallet,
  isDeterministic
};
