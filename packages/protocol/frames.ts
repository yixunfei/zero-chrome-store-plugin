import { binary, equal, hash, hex, MAX_BYTES, pack, tuple, unpack } from './codec.ts';

const CHUNK = 700;
const MAX_FRAMES = Math.ceil(MAX_BYTES / CHUNK);
export async function frame(message: Uint8Array): Promise<Uint8Array[]> {
  if (!message.length || message.length > MAX_BYTES) throw new Error('Message size');
  const id = await hash(message);
  const count = Math.ceil(message.length / CHUNK);
  return Array.from({ length: count }, (_, i) =>
    pack(['ZV/frame', 1, id, i, count, message.slice(i * CHUNK, (i + 1) * CHUNK)]));
}

export class FrameCollector {
  private id?: string;
  private count = 0;
  private started = 0;
  private readonly chunks = new Map<number, Uint8Array>();
  constructor(private readonly now = () => performance.now()) {}

  async add(wire: Uint8Array): Promise<Uint8Array | undefined> {
    if (wire.length > 800) throw new Error('Frame size');
    const f = tuple(unpack(wire), 'ZV/frame', 6);
    const digest = binary(f[2], 32), id = hex(digest), index = f[3], count = f[4], chunk = binary(f[5]);
    if (typeof index !== 'number' || typeof count !== 'number' || count < 1 || count > MAX_FRAMES ||
      index >= count || chunk.length < 1 || chunk.length > CHUNK || (index < count - 1 && chunk.length !== CHUNK))
      throw new Error('Invalid frame bounds');
    if (this.id && this.now() - this.started > 120_000) throw new Error('Assembly expired');
    if (this.id && (this.id !== id || this.count !== count)) throw new Error('Mixed message');
    if (!this.id) { this.id = id; this.count = count; this.started = this.now(); }
    const old = this.chunks.get(index);
    if (old && !equal(old, chunk)) throw new Error('Conflicting duplicate');
    this.chunks.set(index, chunk);
    if (this.chunks.size !== count) return;
    const total = [...this.chunks.values()].reduce((sum, part) => sum + part.length, 0);
    if (total > MAX_BYTES) throw new Error('Assembly size');
    const message = new Uint8Array(total);
    for (let i = 0, offset = 0; i < count; i++) {
      const part = this.chunks.get(i)!;
      message.set(part, offset); offset += part.length;
    }
    if (!equal(await hash(message), digest)) throw new Error('Frame digest');
    return message;
  }
}
