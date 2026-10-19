import { spawn, execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const exec = promisify(execFile);
const adb = process.env.ADB_PATH ?? 'adb';
const device = process.env.P1_ANDROID_DEVICE ?? 'emulator-5554';
const application = 'dev.zerovault.zero_vault_probe';
const evidence: Record<string, unknown> = {};
let output = '', buffer = '';
let permissionTask: Promise<void> | undefined;
await mkdir('artifacts', { recursive: true });

async function grantCamera(marker: string) {
  if (!/^\/data\/user\/0\/dev\.zerovault\.zero_vault_probe\/(?:cache|code_cache)\/p1-camera-ready$/.test(marker)) {
    throw new Error('Unexpected camera barrier path');
  }
  await exec(adb, ['-s', device, 'shell', 'pm', 'grant', application, 'android.permission.CAMERA']);
  await exec(adb, ['-s', device, 'shell', 'run-as', application, 'touch', marker]);
}

function line(text: string) {
  if (text.startsWith('P1_CAMERA_READY=')) {
    permissionTask = grantCamera(text.slice('P1_CAMERA_READY='.length).trim());
    // Record a rejected barrier without an unhandled rejection during the device wait.
    void permissionTask.catch(error => { evidence.cameraPermissionError = String(error); });
  }
  const match = text.match(/^P1_(UI|DECODER|CAMERA)_RESULT=(\{.*\})$/);
  if (match) evidence[match[1].toLowerCase()] = JSON.parse(match[2]);
  if (/P1_|All tests passed|Some tests failed|\[E\]/.test(text)) console.log(text);
}

const command = 'flutter test integration_test/local_validation_test.dart integration_test/camera_validation_test.dart -d emulator-5554; exit $LASTEXITCODE';
const child = spawn('pwsh', ['-NoProfile', '-Command', command], {
  cwd: resolve('apps/authenticator'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', data => {
  output += String(data); buffer += String(data);
  const lines = buffer.split(/\r?\n/); buffer = lines.pop()!;
  lines.forEach(line);
});
child.stderr.on('data', data => { output += String(data); });
const code = await new Promise<number | null>((resolve, reject) => {
  child.on('error', reject); child.on('close', resolve);
});
if (buffer) line(buffer);
try { await permissionTask; } catch { /* failure already recorded */ }
await writeFile('artifacts/local/android-validation.log', output);
await writeFile('artifacts/p1-local-android-validation.json', JSON.stringify({
  device, testExitCode: code, ...evidence,
  limit: 'Emulator only; no physical hardware/biometric/optical approval claim.',
}, null, 2));
if (code !== 0) throw new Error('Android integration tests failed; see artifacts/local/android-validation.log');
