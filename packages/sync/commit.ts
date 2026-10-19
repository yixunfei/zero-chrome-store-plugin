import { binary, equal, hash, hex, pack, tuple, unpack, type Value } from '../protocol/codec.ts';
import { sign, verify } from '../crypto-adapter/crypto.ts';

export interface ObjectStore {
  get(id: string): Promise<Uint8Array | undefined>;
  putIfAbsent(id: string, value: Uint8Array): Promise<void>;
}
export type Operation = { record: string; revision: string; parents: string[]; deleted: boolean; object: string };
export type Reference = [string, Uint8Array];

const MAX_ITEMS = 2048;
const MAX_PARENTS = 64;
const MAX_OBJECT_BYTES = 32_768;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const COMMIT_ID = /^[a-f0-9]{64}$/;

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new Error(`Invalid ${label}`);
}

function uniqueStrings(value: unknown, label: string, max: number,
  validate: (item: unknown, itemLabel: string) => asserts item is string): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid ${label}`);
  const result = value as unknown[];
  const seen = new Set<string>();
  for (const item of result) {
    validate(item, label);
    if (seen.has(item)) throw new Error(`Duplicate ${label}`);
    seen.add(item);
  }
  return result as string[];
}

function validateOperations(operations: unknown, objectIds?: Set<string>): Operation[] {
  if (!Array.isArray(operations) || operations.length > MAX_ITEMS) throw new Error('Invalid operations');
  const revisions = new Set<string>();
  const result: Operation[] = [];
  for (const operation of operations as unknown[]) {
    let values: unknown[];
    if (Array.isArray(operation) && operation.length === 5) {
      values = operation;
    } else if (operation !== null && typeof operation === 'object' && !Array.isArray(operation)) {
      const candidate = operation as Record<string, unknown>;
      values = [candidate.record, candidate.revision, candidate.parents, candidate.deleted, candidate.object];
    } else {
      throw new Error('Invalid operation');
    }
    const [record, revision, rawParents, deleted, object] = values;
    identifier(record, 'record ID');
    identifier(revision, 'revision ID');
    identifier(object, 'object ID');
    const parents = uniqueStrings(rawParents, 'revision parents', MAX_PARENTS, identifier);
    if (parents.includes(revision)) throw new Error('Self-parent revision');
    if (typeof deleted !== 'boolean') throw new Error('Invalid deleted flag');
    if (objectIds && !objectIds.has(object)) throw new Error('Unreferenced operation');
    const key = JSON.stringify([record, revision]);
    if (revisions.has(key)) throw new Error('Duplicate record revision');
    revisions.add(key);
    result.push({ record, revision, parents, deleted, object });
  }
  return result;
}

function validateCommitBody(body: Value[]) {
  if (body.length !== 6 || body[0] !== 'ZV/commit' || body[1] !== 1) throw new Error('Commit schema');
  identifier(body[2], 'vault ID');
  const parents = uniqueStrings(body[3], 'commit parents', MAX_PARENTS,
    (value, label) => {
      if (typeof value !== 'string' || !COMMIT_ID.test(value)) throw new Error(`Invalid ${label}`);
    });
  if (!Array.isArray(body[4]) || body[4].length > MAX_ITEMS) throw new Error('Invalid references');
  const references = new Map<string, Uint8Array>();
  for (const item of body[4]) {
    if (!Array.isArray(item) || item.length !== 2) throw new Error('Invalid reference');
    const [id, digest] = item;
    identifier(id, 'object ID');
    if (references.has(id)) throw new Error('Duplicate reference');
    references.set(id, binary(digest, 32));
  }
  const operations = validateOperations(body[5], new Set(references.keys()));
  const usedObjects = new Set(operations.map(operation => operation.object));
  if (usedObjects.size !== references.size) throw new Error('Unused committed object');
  return { vault: body[2], parents, references, operations };
}

function validateCommitInput(vault: string, parents: string[], operations: Operation[],
  objects: Map<string, Uint8Array>) {
  identifier(vault, 'vault ID');
  uniqueStrings(parents, 'commit parents', MAX_PARENTS,
    (value, label) => {
      if (typeof value !== 'string' || !COMMIT_ID.test(value)) throw new Error(`Invalid ${label}`);
    });
  const ids = new Set<string>();
  for (const [id, value] of objects) {
    identifier(id, 'object ID');
    if (ids.has(id)) throw new Error('Duplicate object ID');
    if (!(value instanceof Uint8Array) || value.length > MAX_OBJECT_BYTES) throw new Error('Object size limit');
    ids.add(id);
  }
  const validated = validateOperations(operations, ids);
  const usedObjects = new Set(validated.map(operation => operation.object));
  if (usedObjects.size !== ids.size) throw new Error('Unused input object');
}

export async function createCommit(vault: string, parents: string[], operations: Operation[],
  objects: Map<string, Uint8Array>, author: CryptoKey) {
  validateCommitInput(vault, parents, operations, objects);
  const refs: Reference[] = await Promise.all([...objects].map(async ([id, value]) => [id, await hash(value)]));
  const ops: Value[] = operations.map(operation =>
    [operation.record, operation.revision, operation.parents, operation.deleted, operation.object]);
  const body: Value[] = ['ZV/commit', 1, vault, parents, refs, ops];
  validateCommitBody(body);
  return pack(['ZV/signed-commit', 1, body, await sign(author, 'ZV/commit-signature', body)]);
}

async function validatePublishedObjects(objects: Map<string, Uint8Array>, commit: Uint8Array,
  signer: CryptoKey) {
  const signed = tuple(unpack(commit), 'ZV/signed-commit', 4);
  const body = tuple(signed[2], 'ZV/commit', 6);
  const { references, operations } = validateCommitBody(body);
  await verify(signer, 'ZV/commit-signature', body, binary(signed[3], 64));
  if (objects.size !== references.size) throw new Error('Published object set does not match commit');
  for (const [id, data] of objects) {
    identifier(id, 'object ID');
    if (!(data instanceof Uint8Array) || data.length > MAX_OBJECT_BYTES) throw new Error('Object size limit');
    const expected = references.get(id);
    if (!expected || !equal(await hash(data), expected)) throw new Error('Published object hash mismatch');
  }
  validateOperations(operations, new Set(references.keys()));
  return references;
}

export async function publish(store: ObjectStore, objects: Map<string, Uint8Array>, commit: Uint8Array,
  signer: CryptoKey) {
  await validatePublishedObjects(objects, commit, signer);
  for (const [id, data] of objects) {
    await store.putIfAbsent(id, data);
    const readback = await store.get(id);
    if (!readback || !equal(readback, data)) throw new Error('Object write not confirmed');
  }
  const id = hex(await hash(commit));
  await store.putIfAbsent(id, commit);
  const readback = await store.get(id);
  if (!readback || !equal(readback, commit)) throw new Error('Commit write not confirmed');
  return id;
}

export async function validateCommit(store: ObjectStore, wire: Uint8Array, vault: string, signer: CryptoKey) {
  const signed = tuple(unpack(wire), 'ZV/signed-commit', 4);
  const body = tuple(signed[2], 'ZV/commit', 6);
  const parsed = validateCommitBody(body);
  await verify(signer, 'ZV/commit-signature', body, binary(signed[3], 64));
  if (parsed.vault !== vault) throw new Error('Commit schema/vault');
  if (parsed.parents.includes(hex(await hash(wire)))) throw new Error('Commit cannot be its own parent');
  for (const [id, expectedHash] of parsed.references) {
    const data = await store.get(id);
    if (!data) throw new Error('Incomplete commit');
    if (data.length > MAX_OBJECT_BYTES || !equal(await hash(data), expectedHash)) throw new Error('Corrupt object');
  }
  return body;
}

/** Retains all concurrent heads, including delete-vs-update; caller resolves explicitly. */
export function revisionHeads(operations: Operation[]): Operation[] {
  const validated = validateOperations(operations);
  const revisionKey = (record: string, revision: string) => JSON.stringify([record, revision]);
  const byId = new Map(validated.map(operation => [revisionKey(operation.record, operation.revision), operation]));
  if (byId.size !== validated.length) throw new Error('Duplicate revision');
  const state = new Map<string, 1 | 2>();
  const superseded = new Set<string>();
  for (const root of validated) {
    const rootKey = revisionKey(root.record, root.revision);
    if (state.get(rootKey) === 2) continue;
    state.set(rootKey, 1);
    const stack = [{ operation: root, parentIndex: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.parentIndex === frame.operation.parents.length) {
        state.set(revisionKey(frame.operation.record, frame.operation.revision), 2);
        stack.pop();
        continue;
      }
      const parentId = frame.operation.parents[frame.parentIndex++];
      const parentKey = revisionKey(frame.operation.record, parentId);
      const parent = byId.get(parentKey);
      if (!parent) throw new Error('Missing or wrong-record parent');
      superseded.add(parentKey);
      if (state.get(parentKey) === 1) throw new Error('Cyclic revisions');
      if (state.get(parentKey) === 2) continue;
      state.set(parentKey, 1);
      stack.push({ operation: parent, parentIndex: 0 });
    }
  }
  return validated.filter(operation => !superseded.has(revisionKey(operation.record, operation.revision)));
}
