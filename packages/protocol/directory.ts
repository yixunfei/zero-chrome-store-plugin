import { binary, equal, hash, pack, tuple, unpack, type Value } from './codec.ts';
import { decrypt, encrypt, open, seal, sign, verify } from '../crypto-adapter/crypto.ts';

export type DirectoryEntry = [string, string, string, string];
export async function encryptDirectory(vault: string, revision: string, key: Uint8Array, entries: DirectoryEntry[]) {
  const context: Value[] = ['ZV/directory', 1, vault, revision];
  const [nonce, ct] = await encrypt(key, context, pack(entries));
  return pack([...context, nonce, ct]);
}

export async function readDirectory(wire: Uint8Array, key: Uint8Array, vault: string) {
  const body = tuple(unpack(wire), 'ZV/directory', 6);
  if (body[2] !== vault) throw new Error('Wrong vault');
  return unpack(await decrypt(key, body.slice(0, 4), binary(body[4], 12), binary(body[5])));
}

export async function grantDirectory(pairingTranscript: Uint8Array, key: Uint8Array,
  recipient: CryptoKey, phone: CryptoKey) {
  const context: Value[] = ['ZV/directory-grant', 1, await hash(pairingTranscript)];
  const [enc, ct] = await seal(recipient, context, key);
  const body: Value[] = [...context, enc, ct];
  return pack(['ZV/signed-grant', 1, body, await sign(phone, 'ZV/grant-signature', body)]);
}

export async function receiveDirectoryGrant(wire: Uint8Array, transcript: Uint8Array,
  recipient: CryptoKey, phone: CryptoKey) {
  const signed = tuple(unpack(wire), 'ZV/signed-grant', 4);
  const body = tuple(signed[2], 'ZV/directory-grant', 5);
  await verify(phone, 'ZV/grant-signature', body, binary(signed[3], 64));
  if (!equal(binary(body[2], 32), await hash(transcript))) throw new Error('Pairing mismatch');
  return open(recipient, body.slice(0, 3), binary(body[3], 65), binary(body[4], 48));
}
