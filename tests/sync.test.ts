import test from 'node:test';
import assert from 'node:assert/strict';
import { signingKeys } from '../packages/crypto-adapter/crypto.ts';
import { createCommit, publish, revisionHeads, validateCommit, type ObjectStore, type Operation } from '../packages/sync/commit.ts';
import { equal, random } from '../packages/protocol/codec.ts';

class FaultStore implements ObjectStore {
  readonly data = new Map<string, Uint8Array>();
  failAfter = Infinity;
  async get(id: string) { return this.data.get(id); }
  async putIfAbsent(id: string, value: Uint8Array) {
    if (this.failAfter-- <= 0) throw new Error('Injected network interruption');
    const old = this.data.get(id);
    if (old && !equal(old, value)) throw new Error('Immutable collision');
    this.data.set(id, value.slice());
  }
}

test('partial uploads never publish a complete snapshot; retry, missing/corrupt backup and wrong vault', async () => {
  const key = await signingKeys(), store = new FaultStore();
  const objects = new Map([['a', random(100)], ['b', random(200)]]);
  const opA: Operation = { record: 'A', revision: 'v1', parents: [], deleted: false, object: 'a' };
  const opB: Operation = { record: 'B', revision: 'v1', parents: [], deleted: false, object: 'b' };
  const commit = await createCommit('vault', [], [opA, opB], objects, key.privateKey);
  const substituted = new Map(objects);
  substituted.set('a', random(100));
  await assert.rejects(publish(store, substituted, commit, key.publicKey), /hash mismatch/);
  assert.equal(store.data.size, 0, 'reject a mismatched object set before any remote writes');
  await assert.rejects(createCommit('vault', [], [opA], objects, key.privateKey), /Unused input object/);
  await assert.rejects(createCommit('vault', [], [{ ...opA, object: 'missing' }], objects, key.privateKey), /Unreferenced/);
  store.failAfter = 1;
  await assert.rejects(publish(store, objects, commit, key.publicKey), /interruption/);
  assert.equal(store.data.size, 1);
  await assert.rejects(validateCommit(store, commit, 'vault', key.publicKey), /Incomplete/);
  store.failAfter = Infinity;
  const id = await publish(store, objects, commit, key.publicKey);
  assert.equal(await publish(store, objects, commit, key.publicKey), id);
  await validateCommit(store, commit, 'vault', key.publicKey);
  await assert.rejects(validateCommit(store, commit, 'wrong', key.publicKey), /vault/);
  store.data.set('b', random(200));
  await assert.rejects(validateCommit(store, commit, 'vault', key.publicKey), /Corrupt/);
  store.data.delete('b');
  await assert.rejects(validateCommit(store, commit, 'vault', key.publicKey), /Incomplete/);
});

test('concurrent updates and delete conflicts keep both heads; explicit merge resolves', () => {
  const op = (revision: string, parents: string[], deleted = false): Operation =>
    ({ record: 'A', revision, parents, deleted, object: revision });
  const base = op('base', []), a = op('a', ['base']), b = op('b', ['base']), del = op('delete', ['base'], true);
  assert.deepEqual(revisionHeads([base, a, b]).map(x => x.revision), ['a', 'b']);
  assert.deepEqual(revisionHeads([base, a, del]).map(x => x.revision), ['a', 'delete']);
  assert.deepEqual(revisionHeads([base, a, del, op('resolved', ['a', 'delete'])]).map(x => x.revision), ['resolved']);
  assert.throws(() => revisionHeads([op('a', ['b']), op('b', ['a'])]), /Cyclic/);
  assert.throws(() => revisionHeads([op('a', ['missing'])]), /Missing/);
  const deep = Array.from({ length: 2_048 }, (_, i) => op(`r${i}`, i === 0 ? [] : [`r${i - 1}`]));
  assert.equal(revisionHeads(deep).at(-1)?.revision, 'r2047', 'deep valid chains are walked without recursion');
});
