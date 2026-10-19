import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { random } from '../packages/protocol/codec.ts';
import { webDavTestConfig } from './support/webdav-test-config.ts';

const { root, store, authorization } = webDavTestConfig();
const id = 'probe-' + crypto.randomUUID(), data = random(800), statuses: Record<string, unknown> = {};
await store.putIfAbsent(id, data);
assert.deepEqual(await store.get(id), data);
await store.putIfAbsent(id, data);
statuses.putGetIdempotent = true;
await assert.rejects(store.putIfAbsent(id, random(800)), /collision/);
statuses.immutableCollisionRejected = true;
const propfind = await fetch(root, { method: 'PROPFIND', headers: { Authorization: authorization, Depth: '1' }, redirect: 'error' });
assert.equal(propfind.status, 207);
assert.ok((await propfind.text()).includes(id));
statuses.propfind = 207;
const head = await store.request(id, 'HEAD');
const etag = head.headers.get('etag');
assert.ok(etag); statuses.etagAvailable = true;
const stale = await store.request(id, 'PUT', { 'If-Match': '"wrong-etag"' }, data);
assert.equal(stale.status, 412); statuses.staleEtagRejected = 412;
const unauthorized = await fetch(new URL(id, root));
assert.equal(unauthorized.status, 401); statuses.unauthorizedRejected = 401;
const concurrent = await Promise.allSettled([
  store.putIfAbsent(id + '-race', random(100)), store.putIfAbsent(id + '-race', random(100)),
]);
statuses.concurrentCreateSuccesses = concurrent.filter(x => x.status === 'fulfilled').length;
statuses.concurrentCreateOneWinner = statuses.concurrentCreateSuccesses === 1;
statuses.atomicConditionalCreateSuitable = statuses.concurrentCreateOneWinner;
await assert.rejects(store.get('redirect'));
statuses.redirectRejected = true;
const deleted = await store.request(id, 'DELETE');
assert.equal(deleted.status, 204); assert.equal(await store.get(id), undefined);
statuses.deleteReadMissing = true;
await store.request(id + '-race', 'DELETE');
await writeFile('artifacts/p1-webdav.json', JSON.stringify({ server: 'Apache httpd 2.4.65, HTTPS, Windows Node client', statuses }, null, 2));
console.log(JSON.stringify(statuses, null, 2));
