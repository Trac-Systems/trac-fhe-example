# fhe-contract-kit

**Fully Homomorphic Encryption (TFHE-rs) comparisons for Node.js contracts**

This package exposes a small, stable API to perform comparisons and selections on **encrypted integers and strings** from Node.js. It uses a tiny **Rust N‑API addon** built over **TFHE‑rs**. The addon is compiled locally (Rust toolchain required).

> Designed to plug into Trac/Holepunch contracts (see `/examples/trac-integration.js`).

## Features

- `keygen()` → `{ clientKey, serverKey, publicKey }`
- `keygenFromSeed(seed)` → deterministic keys from caller-provided seed (e.g., HKDF(ed25519 sk))
- Public **server key** (evaluation key) suitable for publishing with your contract state
- Anyone can encrypt with `publicKey` (`encryptU64WithPublicKey`)
- Encrypted comparisons: `gtU64`, `ltU64`, `eqU64`
- Encrypted select/branch: `selectU64(cond, then, else)`
- Encrypted min/max: `minU64`, `maxU64`
- Mixed enc↔clear compare: `gtU64Clear(enc, clear)`
- ASCII strings: `encryptAscii`, `toLowercase`, `eqStrings`
- Compress/Decompress server/public keys to reduce state size

## Install

```bash
# 1) Install Rust (https://rustup.rs) and Node 18+
# 2) Add this package to your project
# (if using the zip, run `npm i ./fhe-contract-kit-0.1.0.tgz` after packing; see below)

npm i            # compiles the native addon (install script)
```

## API (CommonJS)

```js
const fhe = require('fhe-contract-kit');

// keygen by the data owner (off-chain)
const { clientKey, serverKey, publicKey } = fhe.keygen();

// publish serverKey & publicKey with the contract state
// keep clientKey private

// enable compute on validator/contract engines
fhe.setServerKey(serverKey);

// encrypt values to the contract public key (Alice & Bob)
const encA = fhe.encryptU64WithPublicKey(125_000n, publicKey);
const encB = fhe.encryptU64WithPublicKey(132_500n, publicKey);

// compare and choose without revealing
const isBGtA = fhe.gtU64(encB, encA);         // -> encrypted bool
const higher  = fhe.maxU64(encA, encB);       // -> encrypted u64

// result decryption (by clientKey holder)
const bGreater = fhe.decryptBool(isBGtA, clientKey);
const higherClear = fhe.decryptU64(higher, clientKey); // BigInt
console.log({ bGreater, higher: higherClear.toString() });

// fallback: encrypted vs clear
const above130k = fhe.gtU64Clear(encB, 130_000n);
console.log('Bob>=130k?', fhe.decryptBool(above130k, clientKey));
```

### Deterministic keygen from wallet key

```js
const { hkdfSync } = require('node:crypto');
const fhe = require('fhe-contract-kit');

// ikm = your ed25519 private key bytes
const seed = hkdfSync('sha256', ikm, Buffer.from('trac-fhe-v1'), Buffer.from('fhe-seed'), 32);
const { clientKey, serverKey, publicKey } = fhe.keygenFromSeed(seed);
```

## Trac contract integration

See `/examples/trac-integration.js` for a minimal example targeting
[trac-contract-example](https://github.com/Trac-Systems/trac-contract-example).

## Build notes

- The native addon is compiled with **napi-rs**. On `npm run build`, we invoke Cargo and copy the produced `.node` artifact into `dist/` where it is loaded by `index.js`.
- If your environment lacks Rust, install from https://rustup.rs (few minutes).

## License

BSD-3-Clause-Clear (same as TFHE‑rs).
