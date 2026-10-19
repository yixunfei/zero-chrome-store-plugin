import { binary, equal, hash, pack, random, tuple, unpack, type Value } from './codec.ts';
import { importPublic, open, publicBytes, seal, sign, verify } from '../crypto-adapter/crypto.ts';
import { credential, readCredential, unwrapRecord, verifyRecord, type Credential } from './record.ts';

export type Mode = 'manual' | 'session';
export async function request(record: Uint8Array, deviceId: string, mode: Mode,
  signer: CryptoKey, ephemeral?: CryptoKey) {
  const body: Value[] = ['ZV/request', 1, deviceId, mode, random(32), record,
    mode === 'session' && ephemeral ? await publicBytes(ephemeral) : null];
  if (mode === 'session' && !body[6]) throw new Error('Session key required');
  return pack(['ZV/signed-request', 1, body, await sign(signer, 'ZV/request-signature', body)]);
}

export type Grant = { signingKey: CryptoKey; records: Set<string> };
export type Checkpoint = { revision: string; digest: Uint8Array };

/** Software test harness only. Android must authenticate real private-key operations. */
export class ApprovalProbe {
  readonly checkpoints = new Map<string, Checkpoint>();
  private readonly seen = new Set<string>();
  constructor(private readonly vault: string, private readonly grants: Map<string, Grant>,
    private readonly phoneDecrypt: CryptoKey, private readonly phoneSign: CryptoKey,
    private readonly recordAuthor: CryptoKey) {}

  async inspect(wire: Uint8Array) {
    const signed = tuple(unpack(wire), 'ZV/signed-request', 4);
    const req = tuple(signed[2], 'ZV/request', 7);
    const grant = this.grants.get(String(req[2]));
    if (!grant) throw new Error('Unpaired device');
    await verify(grant.signingKey, 'ZV/request-signature', req, binary(signed[3], 64));
    if (req[3] !== 'manual' && req[3] !== 'session') throw new Error('Response mode');
    binary(req[4], 32);
    if (req[3] === 'session') binary(req[6], 65);
    else if (req[6] !== null) throw new Error('Unexpected session key');
    const challenge = String(req[2]) + ':' + Array.from(binary(req[4])).join(',');
    if (this.seen.has(challenge)) throw new Error('Repeated challenge');
    if (this.seen.size >= 1024) throw new Error('Probe request budget exhausted');
    const recordWire = binary(req[5]);
    const body = await verifyRecord(recordWire, this.recordAuthor);
    if (body[2] !== this.vault || !grant.records.has(String(body[3]))) throw new Error('Phone policy denied');
    const digest = await hash(recordWire);
    const known = this.checkpoints.get(String(body[3]));
    if (known && (known.revision !== body[4] || !equal(known.digest, digest)))
      throw new Error('Checkpoint conflict: explicit new-version review required');
    if (this.seen.has(challenge)) throw new Error('Repeated challenge');
    this.seen.add(challenge);
    const recordKey = await unwrapRecord(body, 'phone', this.phoneDecrypt);
    const payload = await readCredential(body, recordKey);
    const requestDigest = await hash(wire);
    const started = performance.now();
    let consumed = false;
    return {
      display: { origin: payload[0], username: payload[1], verified: Boolean(known) },
      approve: async (explicitApproval: boolean) => {
        if (consumed || !explicitApproval || performance.now() - started > 120_000)
          throw new Error('Approval absent, expired or already consumed');
        consumed = true;
        this.checkpoints.set(String(body[3]), { revision: String(body[4]), digest });
        if (req[3] === 'manual') return recordKey;
        const context: Value[] = ['ZV/response', 1, requestDigest];
        const [enc, ct] = await seal(await importPublic(binary(req[6])), context, pack(payload));
        const response: Value[] = [...context, enc, ct];
        return pack(['ZV/signed-response', 1, response, await sign(this.phoneSign, 'ZV/response-signature', response)]);
      },
    };
  }
}

export class ResponseSession {
  private consumed = false;
  private readonly started = performance.now();
  constructor(private readonly requestWire: Uint8Array, private readonly privateKey: CryptoKey,
    private readonly phoneSigner: CryptoKey) {}

  async accept(wire: Uint8Array): Promise<Credential> {
    if (this.consumed || performance.now() - this.started > 120_000) throw new Error('Session closed');
    const signed = tuple(unpack(wire), 'ZV/signed-response', 4);
    const body = tuple(signed[2], 'ZV/response', 5);
    await verify(this.phoneSigner, 'ZV/response-signature', body, binary(signed[3], 64));
    if (!equal(binary(body[2], 32), await hash(this.requestWire))) throw new Error('Wrong session');
    // Claim before asynchronous decryption: two simultaneous accepts cannot both succeed.
    if (this.consumed) throw new Error('Session closed');
    this.consumed = true;
    return credential(unpack(await open(this.privateKey, body.slice(0, 3), binary(body[3], 65), binary(body[4]))));
  }
}
