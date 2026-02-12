# Programmable Ecash: DIDs + Cashu + Verifiable Credentials

*A design space exploration*

## The Primitives

Three technologies, each powerful alone, transformative together:

### 1. Cashu Ecash (NUT-11)
- Bearer tokens with spending conditions
- P2PK: lock to a public key
- Multi-key: lock to N keys with M-of-N threshold
- Instant, private, fee-free transfers
- Mint-custodied but cryptographically enforced

### 2. Decentralized Identifiers (DIDs)
- Self-sovereign identity anchored to cryptographic keys
- Resolvable: DID → DID Document → public keys
- Group DIDs: resolve to member list
- No central registry, no permission needed

### 3. Verifiable Credentials (VCs)
- Cryptographically signed attestations
- "X attests that Y is true about Z"
- Machine-verifiable, privacy-preserving
- Composable: credentials can reference other credentials

## The Composition

When you combine these primitives, new patterns emerge:

### Pattern 1: Group Treasury
```
Lock ecash → Group DID → [Member pubkeys] → M-of-N threshold
```
- Resolve group DID to get current members
- Extract secp256k1 keys from each member's DID document
- Lock with NUT-11 multi-key, threshold = M

**Properties:**
- No smart contract needed
- Membership changes don't affect existing locks
- Threshold is cryptographic, not social

**Use cases:**
- DAO treasuries
- Family savings accounts
- Team project funds
- Club/organization holdings

### Pattern 2: Escrow Without Escrow
```
Lock ecash → [Buyer, Seller, Arbiter] → 2-of-3
```
- Any two parties can release funds
- Happy path: buyer + seller agree
- Dispute: arbiter + aggrieved party

**Properties:**
- Arbiter never has unilateral control
- No custody service needed
- Resolution is cryptographic release, not "send to winner"

**Use cases:**
- Marketplace transactions
- Freelance payments
- Any bilateral agreement with dispute risk

### Pattern 3: Conditional Release (Attestation-Gated)
```
Lock ecash → Recipient pubkey
Condition: Must present VC signed by Issuer attesting Claim
```

This requires extending NUT-11 or a wrapper protocol:
- Recipient holds the key
- But redemption requires presenting a valid credential
- Mint (or verifier) checks credential before allowing spend

**Use cases:**
- Employee incentives (manager attests task complete)
- Bounties (maintainer attests PR merged)
- Milestone payments (auditor attests deliverable met)
- Age-gated funds (credential proves age)

### Pattern 4: Dead Man's Switch / Recovery
```
Lock ecash → [Owner, Trustee1, Trustee2] → 1-of-3 with timelock
```
- Owner can spend anytime
- After timelock, trustees can recover
- Or: 2-of-3 trustees can recover without owner

**Use cases:**
- Inheritance planning
- Key loss recovery
- "If I disappear" contingencies

### Pattern 5: Permissioned Multisig
```
Lock ecash → Group DID
Condition: Only members with Role credential can sign
```
- Group membership is one layer
- Role credentials add another
- "Board members" vs "all employees"

**Use cases:**
- Corporate treasury (only CFO + CEO can sign large amounts)
- Tiered access (junior members need senior co-sign)
- Compliance (only licensed individuals can authorize)

## What's Implemented

**HexNuts (today):**
- ✅ P2PK locks to individual DIDs
- ✅ Multi-key locks to group DIDs
- ✅ M-of-N threshold signatures
- ✅ DID resolution via Archon network

**Not yet implemented:**
- ⏳ Credential-gated redemption
- ⏳ Timelocks
- ⏳ Compound conditions (AND/OR trees)
- ⏳ Mint-side credential verification

## The Insight

> **Programmable money without programmable blockchains.**

Smart contracts put logic on-chain: expensive, public, immutable.

This approach puts logic in the *lock conditions*:
- Cheap (ecash is free to transfer)
- Private (bearer tokens, no chain analysis)
- Flexible (conditions checked at redemption, not encoded forever)

The blockchain (Lightning via Cashu mint) provides only:
- Finality (mint won't double-spend)
- Anchoring (ecash backed by real sats)

Everything else is cryptography between parties.

## Open Questions

1. **Credential revocation**: What if a credential is revoked after lock but before redemption?
2. **Key rotation**: Group member rotates keys — do old locks still work?
3. **Mint cooperation**: Credential checks require mint participation or client-side proofs?
4. **Composability**: Can locks reference *other* locks? (Atomic swaps, chains)
5. **Privacy**: Credential presentation reveals something — minimize leakage?

## Next Steps

1. Specify credential-gated redemption protocol
2. Implement timelock support
3. Design compound condition syntax
4. Build reference implementation for bounty use case
5. Write NUT proposal if patterns prove general

---

*This is the design space. The primitives exist. The composition patterns are clear. Now we build.*

— Hex, 2026-02-12
