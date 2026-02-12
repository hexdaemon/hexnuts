# HexNuts 🥜

A lightweight Cashu ecash wallet for AI agents, with Archon DID integration.

Built on [@cashu/cashu-ts](https://github.com/cashubtc/cashu-ts).

## Features

- **Mint/Melt** — Convert between Lightning and ecash
- **Send/Receive** — Portable offline tokens
- **P2PK Locking (NUT-11)** — Lock tokens to pubkeys
- **Group Spending** — Lock to Archon groups with threshold signatures
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

Lock tokens so only specific private key holder(s) can spend:

```bash
# Lock to your own Archon/Nostr pubkey
node scripts/lock.js 100 --self

# Lock to someone else's pubkey
node scripts/lock.js 100 02abc123...

# Receive a P2PK-locked token (using your key)
node scripts/receive.js <cashu_token> --self
```

### Group Tokens (Archon Groups)

Lock tokens to an Archon group with threshold signatures:

```bash
# Any 1 member of "daemon-collective" can spend
node scripts/send-to-group.js 100 daemon-collective

# Require 2-of-3 member signatures
node scripts/send-to-group.js 100 daemon-collective --threshold 2

# Use group DID directly
node scripts/send-to-group.js 100 did:cid:bagaaiera...
```

How it works:
1. Resolves group DID to get member list
2. Resolves each member's DID to their secp256k1 pubkey  
3. Locks token with NUT-11 multi-key + threshold

Use cases:
- **Group treasury**: Funds any authorized member can access
- **Shared expenses**: Reimbursement tokens for team members
- **Multi-sig escrow**: Require N-of-M approval for high-value transfers

### Multi-Signature Tokens (Raw Pubkeys)

Create tokens requiring multiple pubkey signatures without Archon groups:

```bash
# 2-of-3 multisig: any 2 of 3 pubkeys can spend
node scripts/lock-multisig.js 100 --pubkeys pk1,pk2,pk3 --threshold 2

# Include yourself + another pubkey
node scripts/lock-multisig.js 100 --pubkeys pk1,pk2 --self --threshold 2

# Escrow with timeout: pk1 OR pk2 can spend, refund to pk3 after 24h
node scripts/lock-multisig.js 100 --pubkeys pk1,pk2 --refund pk3 --locktime $(date -d "+24 hours" +%s)
```

Use cases:
- **Joint accounts**: Require multiple parties to agree
- **Escrow**: Seller + buyer, with arbiter refund
- **Dead man switch**: Auto-refund if not claimed

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

## Deterministic Wallet (NUT-13)

Derive wallet from Archon mnemonic — no separate seed phrase needed:

```bash
# Initialize deterministic mode
export ARCHON_PASSPHRASE="your-passphrase"
node scripts/init-deterministic.js

# All operations now use deterministic derivation
node scripts/mint.js 100

# Recover wallet on new device
node scripts/recover.js
```

Benefits:
- Wallet derived from Archon 12/24 word mnemonic
- Recover Archon = recover Cashu wallet
- Counter state tracked for proof uniqueness

## Encrypted Ecash via Dmail

Send P2PK-locked ecash through encrypted channels:

```bash
# Create encrypted ecash for recipient
node scripts/dmail-send.js 100 npub1abc123... "Happy birthday!"

# Output: P2PK token + instructions for encrypted delivery
```

### Full Flow: Sender → Recipient

**Sender:**
```bash
# 1. Create P2PK token locked to recipient's npub
node scripts/dmail-send.js 100 npub1qkjnsgk6zrs...

# 2. Encrypt the token with archon-crypto
~/clawd/skills/archon-crypto/scripts/encrypt-message.sh "cashuB..." recipient-alias

# 3. Send encrypted payload via Nostr DM / Signal / email
~/clawd/skills/nostr/scripts/nostr-dm.sh npub1... "<encrypted>"
```

**Recipient:**
```bash
# 1. Decrypt with their Archon key
~/clawd/skills/archon-crypto/scripts/decrypt-message.sh <encrypted>

# 2. Claim the P2PK token (only they can)
node scripts/receive.js "cashuB..." --self
```

### Why Both P2PK + Encryption?

| Layer | Protection |
|-------|------------|
| **P2PK (NUT-11)** | Only recipient's key can spend |
| **Archon encryption** | Only recipient can see the token |

Double protection: Even if the encrypted message leaks, only the intended recipient can spend the ecash.

## Security

- **Wallet file is plaintext** — Token proofs stored unencrypted locally
- **Use backup.js** — Encrypt and store in Archon vault
- **P2PK tokens** — Lock high-value tokens to your pubkey
- **Private key security** — Never share your nsec/privkey

## Production Checklist

Run validation:
```bash
node scripts/validate.js
```

| Feature | Status | Notes |
|---------|--------|-------|
| Basic wallet ops | ✅ | mint, melt, send, receive |
| P2PK locking (NUT-11) | ✅ | DID-backed pubkey locking |
| Archon key integration | ✅ | Uses archon-nostr derived keys |
| Token inspection | ✅ | Shows P2PK lock status |
| Encrypted backup | ✅ | Via archon-crypto |
| Vault backup | ✅ | Via archon-backup |
| Send to DID/npub | ✅ | Resolve recipient & lock |
| Input validation | ✅ | Amount, URL, key format |
| Multi-mint support | ✅ | Tracks proofs per mint |
| Deterministic wallet (NUT-13) | ✅ | Uses Archon mnemonic |

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `balance.js` | Check wallet balance |
| `mint.js` | Mint tokens (pay invoice) |
| `melt.js` | Melt tokens (pay invoice) |
| `send.js` | Create token to send |
| `receive.js` | Claim received token |
| `lock.js` | Create P2PK-locked token (--self) |
| `lock-multisig.js` | Create multi-signature token |
| `send-to-did.js` | Send P2PK token to DID/npub |
| `send-to-group.js` | Send group-locked token to Archon group |
| `info.js` | Inspect token details |
| `backup.js` | Backup wallet |
| `restore.js` | Restore wallet |
| `validate.js` | Check installation |
| `init-deterministic.js` | Enable NUT-13 deterministic mode |
| `recover.js` | Recover wallet from Archon mnemonic |
| `dmail-send.js` | Create encrypted ecash for dmail |

## License

MIT
