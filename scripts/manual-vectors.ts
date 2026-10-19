import { writeFile } from 'node:fs/promises';
import { manualCode } from '../packages/protocol/manual-code.ts';
import { hex } from '../packages/protocol/codec.ts';
import { frame } from '../packages/protocol/frames.ts';
const vectors = [];
for (const key of [new Uint8Array(32), new Uint8Array(32).fill(255), Uint8Array.from({ length: 32 }, (_, i) => i)]) {
  vectors.push({ keyHex: hex(key), code: await manualCode(key) });
}
await writeFile('packages/test-vectors/manual-code.json', JSON.stringify(vectors, null, 2));
const message = Uint8Array.from({ length: 1800 }, (_, i) => i % 256);
const frames = await frame(message);
await writeFile('packages/test-vectors/frames.json', JSON.stringify({ messageHex: hex(message),
  frames: frames.map(f => 'ZV1:' + Buffer.from(f).toString('base64')) }, null, 2));
