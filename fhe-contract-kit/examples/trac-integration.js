/**
 * Minimal integration with https://github.com/Trac-Systems/trac-contract-example
 *
 * Pattern:
 *  - during contract bootstrap: generate keys off-chain; publish serverKey/publicKey to state
 *  - during contract execution (validator nodes): call `setServerKey(state.serverKey)` once
 *  - accept ciphertext payloads from participants and run compare/select ops
 *  - return encrypted decision/value; only the key owner(s) can decrypt
 */

const fhe = require('..');

// Simulated 'state' fields in a Trac contract
const state = {
  serverKey: null, // Buffer (or base64 string if persisted)
  publicKey: null,
};

function bootstrapContract() {
  // Off-chain owner call
  const { clientKey, serverKey, publicKey } = fhe.keygen();
  // persist serverKey/publicKey in contract state (use base64 if your state is JSON)
  state.serverKey = serverKey;
  state.publicKey = publicKey;
  return { clientKey }; // keep private
}

// Example "contract method" to compare two submitted ciphertexts
function op_compare_enc_enc(encA, encB) {
  fhe.setServerKey(state.serverKey);
  const isAGtB = fhe.gtU64(encA, encB);
  const maxAB  = fhe.selectU64(isAGtB, encA, encB);
  return { isAGtB, maxAB };
}

// Example "contract method" for Enc vs Clear
function op_compare_enc_clear(encA, clearB) {
  fhe.setServerKey(state.serverKey);
  return { gt: fhe.gtU64Clear(encA, BigInt(clearB)) };
}

module.exports = {
  bootstrapContract,
  op_compare_enc_enc,
  op_compare_enc_clear
};
