# Cashu Wallet Skill

Cashu ecash wallet for Hex. Mint, melt, send, and receive ecash tokens.

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

## Default Mint

- **Hive Mint:** `https://bolverker.com/cashu`

## Wallet Storage

Tokens stored in `~/.config/hex/cashu-wallet.json`.

## Token Format

Cashu tokens look like: `cashuBo2F0gaJhaUgA...`

## Fees

- Mint input fee: 100 ppk (1 sat per 10 proofs)
- Lightning fee reserve: ~1-2% (returned if unused)

## Dependencies

- `@cashu/cashu-ts` v3.x - Official Cashu TypeScript library
