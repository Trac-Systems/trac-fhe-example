# Goal: FHE comparisons inside Trac/Holepunch smart contracts

**Package:** `fhe-contract-kit` (this repo)  
**Audience:** Codex / contributors integrating FHE into contracts based on
[`Trac-Systems/trac-contract-example`](https://github.com/Trac-Systems/trac-contract-example).

---

## Mission

Enable contract engines (validator peers) to **compare encrypted values** and make **data‑oblivious selections** without learning the plaintexts.

- Primary: compare **two encrypted integers** (e.g., `EncA > EncB`) and return an **encrypted boolean** and/or an **encrypted max/min**.
- Secondary (fallback): compare **encrypted vs clear** (e.g., `EncA > 700`).
- Optional: equality on ASCII strings (e.g., case‑insensitive match by lowercasing both and comparing).

Server (evaluation) key must be **public** to run on untrusted contract nodes. Decryption remains with the key owner(s).

---

## What we ship

- A small **Node.js package** with a Rust N‑API addon built over **TFHE‑rs**:
  - Key mgmt: `keygen()` → `{ clientKey, serverKey, publicKey }`
  - Deterministic key mgmt: `keygen_seeded(seed)` (native) and `keygenFromSeed(seed)` (JS)
  - Compute: `gtU64`, `ltU64`, `eqU64`, `selectU64`, `minU64`, `maxU64`
  - Mixed operands: `gtU64Clear(enc, clear)`
  - Strings: `encryptAscii`, `toLowercase`, `eqStrings`
  - Key compression helpers for publishing/storing in contract state

- Examples:
  - `/examples/demo.js`: end‑to‑end demonstration
  - `/examples/trac-integration.js`: how to wire into the Trac contract example

---

## How to use in a Trac contract

1. **Bootstrap (off‑chain / admin step)**
   ```js
   const fhe = require('fhe-contract-kit');
   // Option A: standard keygen
   const { clientKey, serverKey, publicKey } = fhe.keygen();
   // Option B: deterministic keygen from wallet-derived seed
   // const { clientKey, serverKey, publicKey } = fhe.keygenFromSeed(seed);
   // Publish serverKey + publicKey with the contract (state); keep clientKey secret
   ```

2. **Contract execution (validator peers)**
   ```js
   fhe.setServerKey(state.serverKey);
   const isAGtB = fhe.gtU64(encA, encB);      // encrypted boolean
   const maxAB  = fhe.selectU64(isAGtB, encA, encB); // encrypted selection
   return { isAGtB, maxAB };                  // return ciphertexts
   ```

3. **Participants**
   - Encrypt to the **publicKey** and submit ciphertexts with their transactions:
     ```js
     const enc = fhe.encryptU64WithPublicKey(132_500n, state.publicKey);
     ```
   - Whoever holds `clientKey` can decrypt returned results.

> See `contract/protocol.js` and `contract/contract.js` in the Trac example repo to place these calls. In App3/peer contexts, keep the contract methods **pure/deterministic** (no time‑based randomness beyond TFHE internals).

---

## Design constraints & notes

- **Same key set:** All ciphertexts compared together must be encrypted to the same key set (same public key). Cross‑key comparisons require multiparty/threshold FHE (out of scope here).
- **Determinism:** Given the same inputs and `serverKey`, all nodes compute identical outputs.
- **ServerKey is public:** Contract nodes need it to evaluate bootstraps. Publish in state (consider compressed form).
- **Performance:** Each comparison/selection incurs a bootstrapping; keep circuits shallow and batch calls if possible.
- **Security:** Never publish `clientKey`. If storing keys at rest, wrap with your platform’s KMS/HSM or application‑level key wrap.

---

## Acceptance criteria

- Buildable on Node 18+ with a Rust toolchain via `npm run build`.
- `examples/demo.js` runs and prints a correct comparison and max.
- `examples/trac-integration.js` exports pure functions usable from a Trac contract.
- Keys and ciphertexts are binary **Buffers**; helpers expose base64 for JSON state.

---

## References (for Codex reviewers)

- **TFHE‑rs Server key is public** and set with `set_server_key`.  
- **Public‑key encryption** so anyone can encrypt to the contract key.  
- **String operations** (`FheAsciiString` equality/case ops).  
- **Compression** APIs for keys/ciphertexts.

All docs are in TFHE‑rs official site and API (see project README for links).
