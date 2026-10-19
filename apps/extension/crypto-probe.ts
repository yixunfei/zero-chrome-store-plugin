import { encryptionKeys, signingKeys } from '../../packages/crypto-adapter/crypto';
import { createRecord, readCredential, unwrapRecord, verifyRecord } from '../../packages/protocol/record';
import { manualCode, parseManualCode } from '../../packages/protocol/manual-code';
import { ApprovalProbe, request, ResponseSession } from '../../packages/protocol/authorization';
import { frame } from '../../packages/protocol/frames';

/** Synthetic software keys only; no key is persisted or used as a phone identity. */
export async function cryptoProbe() {
  const [phone, recovery, author, signing, session] = await Promise.all([
    encryptionKeys(), encryptionKeys(), signingKeys(), signingKeys(), encryptionKeys(),
  ]);
  const record = await createRecord('p1-vault', 'synthetic-record', 'v1', [],
    ['https://example.com', '合成账号', 'SYNTHETIC-ONLY-NOT-A-PASSWORD'],
    [{ id: 'phone', key: phone.publicKey }, { id: 'recovery', key: recovery.publicKey }], author.privateKey);
  const body = await verifyRecord(record.wire, author.publicKey);
  const key = await unwrapRecord(body, 'phone', phone.privateKey);
  const code = await manualCode(key);
  await readCredential(body, await parseManualCode(code));
  const req = await request(record.wire, 'p1-desktop', 'session', author.privateKey, session.publicKey);
  const phoneProbe = new ApprovalProbe('p1-vault', new Map([['p1-desktop',
    { signingKey: author.publicKey, records: new Set(['synthetic-record']) }]]),
  phone.privateKey, signing.privateKey, author.publicKey);
  const response = await (await phoneProbe.inspect(req)).approve(true);
  const output = await new ResponseSession(req, session.privateKey, signing.publicKey).accept(response);
  if (output[1] !== '合成账号') throw new Error('Browser crypto mismatch');
  return { frames: await frame(req), summary: { environment: '浏览器软件密钥，非手机授权',
    recordBytes: record.wire.length, requestBytes: req.length, manualCodeCharacters: code.length,
    responseBytes: response.length, hpkeAndSessionPassed: true } };
}
