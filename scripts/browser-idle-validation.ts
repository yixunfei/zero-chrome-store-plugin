import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CdpClient } from './support/cdp-client.ts';
import { chromeExecutable } from './support/chrome-executable.ts';

const profile = resolve('artifacts/local', `chrome-idle-${crypto.randomUUID()}`);
await mkdir(profile, { recursive: true });
const chrome = spawn(chromeExecutable(), [
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--enable-unsafe-extension-debugging',
  '--no-first-run', '--no-default-browser-check', '--headless=new',
], { windowsHide: true, stdio: 'ignore' });
const portFile = resolve(profile, 'DevToolsActivePort');
let connection: CdpClient | undefined;

async function endpoint() {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const [port, path] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/);
      return `ws://127.0.0.1:${port}${path}`;
    } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  throw new Error('Chrome debugging port not ready');
}

async function checkBoot(client: CdpClient, extensionId: string, clearAlarms: boolean) {
  const { targetId } = await client.call('Target.createTarget', { url: `chrome-extension://${extensionId}/popup.html` });
  const { sessionId } = await client.call('Target.attachToTarget', { targetId, flatten: true });
  await client.call('Runtime.enable', {}, sessionId);
  // Page Runtime only. Service worker targets are never attached or inspected.
  const expression = `(async () => {
    if (${clearAlarms}) await chrome.alarms.clearAll();
    return chrome.runtime.sendMessage({type:'p1-status'});
  })()`;
  let result;
  for (let attempt = 0; attempt < 20; attempt++) {
    result = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.result?.value?.bootId) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!result?.result?.value?.bootId) throw new Error('Extension page did not become ready');
  await client.call('Target.detachFromTarget', { sessionId });
  await client.call('Target.closeTarget', { targetId });
  return result.result.value.bootId as string;
}

try {
  const url = await endpoint();
  connection = await CdpClient.connect(url);
  const version = await connection.call('Browser.getVersion');
  const { id } = await connection.call('Extensions.loadUnpacked', { path: resolve('apps/extension/.output/chrome-mv3') });
  const before = await checkBoot(connection, id, true);
  connection.close(); connection = undefined;
  console.log('Chrome idle check: all CDP connections closed for 45 seconds; no worker auto-attachment.');
  await new Promise(resolve => setTimeout(resolve, 45000));
  connection = await CdpClient.connect(url);
  const after = await checkBoot(connection, id, false);
  const evidence = { version, browserPid: chrome.pid, intervalSeconds: 45, allCdpConnectionsClosed: true,
    workerEverAttached: false, extensionPageClosed: true, testAlarmsCleared: true,
    bootChanged: before !== after, naturalSuspensionObserved: before !== after };
  await writeFile('artifacts/p1-browser-idle.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (connection) {
    await connection.call('Browser.close').catch(() => undefined);
    connection.close();
  } else if (chrome.exitCode === null) chrome.kill();
}
