/**
 * Archon Group Resolution
 * 
 * Resolves Archon groups to member pubkeys for multi-sig P2PK locking.
 */

const { execSync } = require('child_process');
const path = require('path');

// Archon config location
const ARCHON_CONFIG = process.env.ARCHON_CONFIG_DIR || 
  path.join(process.env.HOME, '.config/hex/archon');

/**
 * Convert JWK pubkey to compressed hex format for Cashu
 */
function jwkToCompressedPubkey(jwk) {
  // Decode base64url x and y coordinates
  const x = Buffer.from(jwk.x.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const y = Buffer.from(jwk.y.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  
  // Determine prefix: 02 if y is even, 03 if y is odd
  const prefix = (y[y.length - 1] & 1) === 0 ? '02' : '03';
  
  // Return compressed pubkey
  return prefix + x.toString('hex');
}

/**
 * Get group info by DID or alias
 */
function getGroup(groupIdOrAlias) {
  try {
    const result = execSync(
      `cd ~/clawd/archon-personal && source .env && npx @didcid/keymaster get-group "${groupIdOrAlias}" 2>/dev/null`,
      { encoding: 'utf8', shell: '/bin/bash' }
    );
    return JSON.parse(result);
  } catch (e) {
    throw new Error(`Failed to resolve group: ${e.message}`);
  }
}

/**
 * Resolve a DID to get its secp256k1 pubkey
 */
function resolveDIDPubkey(did) {
  try {
    const result = execSync(
      `cd ~/clawd/archon-personal && source .env && npx @didcid/keymaster resolve-did "${did}" 2>/dev/null`,
      { encoding: 'utf8', shell: '/bin/bash' }
    );
    const doc = JSON.parse(result);
    
    // Find secp256k1 verification method
    const vm = doc.didDocument?.verificationMethod?.find(
      m => m.type === 'EcdsaSecp256k1VerificationKey2019' && m.publicKeyJwk
    );
    
    if (!vm || !vm.publicKeyJwk) {
      throw new Error(`No secp256k1 key found in DID document`);
    }
    
    return jwkToCompressedPubkey(vm.publicKeyJwk);
  } catch (e) {
    throw new Error(`Failed to resolve DID ${did}: ${e.message}`);
  }
}

/**
 * Resolve all members of a group to their pubkeys
 */
function resolveGroupPubkeys(groupIdOrAlias) {
  const group = getGroup(groupIdOrAlias);
  
  console.log(`Resolving group "${group.name}" with ${group.members.length} members...`);
  
  const pubkeys = [];
  const resolved = [];
  
  for (const memberDID of group.members) {
    try {
      const pubkey = resolveDIDPubkey(memberDID);
      pubkeys.push(pubkey);
      resolved.push({ did: memberDID, pubkey });
      console.log(`  ✓ ${memberDID.slice(0, 30)}... → ${pubkey.slice(0, 16)}...`);
    } catch (e) {
      console.error(`  ✗ ${memberDID.slice(0, 30)}... → ${e.message}`);
    }
  }
  
  return {
    name: group.name,
    members: resolved,
    pubkeys
  };
}

/**
 * List available groups
 */
function listGroups() {
  try {
    const result = execSync(
      `cd ~/clawd/archon-personal && source .env && npx @didcid/keymaster list-groups 2>/dev/null`,
      { encoding: 'utf8', shell: '/bin/bash' }
    );
    return JSON.parse(result);
  } catch (e) {
    return [];
  }
}

module.exports = {
  getGroup,
  resolveDIDPubkey,
  resolveGroupPubkeys,
  listGroups,
  jwkToCompressedPubkey
};
