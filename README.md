# HexNuts 🥜

A lightweight Cashu ecash wallet for AI agents.

Built on [@cashu/cashu-ts](https://github.com/cashubtc/cashu-ts).

## Install

```bash
git clone https://github.com/hexdaemon/hexnuts.git
cd hexnuts
npm install
```

## Usage

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

## Configuration

- **Default mint:** `https://bolverker.com/cashu`
- **Wallet storage:** `~/.config/hex/cashu-wallet.json`

Edit `scripts/wallet-store.js` to change defaults.

## Features

- Mint tokens via Lightning
- Melt tokens to pay invoices
- Send/receive portable ecash tokens
- Multi-mint support
- Token inspection

## License

MIT
