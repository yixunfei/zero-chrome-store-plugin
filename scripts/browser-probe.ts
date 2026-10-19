import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromeExecutable } from './support/chrome-executable.ts';

const extension = resolve('artifacts/local/extension-permission-probe');
await cp(resolve('apps/extension/.output/chrome-mv3'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
manifest.permissions.push('privacy');
manifest.optional_permissions = manifest.optional_permissions.filter((p: string) => p !== 'privacy');
await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(manifest));
const profile = resolve('artifacts/local/chrome-probe-profile');
const headed = process.argv.includes('--headed');
const checkIdle = process.argv.includes('--idle');
const qrDirectory = resolve('artifacts/local/qr-capture');
await mkdir('artifacts/local', { recursive: true });
await mkdir(qrDirectory, { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  executablePath: chromeExecutable(),
  headless: !headed,
  viewport: { width: 430, height: 900 },
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--enable-unsafe-extension-debugging'],
});
try {
  const control = await context.browser()!.newBrowserCDPSession();
  const loaded = await control.send('Extensions.loadUnpacked', { path: extension });
  const id = loaded.id;
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`chrome-extension://${id}/popup.html`);
  const nativeSetting = await page.evaluate(async () => {
    const setting = (globalThis as unknown as { chrome: { privacy: { services: {
      passwordSavingEnabled: { get: (arg: object) => Promise<{ value: boolean; levelOfControl: string }>;
        set: (arg: object) => Promise<void>; clear: (arg: object) => Promise<void> } } } } }).chrome.privacy.services.passwordSavingEnabled;
    const before = await setting.get({});
    try {
      await setting.set({ value: false, scope: 'regular' });
      const disabled = await setting.get({});
      if (disabled.value !== false) throw new Error('Native save setting failed');
      return { before, disabled, scope: 'isolated disposable profile; probe manifest pregrants privacy' };
    } finally { await setting.clear({ scope: 'regular' }); }
  });
  await page.getByRole('button', { name: '检查后台生命周期' }).click();
  await page.waitForFunction(() => document.querySelector('pre')?.textContent?.includes('bootId'));
  const first = JSON.parse(await page.locator('pre').innerText());
  await page.getByRole('button', { name: '显示传输测试二维码' }).click();
  await page.locator('img').waitFor();
  const cryptoSummary = JSON.parse(await page.locator('pre').innerText());
  assert.equal(cryptoSummary.hpkeAndSessionPassed, true);
  const frameButton = page.getByRole('button', { name: /第 .* 帧/ });
  const frameCount = Number((await frameButton.innerText()).match(/\/\s*(\d+)/)![1]);
  for (let i = 0; i < frameCount; i++) {
    await page.locator('img').screenshot({ path: resolve(qrDirectory, `frame-${i}.png`) });
    if (i + 1 < frameCount) {
      const previous = await page.locator('img').getAttribute('src');
      await frameButton.click();
      await page.waitForFunction(old => document.querySelector('img')?.getAttribute('src') !== old, previous);
    }
  }
  await writeFile(resolve(qrDirectory, 'capture.json'), JSON.stringify({ frameCount, ...cryptoSummary }, null, 2));
  const fixtureImages = await Promise.all(Array.from({ length: frameCount }, async (_, i) =>
    (await readFile(resolve(qrDirectory, `frame-${i}.png`))).toString('base64')));
  const generated = resolve('apps/authenticator/integration_test/generated');
  await mkdir(generated, { recursive: true });
  await writeFile(resolve(generated, 'qr_capture.dart'),
    '// Generated from actual Chrome-rendered synthetic QR screenshots. Do not edit.\n' +
    `const expectedRequestBytes = ${cryptoSummary.requestBytes};\n` +
    `const browserQrImages = <String>${JSON.stringify(fixtureImages)};\n`);
  await page.getByRole('button', { name: '授权 Drive 并显示实际账号' }).click();
  await page.waitForFunction(() => document.querySelector('pre')?.textContent?.includes('缺少 Google Cloud'));
  await page.screenshot({ path: 'artifacts/p1-extension.png', fullPage: true });
  const cdp = await context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await page.getByRole('button', { name: '检查后台生命周期' }).click();
  await page.waitForFunction(old => {
    try { return JSON.parse(document.querySelector('pre')?.textContent ?? '{}').bootId !== old &&
      Boolean(JSON.parse(document.querySelector('pre')?.textContent ?? '{}').bootId); } catch { return false; }
  }, first.bootId);
  const restarted = JSON.parse(await page.locator('pre').innerText());
  assert.notEqual(first.bootId, restarted.bootId);
  const version = await cdp.send('Browser.getVersion');
  await cdp.detach();
  await control.detach();
  let idleResult: object | string = 'not measured; worker explicitly stopped through CDP';
  if (checkIdle) {
    await page.evaluate(async () => {
      const api = (globalThis as unknown as { chrome: { alarms: { clearAll: () => Promise<boolean> } } }).chrome;
      await api.alarms.clearAll();
    });
    await page.close();
    console.log('Waiting 45 seconds with extension page closed and test alarms cleared to observe natural worker suspension.');
    await new Promise(resolve => setTimeout(resolve, 45000));
    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${id}/popup.html`);
    await reopened.getByRole('button', { name: '检查后台生命周期' }).click();
    await reopened.waitForFunction(() => document.querySelector('pre')?.textContent?.includes('bootId'));
    const afterIdle = JSON.parse(await reopened.locator('pre').innerText());
    idleResult = { intervalSeconds: 45, bootChanged: restarted.bootId !== afterIdle.bootId,
      alarmsClearedInTestProfile: true, debuggerDetached: true };
  }
  assert.deepEqual(pageErrors, []);
  await writeFile('artifacts/p1-browser.json', JSON.stringify({ version, extensionId: id,
    headed, pageErrors, frameCount,
    workerRestartObserved: true, qrRendered: true, profileIsolated: true, cryptoSummary,
    oauthMissingConfigurationFailsClosed: true,
    nativePasswordSetting: nativeSetting, optionalPermissionDialog: 'not exercised',
    naturalIdleSuspension: idleResult }, null, 2));
  console.log('Installed Chrome: extension loaded, QR rendered, worker stop/restart passed');
} finally { await context.close(); }
