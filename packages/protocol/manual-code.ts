import { equal, hash, pack } from './codec.ts';

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function base32(data: Uint8Array): string {
  let bits = 0, acc = 0, out = '';
  for (const b of data) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) { bits -= 5; out += alphabet[(acc >>> bits) & 31]; }
  }
  if (bits) out += alphabet[(acc << (5 - bits)) & 31];
  return out;
}

export async function manualCode(key: Uint8Array): Promise<string> {
  if (key.length !== 32) throw new Error('Expected 256-bit record key');
  const check = await hash(pack(['ZV/manual-check', 1, key]));
  return base32(key) + base32(check).slice(0, 4);
}

export async function parseManualCode(input: string): Promise<Uint8Array> {
  if (input.length > 128) throw new Error('Code size');
  const code = input.toUpperCase().replace(/[ -]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (code.length !== 56 || [...code].some(c => !alphabet.includes(c))) throw new Error('Code format');
  let bits = 0, acc = 0;
  const out: number[] = [];
  for (const c of code.slice(0, 52)) {
    acc = (acc << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((acc >>> bits) & 255); }
  }
  if ((acc & 15) !== 0) throw new Error('Noncanonical padding');
  const key = Uint8Array.from(out);
  if (!equal(new TextEncoder().encode(await manualCode(key)), new TextEncoder().encode(code)))
    throw new Error('Code checksum');
  return key;
}
