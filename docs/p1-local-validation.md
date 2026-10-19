# 本地 Chrome 与 Android 模拟器验证

2026-10-12，延续 P1。使用合成数据，用户授权在本地浏览器和模拟器继续验证。没有发起 Google OAuth、使用真实密码或改动用户常用 Chrome 配置。

为保护本机浏览器配置和临时合成数据，原始截图、JSON 运行日志与 ADB 日志位于本地忽略的 `artifacts/` 目录，不随公开源码仓库推送。本文保留测试条件及结论；复现步骤见 [P1 复现手册](p1-runbook.md)。

## 已实际执行

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 本机 Chrome 155 可见窗口 | 扩展正常加载，页面无 JS 异常；HPKE、56 字符码、会话响应通过 | 本地忽略产物 `artifacts/p1-browser.json`、`p1-extension.png` |
| 隔离配置原生保存设置 | 读取 true，设置 false 后读回，测试结束清除扩展覆盖 | privacy 在测试副本预授予，不代表权限弹窗或企业策略验收 |
| MV3 强制停止与唤醒 | worker 重启后 bootId 改变 | 同上 |
| MV3 自然休眠与唤醒 | 无 worker 调试附加、全部 CDP 断开 45 秒后 bootId 改变 | `artifacts/p1-browser-idle.json` |
| Chrome → Android 原生二维码解码 | 保存扩展 img 元素实际渲染的 PNG；Android mobile_scanner/ML Kit 识别 2 帧，倒序重组 717 字节，摘要校验通过 | `artifacts/p1-local-android-validation.json` 的 decoder |
| 手机页面按钮 | 真实点击能力检查及签名；显示 native 结果，失败不产生授权，不使用 mock MethodChannel | 同上 ui |
| 模拟器后置摄像头 | 两次进入扫码页均打开 1392×1856 预览，退出及重新进入无框架异常 | 同上 camera |
| 前后台状态处理 | 在模拟器注入 Flutter inactive/resumed 生命周期事件，确认原生相机停止/重启 | 同上 camera；这是框架事件测试，不冒充真实 Home/锁屏测试 |
| Android 集成测试 | 3 项通过，进程 exitCode=0 | `scripts/android-local-validation.ts`；完整日志在 `artifacts/local/android-validation.log` |

2026-10-19 再次执行同一 Android 集成入口，`emulator-5554` 的 UI 能力检查、原生 QR 解码和相机循环 3 项通过，进程 exitCode=0；相机预览连续两次返回 1392×1856，停用/恢复事件和退出重进均通过。第一次相机循环等待超时，第二次重试通过；这只是当前 API 36 模拟器结果，不是 Android 14 真机证据。扩展原生 QR fixture 改为受控的合成测试源码，避免将约 58 KB 图片 Base64 作为 Gradle 命令行参数导致 Windows 进程长度超限；原始截图和运行日志仍不入库。

当前模拟器为 Android 16/API36，AVD `ZeroInputReview20260928`，不是 Android 14。没有修改其锁屏、登记指纹、相机类型或其他应用数据。它使用 emulated 摄像头；二维码识读使用原生图片解码 API，**不是摄像头拍摄电脑屏幕**。组帧成功仍不代表请求验签或手机批准。

## 密钥检查结论

增加原生诊断 `deviceSecure` 和 `strongBiometricStatus`，实际得到：

- `deviceSecure=false`：没有安全锁屏。
- `strongBiometricStatus=11`：`BIOMETRIC_ERROR_NONE_ENROLLED`，未登记强生物识别。
- per-use 与 30 秒窗口 ECDH 密钥生成均为 `InvalidAlgorithmParameterException`；签名按钮显示 `PROBE_FAILED: InvalidAlgorithmParameterException`。

因此当前环境缺少带认证密钥的前置条件；不能把这次异常当作 Android 14 硬件或 HPKE 的失败证明。也没有成功的认证签名/ECDH 证据，不为完成测试而静默改用无认证密钥。

## 发现及修复

`mobile_scanner 7.4.2` 仅在使用内部 controller 时自行登记生命周期观察器；本项目提供外部 controller，原先没有停止/恢复逻辑。已在 `scanner_probe.dart` 增加观察器和串行的相机状态切换；已完成的扫码不会因恢复前台重新启动。新增模拟器回归验证原生相机状态。

测试基建首次尝试将 PNG 放到尚未安装的应用外部目录，触发 Android 权限错误；现改为将合成 QR 截图编码为受控的 Dart fixture 随 integration_test 编译，再写入应用自己的临时目录，测试结束清理。fixture 只包含合成请求，原始 PNG 与运行日志仍在忽略目录。没有扩大应用存储权限。测试宿主仅为本项目的临时安装授予 CAMERA；没有自动操作生物识别或 Google 登录。

## MV3 空闲检查

Playwright 可见窗口测试中，关闭扩展页、清除测试 alarms 并等待 45 秒后 bootId 未变。该结果不说明产品必须保持后台存活：Playwright 可能仍自动附加 service worker。

新增 `browser-idle-validation.ts` 采用最小 CDP 连接，从不附加 worker，测量窗口内关闭全部 CDP 连接，避免此干扰。**该独立测试通过：45 秒后再次请求时 bootId 改变，观察到自然休眠及重新唤醒。** 结果见 `artifacts/p1-browser-idle.json`；只能证明该本机 Chrome/测试条件，不能覆盖所有事件、企业策略或浏览器版本。

## 复现

从项目根目录运行，保持 emulator-5554 可用：

```powershell
pnpm build:extension
pnpm exec tsx scripts/browser-probe.ts --headed --idle
pnpm exec tsx scripts/browser-idle-validation.ts
pnpm exec tsx scripts/android-local-validation.ts
```

第一条浏览器脚本会刷新已纳入仓库的 `apps/authenticator/integration_test/generated/qr_capture.dart`，之后再运行 Android 集成测试。fixture 仅含合成请求密文；截图、JSON 运行日志和浏览器配置仍在忽略目录，不加入正式 App 资源。Android 脚本会等待测试 App 安装，然后授予该测试 App 相机权限，记录 UI、原生解码和相机结果；Flutter 测试结束会移除临时安装。

仍未完成：真机屏幕扫码、Android14 硬件 HPKE/认证、真实系统 Home/锁屏认证取消、Drive OAuth、多设备授权和完整恢复。P1 仍不放行 P2。

测试结束后已重新构建普通 Debug APK，安装并启动 `dev.zerovault.zero_vault_probe/.MainActivity`，ADB 返回 `Status: ok`。当前模拟器打开的是正常探针首页，不是测试入口；没有修改其他应用。APK 路径：`apps/authenticator/build/app/outputs/flutter-apk/app-debug.apk`。
