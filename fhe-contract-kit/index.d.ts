/// <reference types="node" />

export interface KeypairFull {
  clientKey: Buffer;
  serverKey: Buffer;
  publicKey: Buffer;
}

/** Optional deterministic keygen using a caller-provided seed (e.g., HKDF(ed25519 sk)). */
export function keygenFromSeed(seed: Buffer | string): KeypairFull;

export function keygen(): KeypairFull;
export function setServerKey(serverKey: Buffer): void;
export function genPublicKey(clientKey: Buffer): Buffer;

// integers
export function encryptU64(v: bigint | number, clientKey: Buffer): Buffer;
export function encryptU64WithPublicKey(v: bigint | number, publicKey: Buffer): Buffer;
export function decryptU64(ct: Buffer, clientKey: Buffer): bigint;

export function gtU64(a: Buffer, b: Buffer): Buffer; // EncBool
export function ltU64(a: Buffer, b: Buffer): Buffer; // EncBool
export function eqU64(a: Buffer, b: Buffer): Buffer; // EncBool
export function gtU64Clear(encA: Buffer, clearB: bigint | number): Buffer; // EncBool
export function selectU64(cond: Buffer, thenCt: Buffer, elseCt: Buffer): Buffer;
export function maxU64(a: Buffer, b: Buffer): Buffer;
export function minU64(a: Buffer, b: Buffer): Buffer;
export function decryptBool(ct: Buffer, clientKey: Buffer): boolean;

// strings
export function encryptAscii(s: string, clientKey: Buffer): Buffer;
export function decryptAscii(ct: Buffer, clientKey: Buffer): string;
export function toLowercase(ct: Buffer): Buffer;
export function eqStrings(a: Buffer, b: Buffer): Buffer; // EncBool

// compression
export function compressServerKey(serverKey: Buffer): Buffer;
export function decompressServerKey(compressed: Buffer): Buffer;
export function compressPublicKey(publicKey: Buffer): Buffer;
export function decompressPublicKey(compressed: Buffer): Buffer;

export const b64: {
  toB64(buf: Buffer): string;
  fromB64(b64: string): Buffer;
};
