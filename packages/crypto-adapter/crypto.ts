import { Aes256Gcm, CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from '@hpke/core';
import { bytes, pack, random, type Value } from '../protocol/codec.ts';

export const suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(), kdf: new HkdfSha256(), aead: new Aes256Gcm(),
});
export const SUITE = 'HPKE-0010-0001-0002';
export const encryptionKeys = () => suite.kem.generateKeyPair();
export const publicBytes = async (key: CryptoKey) => bytes(await suite.kem.serializePublicKey(key));
export const importPublic = (raw: Uint8Array) => suite.kem.deserializePublicKey(raw);
export const signingKeys = () => crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);

export async function sign(key: CryptoKey, domain: string, value: Value): Promise<Uint8Array> {
  return bytes(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, pack([domain, value])));
}

export async function verify(key: CryptoKey, domain: string, value: Value, sig: Uint8Array) {
  if (sig.length !== 64 || !await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key, sig, pack([domain, value])))
    throw new Error('Signature rejected');
}

export async function seal(publicKey: CryptoKey, context: Value, plaintext: Uint8Array) {
  const sender = await suite.createSenderContext({ recipientPublicKey: publicKey, info: pack(context) });
  return [bytes(sender.enc), bytes(await sender.seal(plaintext, pack(context)))] as const;
}

export async function open(privateKey: CryptoKey, context: Value, enc: Uint8Array, ct: Uint8Array) {
  const receiver = await suite.createRecipientContext({ recipientKey: privateKey, enc, info: pack(context) });
  return bytes(await receiver.open(ct, pack(context)));
}

export async function encrypt(key: Uint8Array, context: Value, plaintext: Uint8Array) {
  const nonce = random(12);
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: pack(context), tagLength: 128 }, k, plaintext);
  return [nonce, bytes(ciphertext)] as const;
}

export async function decrypt(key: Uint8Array, context: Value, nonce: Uint8Array, ct: Uint8Array) {
  if (key.length !== 32 || nonce.length !== 12 || ct.length < 16) throw new Error('AEAD shape');
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
  return bytes(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: pack(context), tagLength: 128 }, k, ct));
}
