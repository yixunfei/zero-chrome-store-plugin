# 本地打包与安装

当前工程仍是只处理合成数据的 P1 探针。扩展 ZIP 和 Android Debug APK 用于技术验证，不是可管理真实密码的发行版本。

## Chrome 扩展

```powershell
pnpm package:extension
pnpm install:extension
```

`package:extension` 构建 MV3 扩展并生成 `dist/extension/zero-vault-p1-chrome.zip`，同时输出 SHA-256。该 ZIP 可供本地归档或 Chrome Web Store 提交；商店审核、稳定扩展 ID 和 OAuth 配置另行处理。

`install:extension` 会在该仓库 `dist/chrome-development-profile-*` 下启动一次性独立 Chrome 配置，通过本地 DevTools 将未打包扩展加载到该开发配置。不会改变日常 Chrome 配置。普通 Chrome 日常配置不能被本地脚本静默安装未上架扩展；该命令的“安装”只针对隔离的开发配置。隔离配置名会传给启动器，安装结束后保留浏览器窗口供本地验证。

若测试 Drive OAuth，先为正式扩展 ID 配置公开 OAuth client ID，然后在构建之前设置 `ZV_GOOGLE_CLIENT_ID`。扩展是公开客户端，不能将 client secret 放进仓库或包内。项目目前只有 Drive 授权探针，没有 Drive 同步适配器。

## Android APK

```powershell
pnpm package:android
pnpm install:android
```

构建结果复制到 `dist/android/zero-vault-p1-debug.apk` 并输出 SHA-256。此 APK 使用 Flutter/Gradle Debug 签名，只适合本地测试，不能作为正式发布包。正式签名、持久 release keystore 管理和应用商店发布尚未配置。

`install:android` 要求 ADB 可用。连接一台设备时可自动选择；有多台时请直接运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-android.ps1 -Install -DeviceId <adb-device-id>
```

脚本会构建、复制 APK，再通过 `adb install -r` 安装并启动探针。它不接受/模拟生物识别，不更改手机安全设置。无连接设备时，打包仍然完成，安装步骤给出错误提示。

## 发布门槛

- P1 未通过 Android 14 真机认证密钥、不可导出私钥 HPKE 接入、Drive OAuth 多设备访问与完整恢复演练。
- 当前发布签名使用 Debug key。不要把 APK 当作正式手机应用发布。
- 扩展与手机端仍没有完整配对、逐条批准和安全填充的产品闭环。
- 本机 `dist/`、浏览器 profile、Android 构建目录和验证运行产物均被 Git 忽略；提交只包含源代码、测试与文档。
