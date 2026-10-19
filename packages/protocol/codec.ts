import { encode, decode } from 'cbor2';

export const MAX_BYTES = 32_768;
export type Value = null | boolean | number | string | Uint8Array | Value[];
export const utf8 = (s: string) => new TextEncoder().encode(s);
export const bytes = (b: ArrayBuffer) => new Uint8Array(b);
export const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export const equal = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function validate(v: unknown, depth = 0): asserts v is Value {
  if (depth > 16) throw new Error('CBOR depth limit');
  if (v === null || typeof v === 'boolean') return;
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return;
  if (typeof v === 'string' && v.length <= 8192) return;
  if (v instanceof Uint8Array && v.length <= MAX_BYTES) return;
  if (Array.isArray(v) && v.length <= 2048) {
    v.forEach(x => validate(x, depth + 1));
    return;
  }
  throw new Error('Unsupported CBOR value');
}

export function pack(v: Value): Uint8Array {
  validate(v);
  const result = encode(v);
  if (result.length > MAX_BYTES) throw new Error('Message size limit');
  return result;
}

export function unpack(b: Uint8Array): Value {
  if (b.length > MAX_BYTES) throw new Error('Message size limit');
  const v: unknown = decode(b, { maxDepth: 16 });
  validate(v);
  if (!equal(pack(v), b)) throw new Error('Noncanonical CBOR');
  return v;
}

export async function hash(b: Uint8Array): Promise<Uint8Array> {
  return bytes(await crypto.subtle.digest('SHA-256', b));
}

export function tuple(v: Value, tag: string, length: number): Value[] {
  if (!Array.isArray(v) || v.length !== length || v[0] !== tag || v[1] !== 1)
    throw new Error('Unknown message type/version/shape');
  return v;
}

export function binary(v: Value, length?: number): Uint8Array {
  if (!(v instanceof Uint8Array) || (length !== undefined && v.length !== length))
    throw new Error('Invalid byte string');
  return v;
}

export function hex(b: Uint8Array): string {
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}
