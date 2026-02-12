# HexNuts 🥜

A lightweight Cashu ecash wallet for AI agents, with Archon DID integration.

Built on [@cashu/cashu-ts](https://github.com/cashubtc/cashu-ts).

## Features

- **Mint/Melt** — Convert between Lightning and ecash
- **Send/Receive** — Portable offline tokens
- **P2PK Locking (NUT-11)** — Lock tokens to pubkeys
- **Archon Integration** — Use DID keys for P2PK, backup to vault
- **Multi-mint support** — Use multiple mints

## Install

```bash
git clone https://github.com/hexdaemon/hexnuts.git
cd hexnuts
npm install
```

## Usage

### Basic Operations

```bash
# Check balance
node scripts/balance.js

# Mint tokens (pay Lightning invoice to get ecash)
node scripts/mint.js 100
# ... pay the invoice ...
node scripts/mint.js --quote <quote_id>

# Melt tokens (pay Lightning invoice with ecash)
node scripts/melt.js <bolt11_invoice>

# Send tokens (create portable token string)
node scripts/send.js 50

# Receive tokens
node scripts/receive.js <cashu_token>

# Inspect token without claiming
node scripts/info.js <cashu_token>
```

### P2PK Locking (NUT-11)

Lock tokens so only a specific private key holder can spend them:

```bash
# Lock to your own Archon/Nostr pubkey
node scripts/lock.js 100 --self

# Lock to someone else's pubkey
node scripts/lock.js 100 02abc123...

# Receive a P2PK-locked token (using your key)
node scripts/receive.js <cashu_token> --self

# Receive with explicit privkey
node scripts/receive.js <cashu_token> <privkey>
```

### Archon Vault Backup

```bash
# Backup wallet to Archon vault (encrypted)
export ARCHON_PASSPHRASE="your-passphrase"
node scripts/backup.js [vault_name]

# Restore from vault
node scripts/restore.js --vault [vault_name]

# Restore from local backup file
node scripts/restore.js /path/to/backup.json
```

## Configuration

- **Default mint:** `https://bolverker.com/cashu`
- **Wallet storage:** `~/.config/hex/cashu-wallet.json`
- **Archon config:** `~/.config/hex/archon/`
- **Keys:** `~/.config/hex/nostr.env` (NOSTR_SECRET_KEY_HEX, NOSTR_PUBLIC_KEY_HEX)

## Archon Skills Integration

HexNuts integrates with [archon-* skills](https://github.com/archetech/agent-skills) when available:

| Skill | Usage in HexNuts |
|-------|-----------------|
| `archon-nostr` | Load secp256k1 keys for P2PK |
| `archon-crypto` | Encrypt wallet backups |
| `archon-backup` | Store backups in DID vault |

**Without archon skills:** Falls back to direct key loading from `~/.config/hex/nostr.env` and unencrypted local backups.

**With archon skills:**
- P2PK tokens locked to your DID-backed pubkey
- Encrypted backups to distributed vault
- Key derivation from Archon identity

## Security

- **Wallet file is plaintext** — Token proofs stored unencrypted locally
- **Use backup.js** — Encrypt and store in Archon vault
- **P2PK tokens** — Lock high-value tokens to your pubkey
- **Private key security** — Never share your nsec/privkey

## License

MIT
