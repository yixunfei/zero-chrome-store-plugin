import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptionKeys, signingKeys } from '../packages/crypto-adapter/crypto.ts';
import { createRecord, readCredential, unwrapRecord, verifyRecord } from '../packages/protocol/record.ts';
import { pack, random, unpack, type Value } from '../packages/protocol/codec.ts';
import { manualCode, parseManualCode } from '../packages/protocol/manual-code.ts';
import { ApprovalProbe, request, ResponseSession } from '../packages/protocol/authorization.ts';
import { encryptDirectory, grantDirectory, readDirectory, receiveDirectoryGrant } from '../packages/protocol/directory.ts';
import { frame, FrameCollector } from '../packages/protocol/frames.ts';

async function fixture() {
  const [phone, recovery, author, signing, ephemeral] = await Promise.all([
    encryptionKeys(), encryptionKeys(), signingKeys(), signingKeys(), encryptionKeys(),
  ]);
  const recipients = [{ id: 'phone', key: phone.publicKey }, { id: 'recovery', key: recovery.publicKey }];
  const a = await createRecord('vault', 'A', 'v1', [], ['https://example.com', 'synthetic', 'not-a-real-password'], recipients, author.privateKey);
  const b = await createRecord('vault', 'B', 'v1', [], ['https://other.example', 'synthetic-b', 'synthetic-secret-b'], recipients, author.privateKey);
  const next = await createRecord('vault', 'A', 'v2', ['v1'], ['https://example.com', 'synthetic', 'changed'], recipients, author.privateKey);
  const probe = new ApprovalProbe('vault', new Map([['desktop', { signingKey: author.publicKey, records: new Set(['A']) }]]),
    phone.privateKey, signing.privateKey, author.publicKey);
  return { phone, recovery, author, signing, ephemeral, a, b, next, probe };
}

test('record key cannot open another record, future revision, or substituted context; recovery works', async () => {
  const f = await fixture();
  const a = await verifyRecord(f.a.wire, f.author.publicKey);
  assert.equal((await readCredential(a, await unwrapRecord(a, 'phone', f.phone.privateKey)))[1], 'synthetic');
  assert.deepEqual(await unwrapRecord(a, 'recovery', f.recovery.privateKey), f.a.key);
  await assert.rejects(readCredential(await verifyRecord(f.b.wire, f.author.publicKey), f.a.key));
  await assert.rejects(readCredential(await verifyRecord(f.next.wire, f.author.publicKey), f.a.key));
  const tampered = unpack(f.a.wire) as Value[];
  (tampered[2] as Value[])[2] = 'other-vault';
  await assert.rejects(verifyRecord(pack(tampered), f.author.publicKey), /Signature/);
  await assert.rejects(unwrapRecord(a, 'phone', f.recovery.privateKey));
});

test('56 characters: normalization, checksum, padding, and no response downgrade', async () => {
  const key = random(32), code = await manualCode(key);
  assert.equal(code.length, 56);
  assert.deepEqual(await parseManualCode(code.match(/.{1,7}/g)!.join('-').toLowerCase()), key);
  for (let i = 0; i < 56; i++) {
    const changed = code.slice(0, i) + (code[i] === '0' ? '2' : '0') + code.slice(i + 1);
    await assert.rejects(parseManualCode(changed));
  }
  await assert.rejects(parseManualCode('ZV/session:invalid'));
});

test('phone policy, trusted display, explicit approval, checkpoint and repeated challenge', async () => {
  const f = await fixture();
  const req = await request(f.a.wire, 'desktop', 'manual', f.author.privateKey);
  const pending = await f.probe.inspect(req);
  assert.deepEqual(pending.display, { origin: 'https://example.com', username: 'synthetic', verified: false });
  await assert.rejects(pending.approve(false));
  assert.deepEqual(await pending.approve(true), f.a.key);
  await assert.rejects(pending.approve(true));
  await assert.rejects(f.probe.inspect(req), /Repeated/);
  await assert.rejects(f.probe.inspect(await request(f.b.wire, 'desktop', 'manual', f.author.privateKey)), /policy/);
  await assert.rejects(f.probe.inspect(await request(f.a.wire, 'unknown', 'manual', f.author.privateKey)), /Unpaired/);
  await assert.rejects(f.probe.inspect(await request(f.next.wire, 'desktop', 'manual', f.author.privateKey)), /Checkpoint/);
});

