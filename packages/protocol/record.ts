import { binary, hash, pack, random, tuple, unpack, type Value } from './codec.ts';
import { SUITE, decrypt, encrypt, open, seal, sign, verify } from '../crypto-adapter/crypto.ts';

export type Recipient = { id: string; key: CryptoKey };
export type Credential = [string, string, string];
export type RecordBody = Value[];

export function credential(v: Value): Credential {
  if (!Array.isArray(v) || v.length !== 3 || v.some(x => typeof x !== 'string'))
    throw new Error('Credential shape');
  const [origin, username, password] = v as Credential;
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('Canonical HTTPS origin required');
  return [origin, username, password];
}

export async function createRecord(vault: string, id: string, revision: string, parents: string[],
  payload: Credential, recipients: Recipient[], author: CryptoKey) {
  credential(payload);
  if (recipients.length !== 2 || recipients[0].id === recipients[1].id) throw new Error('Two distinct recipients');
  const context: Value[] = ['ZV/record', 1, vault, id, revision, parents, SUITE];
  const key = random(32);
  const [nonce, ciphertext] = await encrypt(key, context, pack(payload));
  const digest = await hash(pack([context, nonce, ciphertext]));
  const envelopes = await Promise.all(recipients.map(async r => {
    const [enc, ct] = await seal(r.key, ['ZV/record-key', 1, context, digest, r.id], key);
    return [r.id, enc, ct];
  }));
  const body: Value[] = [...context, nonce, ciphertext, envelopes];
  return { wire: pack(['ZV/signed-record', 1, body, await sign(author, 'ZV/author', body)]), key };
}

export async function verifyRecord(wire: Uint8Array, author: CryptoKey): Promise<RecordBody> {
  const signed = tuple(unpack(wire), 'ZV/signed-record', 4);
  const body = tuple(signed[2], 'ZV/record', 10);
  if (body[6] !== SUITE || [body[2], body[3], body[4]].some(x => typeof x !== 'string') ||
    !Array.isArray(body[5]) || body[5].some(x => typeof x !== 'string')) throw new Error('Record header');
  binary(body[7], 12); binary(body[8]);
  if (!Array.isArray(body[9]) || body[9].length !== 2) throw new Error('Recipient count');
  const ids = new Set();
  for (const env of body[9]) {
    if (!Array.isArray(env) || env.length !== 3 || typeof env[0] !== 'string' || ids.has(env[0]))
      throw new Error('Recipient shape');
    ids.add(env[0]); binary(env[1], 65); binary(env[2], 48);
  }
  await verify(author, 'ZV/author', body, binary(signed[3], 64));
  return body;
}

export async function unwrapRecord(body: RecordBody, recipient: string, key: CryptoKey) {
  const envelopes = body[9] as Value[][];
  const env = envelopes.find(e => e[0] === recipient);
  if (!env) throw new Error('Missing recipient');
  const context = body.slice(0, 7);
  const digest = await hash(pack([context, body[7], body[8]]));
  return open(key, ['ZV/record-key', 1, context, digest, recipient], binary(env[1]), binary(env[2]));
}

export async function readCredential(body: RecordBody, key: Uint8Array): Promise<Credential> {
  return credential(unpack(await decrypt(key, body.slice(0, 7), binary(body[7]), binary(body[8]))));
}
