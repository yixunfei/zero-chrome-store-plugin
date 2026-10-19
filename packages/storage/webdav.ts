import { equal } from '../protocol/codec.ts';
import type { ObjectStore } from '../sync/commit.ts';

/** Explicit origin, TLS validation by the platform, and no redirects carrying credentials. */
export class WebDavStore implements ObjectStore {
  private readonly root: URL;
  constructor(root: string, private readonly authorization: string) {
    this.root = new URL(root);
    if (this.root.protocol !== 'https:' || this.root.username || this.root.password ||
      this.root.search || this.root.hash || !this.root.pathname.endsWith('/')) throw new Error('HTTPS collection URL required');
  }

  private url(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Opaque object ID required');
    return new URL(id, this.root);
  }

  async request(id: string, method: string, headers: Record<string, string> = {}, body?: Uint8Array) {
    const response = await fetch(this.url(id), { method, headers: { ...headers, Authorization: this.authorization },
      body, redirect: 'error', signal: AbortSignal.timeout(15000) });
    return response;
  }

  async get(id: string) {
    const response = await this.request(id, 'GET');
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`WebDAV GET ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing object body');
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 32768) throw new Error('Object size limit');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const result = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  }

  async putIfAbsent(id: string, value: Uint8Array) {
    if (value.length > 32768) throw new Error('Object size limit');
    const response = await this.request(id, 'PUT', { 'If-None-Match': '*', 'Content-Type': 'application/octet-stream' }, value);
    if (response.status === 412) {
      const old = await this.get(id);
      if (!old || !equal(old, value)) throw new Error('Immutable object collision');
      return;
    }
    if (![201, 204].includes(response.status)) throw new Error(`WebDAV PUT ${response.status}`);
  }
}