test('session requires signature, correct request and ephemeral private key; consumes once', async () => {
  const f = await fixture();
  const req = await request(f.a.wire, 'desktop', 'session', f.author.privateKey, f.ephemeral.publicKey);
  const response = await (await f.probe.inspect(req)).approve(true);
  const altered = response.slice(); altered[altered.length - 1] ^= 1;
  const session = () => new ResponseSession(req, f.ephemeral.privateKey, f.signing.publicKey);
  await assert.rejects(session().accept(altered), /Signature/);
  await assert.rejects(new ResponseSession(req, f.recovery.privateKey, f.signing.publicKey).accept(response));
  const otherRequest = await request(f.a.wire, 'desktop', 'session', f.author.privateKey, f.ephemeral.publicKey);
  await assert.rejects(new ResponseSession(otherRequest, f.ephemeral.privateKey, f.signing.publicKey).accept(response), /Wrong session/);
  const live = session();
  const results = await Promise.allSettled([live.accept(response), live.accept(response)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  await assert.rejects(live.accept(response), /closed/);
});

test('directory capability is transcript-bound and cannot decrypt credentials', async () => {
  const f = await fixture(), key = random(32), transcript = pack(['pairing', 'vault', random(32)]);
  const grant = await grantDirectory(transcript, key, f.ephemeral.publicKey, f.signing.privateKey);
  assert.deepEqual(await receiveDirectoryGrant(grant, transcript, f.ephemeral.privateKey, f.signing.publicKey), key);
  await assert.rejects(receiveDirectoryGrant(grant, pack(['other']), f.ephemeral.privateKey, f.signing.publicKey));
  const entries: [string, string, string, string][] = [['A', 'v1', 'https://example.com', 'work']];
  const directory = await encryptDirectory('vault', 'd1', key, entries);
  assert.deepEqual(await readDirectory(directory, key, 'vault'), entries);
  await assert.rejects(readDirectory(directory, key, 'other'));
  await assert.rejects(readCredential(await verifyRecord(f.a.wire, f.author.publicKey), key));
});

test('bounded canonical parser and frames reject corruption, mixtures, timeout and oversize', async () => {
  const input = random(2500), frames = await frame(input), collector = new FrameCollector();
  assert.equal(await collector.add(frames[2]), undefined);
  assert.equal(await collector.add(frames[2]), undefined);
  await collector.add(frames[0]); await collector.add(frames[3]);
  assert.deepEqual(await collector.add(frames[1]), input);
  const mixed = new FrameCollector(); await mixed.add(frames[0]);
  await assert.rejects(mixed.add((await frame(random(2000)))[0]), /Mixed/);
  let time = 0; const timed = new FrameCollector(() => time);
  await timed.add(frames[0]); time = 120001;
  await assert.rejects(timed.add(frames[1]), /expired/);
  const bad = frames[0].slice(); bad[bad.length - 1] ^= 1;
  const corrupt = new FrameCollector(); await corrupt.add(bad);
  await corrupt.add(frames[1]); await corrupt.add(frames[2]);
  await assert.rejects(corrupt.add(frames[3]), /digest/);
  assert.throws(() => unpack(Uint8Array.of(0x18, 0x01)), /Noncanonical/);
  assert.throws(() => unpack(new Uint8Array(32769)), /size/);
  assert.throws(() => unpack(Uint8Array.from([...Array(100).fill(0x81), 0])));
});
