const fs = require('node:fs');
const path = require('node:path');

function loadNative() {
  const candidate = path.join(__dirname, 'dist', 'fhe_node.node');
  if (fs.existsSync(candidate)) return require(candidate);
  const alt = path.join(__dirname, 'native', 'target', 'release', 'fhe_node.node');
  if (fs.existsSync(alt)) return require(alt);
  throw new Error('Native module not built. Run `npm run build` to compile the Rust addon.');
}

const native = loadNative();

// Small ergonomic wrapper with base64 helpers if you persist keys in JSON
const enc = {
  toB64: (buf) => Buffer.from(buf).toString('base64'),
  fromB64: (b64) => Buffer.from(b64, 'base64'),
};

module.exports = {
  // optional deterministic keygen using a seed (derived from wallet key, etc.)
  keygenFromSeed: (seed) => {
    const buf = Buffer.isBuffer(seed) ? seed : Buffer.from(String(seed || ''), 'utf8');
    if (typeof native.keygen_seeded === 'function') {
      return native.keygen_seeded(buf);
    }
    // Fallback: non-deterministic
    if (process && process.env && !process.env.CI) {
      try { console.warn('[fhe-contract-kit] keygenFromSeed not available in native addon; falling back to keygen()'); } catch {}
    }
    return native.keygen_full();
  },
  // raw buffers API (preferred inside engines)
  keygen: () => {
    const k = native.keygen_full(); // returns { clientKey, serverKey, publicKey }
    return k;
  },
  setServerKey: (serverKey) => native.set_server_key_bytes(serverKey),
  genPublicKey: (clientKey) => native.gen_public_key(clientKey),

  // integer ops
  encryptU64: (v, clientKey) => native.encrypt_u64(BigInt(v), clientKey),
  encryptU64WithPublicKey: (v, publicKey) => native.encrypt_u64_with_pk(BigInt(v), publicKey),
  decryptU64: (ct, clientKey) => native.decrypt_u64(ct, clientKey),

  gtU64: (a, b) => native.gt_u64(a, b),
  ltU64: (a, b) => native.lt_u64(a, b),
  eqU64: (a, b) => native.eq_u64(a, b),
  gtU64Clear: (encA, clearB) => native.gt_u64_clear(encA, BigInt(clearB)),
  selectU64: (cond, thenCt, elseCt) => native.select_u64(cond, thenCt, elseCt),
  maxU64: (a, b) => native.max_u64(a, b),
  minU64: (a, b) => native.min_u64(a, b),
  decryptBool: (ct, clientKey) => native.decrypt_bool(ct, clientKey),

  // strings
  encryptAscii: (s, clientKey) => native.encrypt_ascii(String(s), clientKey),
  decryptAscii: (ct, clientKey) => native.decrypt_ascii(ct, clientKey),
  toLowercase: (ct) => native.to_lowercase(ct),
  eqStrings: (a, b) => native.eq_strings(a, b),

  // boolean combinators
  and: (a,b) => native.and_bool(a,b),
  or: (a,b) => native.or_bool(a,b),
  not: (a) => native.not_bool(a),

  // compression (optional, for state size)
  compressServerKey: (serverKey) => native.compress_server_key(serverKey),
  decompressServerKey: (compressed) => native.decompress_server_key(compressed),
  compressPublicKey: (publicKey) => native.compress_public_key(publicKey),
  decompressPublicKey: (compressed) => native.decompress_public_key(compressed),

  // helpful base64 helpers for JSON state
  b64: enc
};
