const path = require('node:path');
const fhe = require('..'); // after build, requiring package root works

function log(...args) { console.log('[demo]', ...args); }

(async () => {
  // Generate keys (Alice off-chain)
  const { clientKey, serverKey, publicKey } = fhe.keygen();

  // Optionally compress keys for storage/broadcast
  const csk  = fhe.compressServerKey(serverKey);
  const cpk  = fhe.compressPublicKey(publicKey);
  const sk2  = fhe.decompressServerKey(csk);
  const pk2  = fhe.decompressPublicKey(cpk);

  // Publish server & public keys with the contract; keep clientKey private.
  fhe.setServerKey(sk2);

  // Encrypt inputs (Alice & Bob)
  const encA = fhe.encryptU64WithPublicKey(125_000n, pk2);
  const encB = fhe.encryptU64WithPublicKey(132_500n, pk2);

  // Compare on compute nodes
  const isBGtA = fhe.gtU64(encB, encA);
  const higher  = fhe.maxU64(encA, encB);

  // Decrypt results (Alice)
  log('Bob > Alice?', fhe.decryptBool(isBGtA, clientKey));
  log('Higher salary:', fhe.decryptU64(higher, clientKey).toString());

  // Fallback: encrypted vs clear
  const above130k = fhe.gtU64Clear(encB, 130_000n);
  log('Bob >= 130k?', fhe.decryptBool(above130k, clientKey));

  // Strings example
  const s1 = fhe.encryptAscii('Hello', clientKey);
  const s2 = fhe.toLowercase(s1);
  const s3 = fhe.encryptAscii('hello', clientKey);
  const eq = fhe.eqStrings(s2, s3);
  log('eqStrings?', fhe.decryptBool(eq, clientKey));
})().catch(e => { console.error(e); process.exit(1); });
