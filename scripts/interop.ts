import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { encryptionKeys, open, publicBytes, seal, suite } from '../packages/crypto-adapter/crypto.ts';
import { hex, pack, random } from '../packages/protocol/codec.ts';
const file = 'artifacts/local/interop.json';
if (process.argv[2] === 'verify') {
  const v = JSON.parse(await readFile(file, 'utf8'));
  const response = JSON.parse(await readFile('artifacts/local/java-response.json', 'utf8'));
  const raw = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));
  const key = await suite.kem.deserializePrivateKey(raw(v.sk));
  const result = await open(key, ['ZV/interop', 1, 'synthetic-only'], raw(response.enc), raw(response.ct));
  if (hex(result) !== v.plaintext) throw new Error('Java -> TS mismatch');
  console.log('Java -> TypeScript HPKE passed (software keys only)');
} else {
  const pair = await encryptionKeys(), context = ['ZV/interop', 1, 'synthetic-only'], plaintext = random(32);
  const [enc, ct] = await seal(pair.publicKey, context, plaintext);
  await mkdir('artifacts/local', { recursive: true });
  await writeFile(file, JSON.stringify({ kind: 'SYNTHETIC SOFTWARE KEY ONLY',
    sk: hex(new Uint8Array(await suite.kem.serializePrivateKey(pair.privateKey))), pk: hex(await publicBytes(pair.publicKey)),
    context: hex(pack(context)), plaintext: hex(plaintext), enc: hex(enc), ct: hex(ct) }, null, 2));
}
