# Cashu Wallet Skill (HexNuts)

Cashu ecash wallet with DID-backed P2PK support. Mint, melt, send, and receive ecash tokens with optional cryptographic locking.

## Quick Commands

```bash
CASHU=~/clawd/skills/cashu-wallet/scripts

# Check balance
node $CASHU/balance.js

# Mint tokens (creates invoice, then claim after payment)
node $CASHU/mint.js <amount_sats> [mint_url]
node $CASHU/mint.js --quote <quote_id> [mint_url]  # claim after payment

# Melt tokens (spend ecash to pay Lightning invoice)  
node $CASHU/melt.js <bolt11_invoice> [mint_url]

# Send tokens (create token string to give someone)
node $CASHU/send.js <amount_sats> [mint_url]

# Receive tokens (claim a token string)
node $CASHU/receive.js <cashu_token>

# Check token info without claiming
node $CASHU/info.js <cashu_token>
```

## P2PK Locking (NUT-11)

Lock tokens so only specific key holders can spend them:

```bash
# Lock to your own Archon/Nostr pubkey
node $CASHU/lock.js <amount> --self

# Lock to specific pubkey
node $CASHU/lock.js <amount> <pubkey>

# Send to DID/npub (resolves to pubkey)
node $CASHU/send-to-did.js <amount> <did_or_npub>
```

Receive locked tokens with your private key:
```bash
node $CASHU/receive.js <locked_token>  # Auto-signs with archon-nostr key
```

## Group Locking

Lock tokens to an Archon group with threshold signatures:

```bash
# Any 1 member can spend (default)
node $CASHU/send-to-group.js <amount> <group_name_or_did>

# Require 2-of-3 signatures
node $CASHU/send-to-group.js <amount> daemon-collective --threshold 2

# List available groups
node $CASHU/send-to-group.js --help
```

Group tokens resolve each member's DID to their secp256k1 pubkey and lock with NUT-11 multi-key support.

## Default Mint

- **Hive Mint:** `https://bolverker.com/cashu`

## Wallet Storage

Tokens stored in `~/.config/hex/cashu-wallet.json`.

## Token Format

Cashu tokens look like: `cashuBo2F0gaJhaUgA...`

## Fees

- Mint input fee: 100 ppk (1 sat per 10 proofs)
- Lightning fee reserve: ~1-2% (returned if unused)

## Utilities

```bash
# Validate installation
node $CASHU/validate.js

# Backup/restore wallet
node $CASHU/backup.js
node $CASHU/restore.js <backup_file>
```

## Dependencies

- `@cashu/cashu-ts` v3.x - Official Cashu TypeScript library

## Archon Integration

When `archon-keymaster` skill is available in `~/clawd/skills/`:
- `archon-keymaster/nostr` → Key derivation for P2PK
- `archon-keymaster/crypto` → Encrypted backups  
- `archon-keymaster/backup` → Vault storage
- `archon-keymaster/aliases` → DID alias resolution

Falls back gracefully if skill unavailable.
