import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { encryptionKeys, signingKeys } from '../packages/crypto-adapter/crypto.ts';
import { createRecord, readCredential, unwrapRecord, verifyRecord } from '../packages/protocol/record.ts';
import { createCommit, publish, validateCommit, type Operation } from '../packages/sync/commit.ts';
import { webDavTestConfig } from './support/webdav-test-config.ts';

const { store } = webDavTestConfig();
const [phone, recovery, author] = await Promise.all([encryptionKeys(), encryptionKeys(), signingKeys()]);
const recipients = [{ id: 'phone', key: phone.publicKey }, { id: 'recovery', key: recovery.publicKey }];
const started = performance.now(), batches = [], ids: string[] = [];
let bodyBytes = 0, commitBytes = 0, parent: string[] = [], restored = 0;
for (let batch = 0; batch < 20; batch++) {
  const objects = new Map<string, Uint8Array>(), operations: Operation[] = [];
  for (let offset = 0; offset < 50; offset++) {
    const i = batch * 50 + offset, id = crypto.randomUUID(), revision = crypto.randomUUID();
    const record = await createRecord('p1-scale-vault', id, revision, [],
      [`https://account-${i}.example.com`, `合成账号-${i}`, `SYNTHETIC-ONLY-${i}-` + 'x'.repeat(i % 96)], recipients, author.privateKey);
    objects.set(id, record.wire); bodyBytes += record.wire.length; ids.push(id);
    operations.push({ record: id, revision, parents: [], deleted: false, object: id });
  }
  const commit = await createCommit('p1-scale-vault', parent, operations, objects, author.privateKey);
  commitBytes += commit.length;
  const commitId = await publish(store, objects, commit, author.publicKey);
  ids.push(commitId); parent = [commitId];
  const downloaded = await store.get(commitId);
  assert.ok(downloaded);
  await validateCommit(store, downloaded, 'p1-scale-vault', author.publicKey);
  for (const [id] of objects) {
    const wire = await store.get(id); assert.ok(wire);
    const body = await verifyRecord(wire, author.publicKey);
    const payload = await readCredential(body, await unwrapRecord(body, 'recovery', recovery.privateKey));
    assert.ok(payload[2].startsWith('SYNTHETIC-ONLY-')); restored++;
  }
  batches.push({ records: restored, elapsedMs: Math.round(performance.now() - started) });
  if (restored % 250 === 0) console.log(`WebDAV uploaded, read back and recovered: ${restored}/1000`);
}
const result = { records: restored, commits: 20, objectBytes: bodyBytes, commitBytes,
  httpRequestsCalculated: restored * 4 + batches.length * 2, batches,
  limits: 'Fresh unique object IDs; does not rely on atomic create. Record-only recovery; full backup and directory migration remain open.' };
await writeFile('artifacts/p1-webdav-scale.json', JSON.stringify(result, null, 2));
await writeFile('artifacts/local/webdav-synthetic-object-ids.json', JSON.stringify(ids));
console.log(JSON.stringify(result, null, 2));
