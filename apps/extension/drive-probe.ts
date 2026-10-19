import { browser } from 'wxt/browser';

type DriveIdentity = { displayName: string; emailAddress: string; permissionId: string };
export class DriveProbe {
  private token?: string;
  identity?: DriveIdentity;

  async authorize() {
    if (!browser.runtime.getManifest().oauth2?.client_id) throw new Error('缺少 Google Cloud OAuth 客户端配置，未发起授权。');
    const allowed = await browser.permissions.request({ permissions: ['identity'], origins: ['https://www.googleapis.com/*'] });
    if (!allowed) throw new Error('用户未授予权限');
    const result = await browser.identity.getAuthToken({ interactive: true });
    this.token = typeof result === 'string' ? result : result.token;
    if (!this.token) throw new Error('没有获得 OAuth 令牌');
    const about = await this.api('/about?fields=user(displayName,emailAddress,permissionId)');
    this.identity = (await about.json()).user;
    return { authorizedAccount: this.identity, scope: 'drive.file', uploaded: false };
  }

  private async api(path: string, init: RequestInit = {}) {
    if (!this.token) throw new Error('请先明确授权并核对实际账号');
    const response = await fetch('https://www.googleapis.com/drive/v3' + path, {
      ...init, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { ...init.headers, Authorization: `Bearer ${this.token}` },
    });
    if (response.status === 401) {
      const token = this.token; this.token = undefined; this.identity = undefined;
      await browser.identity.removeCachedAuthToken({ token });
      throw new Error('令牌失效；请重新明确授权，不自动切换账号');
    }
    if (!response.ok) throw new Error(`Drive ${response.status}`);
    return response;
  }

  async createSyntheticFolder() {
    if (!this.identity) throw new Error('先授权并核对显示的实际账号');
    const response = await this.api('/files?fields=id,name,mimeType', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Zero Browser Vault P1 - Synthetic', mimeType: 'application/vnd.google-apps.folder' }),
    });
    return { account: this.identity, folder: await response.json(),
      next: '记录真实 folderId；第二设备独立 OAuth 后验证按 ID 访问，不根据名称认库。' };
  }

  async readFileMetadata(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) throw new Error('文件 ID 格式错误');
    return (await this.api(`/files/${id}?fields=id,name,mimeType,parents`)).json();
  }
}
