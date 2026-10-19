import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CdpClient } from './support/cdp-client.ts';
import { chromeExecutable } from './support/chrome-executable.ts';

const repositoryRoot = resolve(process.env.ZV_REPOSITORY_ROOT ?? process.cwd());
const extensionPath = resolve(repositoryRoot, 'apps/extension/.output/chrome-mv3');
const profilePath = resolve(repositoryRoot, process.env.ZV_CHROME_PROFILE_PATH ?? 'dist/chrome-development-profile');
const portFile = resolve(profilePath, 'DevToolsActivePort');
await mkdir(profilePath, { recursive: true });

const chrome = spawn(chromeExecutable(), [
  `--user-data-dir=${profilePath}`,
  '--remote-debugging-port=0',
  '--remote-allow-origins=*',
  '--enable-unsafe-extension-debugging',
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { windowsHide: false, stdio: 'ignore' });
chrome.unref();

async function endpoint() {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    try {
      const [port, path] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/);
      return `ws://127.0.0.1:${port}${path}`;
    } catch {
      if (chrome.exitCode !== null || chrome.signalCode !== null) {
        throw new Error(`Chrome exited before exposing its debugging endpoint (exit code ${chrome.exitCode ?? 'unknown'}).`);
      }
      await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
    }
  }
  throw new Error('Chrome debugging endpoint did not become ready.');
}

let client: CdpClient | undefined;
try {
  client = await CdpClient.connect(await endpoint());
  const loaded = await client.call('Extensions.loadUnpacked', { path: extensionPath });
  await client.call('Target.createTarget', { url: 'chrome://extensions/' });
  await client.call('Target.createTarget', { url: `chrome-extension://${loaded.id}/popup.html` });
  console.log(`Loaded extension ${loaded.id} in an isolated Chrome development profile.`);
  console.log('Chrome remains open with the extension management page and test popup available.');
} catch (error) {
  if (client) await client.call('Browser.close').catch(() => undefined);
  else if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill();
  throw error;
} finally {
  client?.close();
}
