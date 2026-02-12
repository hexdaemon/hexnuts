/**
 * Wallet Factory
 * 
 * Creates wallet instances with deterministic mode when available.
 * All scripts should use this instead of new Wallet() directly.
 */

const { Wallet } = require('@cashu/cashu-ts');
const deterministic = require('./deterministic');

let _deterministicLogged = false;

/**
 * Create a wallet instance
 * Uses deterministic mode if ARCHON_PASSPHRASE is set
 * 
 * @param {string} mintUrl - Mint URL
 * @param {object} options - Additional wallet options
 * @param {boolean} options.silent - Don't log deterministic mode message
 */
async function createWallet(mintUrl, options = {}) {
  const { silent, ...walletOpts } = options;
  let walletConfig = { unit: 'sat', ...walletOpts };
  let isDeterministic = false;
  
  // Check for deterministic mode
  if (deterministic.isDeterministicAvailable()) {
    const detConfig = deterministic.getDeterministicConfig();
    if (detConfig) {
      walletConfig = { ...walletConfig, ...detConfig };
      isDeterministic = true;
      
      // Only log once per process
      if (!silent && !_deterministicLogged) {
        console.log('🔐 Deterministic mode active');
        _deterministicLogged = true;
      }
    }
  }
  
  const wallet = new Wallet(mintUrl, walletConfig);
  await wallet.loadMint();
  
  // Set up counter persistence if deterministic
  if (isDeterministic) {
    wallet.on.countersReserved(({ keysetId, next }) => {
      deterministic.updateCounter(keysetId, next);
    });
  }
  
  return wallet;
}

/**
 * Check if deterministic mode is available
 */
function isDeterministic() {
  return deterministic.isDeterministicAvailable();
}

/**
 * Reset the logged state (for testing)
 */
function resetLogState() {
  _deterministicLogged = false;
}

module.exports = {
  createWallet,
  isDeterministic,
  resetLogState
};
