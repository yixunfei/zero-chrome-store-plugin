import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import QRCode from 'qrcode';
import './style.css';
import { DriveProbe } from '../../drive-probe';
import { cryptoProbe } from '../../crypto-probe';

const drive = new DriveProbe();

function App() {
  const [status, setStatus] = useState('等待检查'), [qr, setQr] = useState('');
  const [authorized, setAuthorized] = useState(false), [fileId, setFileId] = useState('');
  const [frames, setFrames] = useState<Uint8Array[]>([]), [frameIndex, setFrameIndex] = useState(0);
  const run = async (task: () => Promise<unknown>) => {
    try { setStatus(JSON.stringify(await task(), null, 2)); }
    catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
  };
  const privacy = async () => {
    if (!await browser.permissions.request({ permissions: ['privacy'] })) throw new Error('未授予 privacy 权限');
    return browser.privacy.services.passwordSavingEnabled.get({});
  };
  const showQr = async () => {
    const result = await cryptoProbe();
    setFrames(result.frames); setFrameIndex(0);
    await renderFrame(result.frames[0]);
    return result.summary;
  };
  const renderFrame = async (frame: Uint8Array) => setQr(await QRCode.toDataURL(
    'ZV1:' + btoa(String.fromCharCode(...frame)), { errorCorrectionLevel: 'M', width: 360, margin: 4 }));
  return <main><header><span>ZERO VAULT / LAB 01</span><b>P1</b></header>
    <h1>先验证，<br /><em>再信任。</em></h1>
    <p>合成数据技术探针。尚未通过手机硬件、OAuth 和安全审计。</p>
    <section><button onClick={() => void run(() => browser.runtime.sendMessage({ type: 'p1-status' }))}>检查后台生命周期</button>
      <button onClick={() => void run(privacy)}>读取原生密码保存设置</button>
      <button onClick={() => void run(showQr)}>显示传输测试二维码</button>
      <button onClick={() => void run(async () => { const result = await drive.authorize(); setAuthorized(true); return result; })}>授权 Drive 并显示实际账号</button>
      {authorized && <><button onClick={() => void run(() => drive.createSyntheticFolder())}>已核对账号，创建合成测试目录</button>
        <label>另一个设备取得的文件 ID<input value={fileId} onChange={e => setFileId(e.target.value)} /></label>
        <button onClick={() => void run(() => drive.readFileMetadata(fileId))}>按 ID 验证独立授权后的访问</button></>}
    </section>
    {qr && <><img alt="仅合成数据的传输测试二维码" src={qr} />
      <button onClick={() => { const next = (frameIndex + 1) % frames.length; setFrameIndex(next); void renderFrame(frames[next]); }}>第 {frameIndex + 1} / {frames.length} 帧 · 切换</button></>}
    <pre aria-live="polite">{status}</pre>
    <footer>原生设置只读检查 · 无真实凭据输入</footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
