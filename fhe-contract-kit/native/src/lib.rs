use napi::bindgen_prelude::*;
use napi_derive::napi;

use bincode;
use tfhe::prelude::*;
use tfhe::{
    ClientKey, ServerKey, PublicKey, ConfigBuilder,
    FheBool, FheUint64, FheAsciiString, ClearString,
    CompressedServerKey, CompressedPublicKey,
    set_server_key,
};
// For deterministic, seeded key generation
use tfhe::core_crypto::seeders::{DeterministicSeeder, Seed};
use tfhe::core_crypto::commons::math::random::set_thread_local_seeder;

// --- helpers ---
fn ser<T: serde::Serialize>(v: &T) -> Result<Buffer> {
    let bytes = bincode::serialize(v).map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
    Ok(Buffer::from(bytes))
}
fn de<T: for<'a> serde::Deserialize<'a>>(buf: Buffer) -> Result<T> {
    bincode::deserialize(&buf)
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))
}

// ---------- Keys ----------

#[napi(object)]
pub struct KeypairFull {
  pub clientKey: Buffer,
  pub serverKey: Buffer,
  pub publicKey: Buffer,
}

/// Generate client/server keys and a classical PublicKey for third-party encryption.
#[napi]
pub fn keygen_full() -> Result<KeypairFull> {
    let config = ConfigBuilder::default().build();
    let (cks, sks) = tfhe::generate_keys(config);
    let pk = PublicKey::new(&cks);
    Ok(KeypairFull {
        clientKey: ser(&cks)?,
        serverKey: ser(&sks)?,
        publicKey: ser(&pk)?,
    })
}

/// Deterministic key generation using a caller-provided seed.
/// The seed is hashed/truncated into 16 bytes to fit the Seed(u128) type.
#[napi]
pub fn keygen_seeded(seed: Buffer) -> Result<KeypairFull> {
    // Collapse arbitrary-length seed into 16 bytes (little-endian) for Seed(u128)
    let mut acc = [0u8; 16];
    if seed.len() >= 16 {
        acc.copy_from_slice(&seed[0..16]);
    } else {
        for (i, b) in seed.iter().enumerate() { acc[i % 16] ^= *b; }
    }
    let seed_num = u128::from_le_bytes(acc);
    // Set a deterministic seeder for the current thread
    set_thread_local_seeder(Box::new(DeterministicSeeder::<u64>::new(Seed(seed_num))));
    // Generate keys deterministically
    let config = ConfigBuilder::default().build();
    let (cks, sks) = tfhe::generate_keys(config);
    let pk = PublicKey::new(&cks);
    Ok(KeypairFull {
        clientKey: ser(&cks)?,
        serverKey: ser(&sks)?,
        publicKey: ser(&pk)?,
    })
}

/// Compute and return a PublicKey from a ClientKey
#[napi]
pub fn gen_public_key(client_key: Buffer) -> Result<Buffer> {
    let cks: ClientKey = de(client_key)?;
    let pk = PublicKey::new(&cks);
    ser(&pk)
}

/// Provide the server key to the library so homomorphic ops can be run in-process.
#[napi]
pub fn set_server_key_bytes(server_key: Buffer) -> Result<()> {
    let sks: ServerKey = de(server_key)?;
    set_server_key(sks);
    Ok(())
}

// ---------- Compression helpers ----------

#[napi]
pub fn compress_server_key(server_key: Buffer) -> Result<Buffer> {
    let sk: ServerKey = de(server_key)?;
    let compressed = CompressedServerKey::from(sk);
    ser(&compressed)
}

#[napi]
pub fn decompress_server_key(compressed: Buffer) -> Result<Buffer> {
    let csk: CompressedServerKey = de(compressed)?;
    let sk = csk.decompress();
    ser(&sk)
}

#[napi]
pub fn compress_public_key(public_key: Buffer) -> Result<Buffer> {
    let pk: PublicKey = de(public_key)?;
    let cpk = CompressedPublicKey::from(pk);
    ser(&cpk)
}

#[napi]
pub fn decompress_public_key(compressed: Buffer) -> Result<Buffer> {
    let cpk: CompressedPublicKey = de(compressed)?;
    let pk = cpk.decompress();
    ser(&pk)
}

// ---------- Integer ops ----------

#[napi]
pub fn encrypt_u64(value: BigInt, client_key: Buffer) -> Result<Buffer> {
    let (v, _sign) = value.get_u64().ok_or_else(|| Error::new(Status::InvalidArg, "need u64"))?;
    let cks: ClientKey = de(client_key)?;
    let ct = FheUint64::try_encrypt(v, &cks)
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
    ser(&ct)
}

