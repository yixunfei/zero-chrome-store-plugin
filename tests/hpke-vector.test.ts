import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { suite } from '../packages/crypto-adapter/crypto.ts';

test('RFC 9180 P-256 / SHA-256 / AES-256-GCM official base-mode vector', async () => {
  const v = JSON.parse(await readFile('packages/test-vectors/rfc9180-p256.json', 'utf8'));
  const raw = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));
  const recipient = await suite.kem.deriveKeyPair(raw(v.ikmR));
  assert.equal(Buffer.from(await suite.kem.serializePublicKey(recipient.publicKey)).toString('hex'), v.pkRm);
  const context = await suite.createRecipientContext({ recipientKey: recipient, enc: raw(v.enc), info: raw(v.info) });
  for (const item of v.encryptions) {
    assert.equal(Buffer.from(await context.open(raw(item.ct), raw(item.aad))).toString('hex'), item.pt);
  }
});
