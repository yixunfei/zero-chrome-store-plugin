/** Minimal test-only CDP connection; intentionally never auto-attaches to workers. */
export class CdpClient {
  private nextId = 0;
  private readonly pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', event => {
      const value = JSON.parse(String(event.data));
      const request = this.pending.get(value.id);
      if (!request) return;
      this.pending.delete(value.id);
      if (value.error) request.reject(new Error(value.error.message));
      else request.resolve(value.result);
    });
    socket.addEventListener('close', () => {
      this.pending.forEach(request => request.reject(new Error('CDP connection closed')));
      this.pending.clear();
    });
  }

  static async connect(url: string) {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP connection failed')), { once: true });
    });
    return new CdpClient(socket);
  }

  call(method: string, params: object = {}, sessionId?: string): Promise<any> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timeout); resolve(value); },
        reject: error => { clearTimeout(timeout); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  close() { this.socket.close(); }
}