#[napi]
pub fn encrypt_u64_with_pk(value: BigInt, public_key: Buffer) -> Result<Buffer> {
    let (v, _sign) = value.get_u64().ok_or_else(|| Error::new(Status::InvalidArg, "need u64"))?;
    let pk: PublicKey = de(public_key)?;
    let ct = FheUint64::try_encrypt(v, &pk)
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
    ser(&ct)
}

#[napi]
pub fn decrypt_u64(ct_bytes: Buffer, client_key: Buffer) -> Result<BigInt> {
    let cks: ClientKey = de(client_key)?;
    let ct: FheUint64 = de(ct_bytes)?;
    let v: u64 = ct.decrypt(&cks);
    Ok(BigInt::from(u128::from(v)))
}

#[napi]
pub fn decrypt_bool(ct_bytes: Buffer, client_key: Buffer) -> Result<bool> {
    let cks: ClientKey = de(client_key)?;
    let ct: FheBool = de(ct_bytes)?;
    Ok(ct.decrypt(&cks))
}

#[napi]
pub fn gt_u64(a: Buffer, b: Buffer) -> Result<Buffer> {
    let aa: FheUint64 = de(a)?;
    let bb: FheUint64 = de(b)?;
    ser(&aa.gt(&bb))
}

#[napi]
pub fn lt_u64(a: Buffer, b: Buffer) -> Result<Buffer> {
    let aa: FheUint64 = de(a)?;
    let bb: FheUint64 = de(b)?;
    ser(&aa.lt(&bb))
}

#[napi]
pub fn eq_u64(a: Buffer, b: Buffer) -> Result<Buffer> {
    let aa: FheUint64 = de(a)?;
    let bb: FheUint64 = de(b)?;
    ser(&aa.eq(&bb))
}

/// Encrypted vs clear comparison: encA > clearB
#[napi]
pub fn gt_u64_clear(enc_a: Buffer, clear_b: BigInt) -> Result<Buffer> {
    let aa: FheUint64 = de(enc_a)?;
    let (v, _sign) = clear_b.get_u64().ok_or_else(|| Error::new(Status::InvalidArg, "need u64"))?;
    ser(&aa.gt(v))
}

#[napi]
pub fn select_u64(cond: Buffer, then_ct: Buffer, else_ct: Buffer) -> Result<Buffer> {
    let c: FheBool = de(cond)?;
    let t: FheUint64 = de(then_ct)?;
    let f: FheUint64 = de(else_ct)?;
    ser(&c.select(&t, &f))
}

#[napi]
pub fn max_u64(a: Buffer, b: Buffer) -> Result<Buffer> {
    let aa: FheUint64 = de(a)?;
    let bb: FheUint64 = de(b)?;
    let gt = aa.gt(&bb);
    ser(&gt.select(&aa, &bb))
}

#[napi]
pub fn min_u64(a: Buffer, b: Buffer) -> Result<Buffer> {
    let aa: FheUint64 = de(a)?;
    let bb: FheUint64 = de(b)?;
    let lt = aa.lt(&bb);
    ser(&lt.select(&aa, &bb))
}

// ---------- Boolean combinators ----------

#[napi]
pub fn and_bool(a: Buffer, b: Buffer) -> Result<Buffer> {
    let aa: FheBool = de(a)?;
    let bb: FheBool = de(b)?;
    ser(&(aa & bb))
}

#[napi]
pub fn or_bool(a: Buffer, b: Buffer) -> Result<Buffer> {
    let aa: FheBool = de(a)?;
    let bb: FheBool = de(b)?;
    ser(&(aa | bb))
}

#[napi]
pub fn not_bool(a: Buffer) -> Result<Buffer> {
    let aa: FheBool = de(a)?;
    ser(&(!aa))
}

// ---------- String ops (ASCII) ----------

#[napi]
pub fn encrypt_ascii(s: String, client_key: Buffer) -> Result<Buffer> {
    let cks: ClientKey = de(client_key)?;
    let ct = FheAsciiString::try_encrypt(&s, &cks)
        .map_err(|e| Error::new(Status::InvalidArg, e.to_string()))?;
    ser(&ct)
}

#[napi]
pub fn decrypt_ascii(ct_bytes: Buffer, client_key: Buffer) -> Result<String> {
    let cks: ClientKey = de(client_key)?;
    let ct: FheAsciiString = de(ct_bytes)?;
    Ok(ct.decrypt(&cks))
}

#[napi]
pub fn to_lowercase(ct_bytes: Buffer) -> Result<Buffer> {
    let ct: FheAsciiString = de(ct_bytes)?;
    ser(&ct.to_lowercase())
}

#[napi]
pub fn eq_strings(a: Buffer, b: Buffer) -> Result<Buffer> {
    let aa: FheAsciiString = de(a)?;
    let bb: FheAsciiString = de(b)?;
    ser(&aa.eq(&bb))
}
