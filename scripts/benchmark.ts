import { mkdir, writeFile } from 'node:fs/promises';
import { encryptionKeys, signingKeys } from '../packages/crypto-adapter/crypto.ts';
import { createRecord, readCredential, unwrapRecord, verifyRecord } from '../packages/protocol/record.ts';
import { request } from '../packages/protocol/authorization.ts';
import { frame } from '../packages/protocol/frames.ts';
import { random } from '../packages/protocol/codec.ts';
import { encryptDirectory, readDirectory, type DirectoryEntry } from '../packages/protocol/directory.ts';

const [phone, recovery, signer, ephemeral] = await Promise.all([
  encryptionKeys(), encryptionKeys(), signingKeys(), encryptionKeys(),
]);
const recipients = [{ id: 'phone', key: phone.publicKey }, { id: 'recovery', key: recovery.publicKey }];
const directoryKey = random(32), rows = [], sizes: number[] = [], requests: number[] = [];
const records: Uint8Array[] = [], directory: DirectoryEntry[] = [];
let recovered = 0, directoryBytes = 0, frameMax = 0;
const started = performance.now();
for (let i = 0; i < 1000; i++) {
  const id = crypto.randomUUID(), revision = crypto.randomUUID();
  const origin = `https://account-${i}.example.com`;
  const r = await createRecord('synthetic-vault', id, revision, [],
    [origin, `合成用户-${i}@example.com`, `synthetic-only-${i}-` + 'x'.repeat(i % 96)], recipients, signer.privateKey);
  records.push(r.wire); sizes.push(r.wire.length);
  const req = await request(r.wire, 'synthetic-desktop', 'session', signer.privateKey, ephemeral.publicKey);
  requests.push(req.length); frameMax = Math.max(frameMax, (await frame(req)).length);
  directory.push([id, revision, origin, `合成别名-${i}`]);
  const body = await verifyRecord(r.wire, signer.publicKey);
  const restored = await readCredential(body, await unwrapRecord(body, 'recovery', recovery.privateKey));
  if (restored[0] !== origin || restored[1] !== `合成用户-${i}@example.com`) throw new Error('Recovery mismatch');
  recovered++;
  if ([50, 100, 500, 1000].includes(i + 1)) {
    // Independently encrypted shards keep each object within the protocol parser limit.
    directoryBytes = 0;
    for (let offset = 0; offset < directory.length; offset += 100) {
      const entries = directory.slice(offset, offset + 100);
      const wire = await encryptDirectory('synthetic-vault', `shard-${offset}`, directoryKey, entries);
      const restoredDirectory = await readDirectory(wire, directoryKey, 'synthetic-vault');
      if (JSON.stringify(restoredDirectory) !== JSON.stringify(entries)) throw new Error('Directory recovery mismatch');
      directoryBytes += wire.length;
    }
    rows.push({ records: i + 1, recordBytes: sizes.reduce((a, b) => a + b, 0), directoryBytes,
      requestMaxBytes: Math.max(...requests), qrFramesMax: frameMax,
      recovered, elapsedMs: Math.round(performance.now() - started) });
  }
}
await mkdir('artifacts', { recursive: true });
const result = { environment: { node: process.version, platform: process.platform },
  kind: 'software-only synthetic benchmark; excludes HTTP, QR optics, hardware and complete backup format', rows };
await writeFile('artifacts/p1-benchmark.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
