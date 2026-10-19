# Zero Browser Vault — P1 实验台

仅使用合成数据。尚未通过 Android 硬件闭环、真实 OAuth 或独立审计，禁止用于真实密码。

规划入口：[docs/README.md](docs/README.md)。执行结果与外部条件见 [docs/p1-report.md](docs/p1-report.md)。

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm bench
pnpm build:extension
pnpm --dir apps/extension typecheck
pnpm --dir apps/authenticator exec flutter analyze
pnpm --dir apps/authenticator exec flutter test
```

Windows 打包入口：

```powershell
pnpm package:extension
pnpm install:extension
pnpm package:android
pnpm install:android
```

安装参数只用于本机验证：Chrome 使用独立开发配置；Android 安装 Debug APK 到唯一连接设备（或直接运行脚本并指定 `-DeviceId`）。产物和本地 Chrome 配置放在被忽略的 `dist/` 下。安装说明和限制见 [docs/p1-packaging.md](docs/p1-packaging.md)。

`packages/` 为隔离的 P1 协议及存储实验；软件密钥只用于测试。`apps/extension` 为 MV3 探针，`apps/authenticator` 为 Flutter/Keystore 能力探针。它们不是 P2 密码管理产品。硬件/OAuth 条件和整体实现状态见 [docs/implementation-status.md](docs/implementation-status.md)。
