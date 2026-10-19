# P1 复现与待补条件

仅使用合成数据。依赖版本及锁文件已写入；不在命令中提交真实密码或令牌。打包产物和验证日志均不纳入 Git。

## 本机检查

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm bench
pnpm build:extension
pnpm --dir apps/extension typecheck
pnpm exec tsx scripts/browser-probe.ts
```

扩展和 Android 本地打包入口见 [P1 打包与安装](p1-packaging.md)。Android 安装仅对用户明确指定的 ADB 设备执行；Chrome 安装使用独立开发配置。

浏览器脚本使用独立 `artifacts/local/chrome-probe-profile`，通过浏览器级 CDP 加载扩展。测试副本预授予 privacy，仅修改独立配置文件的原生保存开关并在 finally 清除覆盖；不碰用户常用配置。无摄像头、剪贴板、全站 host 权限。基础脚本验证强制停止 service worker；独立 idle 脚本补充不附加 worker 的自然休眠验证，企业策略仍未测。

追加验证可用 `pnpm exec tsx scripts/browser-probe.ts --headed --idle`、`pnpm exec tsx scripts/browser-idle-validation.ts` 和 `pnpm exec tsx scripts/android-local-validation.ts`。按此先浏览器后 Android 的顺序生成真实 QR 图片 fixture，详见 [本地验证报告](p1-local-validation.md)。

软件 HPKE 双实现检查：

```powershell
pnpm exec tsx scripts/interop.ts
java -cp 'artifacts/local/bcprov-1.81.jar;artifacts/local/gson-2.13.1.jar' scripts/java/HpkeInterop.java
pnpm exec tsx scripts/interop.ts verify
```

首次须从 Maven Central 下载 `bcprov-jdk18on:1.81` 和 `gson:2.13.1` 到上述位置。SHA256 分别为 `249f396412b0c0ce67f25c8197da757b241b8be3ec4199386c00704a2457459b`、`94855942d4992f112946d3de1c334e709237b8126d8130bf07807c018a4a2120`。不要把这里的软件私钥移植为手机长期密钥。

## Android 14 最小条件

需要一台可连接 ADB 的 Android 14 真机、系统安全锁屏、已登记的强生物识别，以及用户亲自在手机上确认认证。当前仅连接 Android 16 模拟器；不要将模拟器视为等价条件。SDK 许可提示仍在，现有本机 SDK 已能构建；将来确需新组件许可时由用户阅读接受，不自动代签。

```powershell
Set-Location apps/authenticator
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
flutter devices
flutter run -d <实际真机ID>
```

手机依次执行能力检查、认证签名、ECDH 窗口测试；记录 API、型号、KeyInfo securityLevel、认证硬件约束、不可导出状态、拒绝/取消/后台切换/重新认证结果。30 秒窗口是诊断对照，不是每次释放方案。探针在自己的 `zv.p1.*` 命名空间重建密钥，不接触其他应用密钥。

扫码：在 Chrome 加载 `apps/extension/.output/chrome-mv3`，点击“显示传输测试二维码”；手机进入“扫描合成请求”，手动切换电脑各帧。当前只报告传输完整性，不会发出批准。返回码的 TS/Dart 向量测试已执行，手机 HPKE 全闭环还没有实现。

## Google Drive 最小条件

用户准备 Google Cloud 项目，启用 Drive API，配置同意屏幕/测试账号，以及绑定稳定扩展 ID 的公开 Chrome Extension OAuth client ID。不需要 client secret，不要提供账号密码。当前没有这些项目配置，也未登录、发起 OAuth 或上传 Drive。

设置 `ZV_GOOGLE_CLIENT_ID` 后重新构建并加载扩展（扩展 ID 必须与客户端匹配）。点击授权后核对 Drive about 返回的实际 emailAddress/displayName/permissionId；之后单独点击创建可见合成目录。第二台电脑使用同一应用的正确客户端配置独立授权，再将第一个设备真实 fileId/folderId 输入探针验证访问。

仍需分别验证 Chrome 第二配置/第二设备、未来 Android 客户端、选中旧文件夹与旧子文件的授权差异、拒绝/撤权/过期/限流。不能根据目录名或 Chrome 登录状态推断权限，不能扩大到全 Drive scope 掩盖失败。当前探针只有授权身份/目录创建/按 ID 元数据读取，不是自动同步适配器。

## WebDAV

由 `scripts/setup-webdav.ps1 -DockerRoot <本机 Docker 工作区>` 在本机 Docker 中启动隔离 HTTPS 测试服务。脚本生成测试证书和随机密码，只保存在该本机工作区；不要提交这些材料。

```powershell
$env:ZV_DOCKER_ROOT = '<本机 Docker 工作区>'
$env:NODE_EXTRA_CA_CERTS = Join-Path $env:ZV_DOCKER_ROOT 'containers/zero-vault-p1/secrets/server.crt'
& ./scripts/setup-webdav.ps1 -DockerRoot $env:ZV_DOCKER_ROOT
$testRoot = Join-Path $env:ZV_DOCKER_ROOT 'containers/zero-vault-p1'
$env:ZV_WEBDAV_URL = 'https://127.0.0.1:18443/'
$env:ZV_WEBDAV_USERNAME = 'p1probe'
$env:ZV_WEBDAV_PASSWORD = [IO.File]::ReadAllText("$testRoot/secrets/password.txt").Trim()
docker compose -f "$testRoot/compose.yaml" up -d
pnpm exec tsx scripts/webdav-probe.ts
pnpm exec tsx scripts/webdav-scale.ts
Remove-Item Env:ZV_WEBDAV_URL,Env:ZV_WEBDAV_USERNAME,Env:ZV_WEBDAV_PASSWORD,Env:NODE_EXTRA_CA_CERTS
```

测试使用有效校验的 HTTPS，自签信任只作用于测试进程。并发同名条件创建检查可能返回两次成功，报告会记为失败能力；不得据此启用 CAS/锁。生产级枚举解析、超时重试、提交 DAG 和原子能力替代方案仍待设计。测试保留合成对象，停止容器不会删数据。
