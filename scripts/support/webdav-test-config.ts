import { WebDavStore } from '../../packages/storage/webdav.ts';

export function webDavTestConfig() {
  const url = process.env.ZV_WEBDAV_URL;
  const username = process.env.ZV_WEBDAV_USERNAME;
  const password = process.env.ZV_WEBDAV_PASSWORD;
  if (!url || !username || !password || username.includes(':')) {
    throw new Error('Set the local-only ZV_WEBDAV_URL, ZV_WEBDAV_USERNAME and ZV_WEBDAV_PASSWORD variables.');
  }
  const root = new URL(url);
  if (root.protocol !== 'https:') throw new Error('WebDAV test endpoint must use HTTPS.');
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  return { root, store: new WebDavStore(root.toString(), authorization), authorization };
}
