# P1 技术验证报告

2026-10-12。**状态：P1 已开始并完成本机可执行的首批验证，尚未通过阶段验收，不进入 P2。** 用户本次已确认 `plan-review.md` 为基线；无需再次确认已定产品选择。本报告区分已实现、真实运行结果和外部条件，任何原型均禁止用于真实密码。

## 实际修改

2026-10-19 延续工程工作：同步提交入口现在会在网络写入前检查对象 ID/大小、签名提交结构、操作与对象引用的一致性及对象摘要；上传完成后验证提交读回。修订图计算改为有界迭代遍历，避免深链递归耗尽调用栈。新增对应错误路径测试；打包入口和限制见 [P1 打包与安装](p1-packaging.md)。

2026-10-20 本轮复验：TypeScript 9 组、类型检查、扩展类型检查和构建、Flutter 分析及 3 项单元测试、pnpm 依赖审计均通过；Chrome 合成数据探针验证加载、二维码与后台停止/唤醒；Android 16/API 36 模拟器集成验证的 UI、二维码原生解码、相机循环 3 项通过。两个打包产物重新生成，APK 安装并启动成功，扩展在新的隔离 Chrome 配置加载成功。模拟器证据仍不覆盖 Android 14 硬件密钥、真实摄像头光学扫码或认证；pnpm 审计也不等同于整个 Flutter/Android 依赖栈的独立审计。

后续本地浏览器/模拟器实测已补充至 [p1-local-validation.md](p1-local-validation.md)：Chrome 实际渲染二维码在 Android 原生库解码与倒序组帧通过；相机页面往返和框架前后台事件通过，并修复外部 scanner controller 生命周期遗漏。模拟器未设安全锁屏、未登记强生物识别，仍不能验证认证绑定密钥。

- 建立 pnpm 工作区、固定依赖和锁文件；TypeScript 的受限 CBOR、标准 HPKE 适配、独立记录密钥、目录能力、56 字符码、会话响应、分帧及提交实验模块。
- 新建 WXT/React MV3 验证扩展：真实浏览器密码操作测试、二维码生成、生命周期及原生保存设置探针、缺少配置时拒绝发起的 Drive 探针。没有网页填充或真实凭据输入功能。
- 新建 Flutter/Kotlin Android 探针：Keystore 诊断、实际认证签名和 ECDH 窗口实验入口；手机扫码仅验证传输，长期私钥不返回 Dart。minSdk=31 是候选编译配置，不是支持声明。
- 建立 TypeScript/Dart 编码向量、RFC HPKE 向量、Java 双向互操作、安全负例、同步故障测试与 1000 条规模脚本。
- 按用户确认创建本机 HTTPS WebDAV 和随机测试账户；部署资源位于本机隔离的 Docker 工作区，不触碰其他容器。

## 环境证据

| 项目 | 实际结果 |
| --- | --- |
| 工作区 | 原始工程已有 pnpm/Flutter 项目和 P1 文档；本次补充同步边界、打包脚本及验证文档 |
| Windows | Windows 11 23H2，build 22631.6199 |
| Node / pnpm | 22.17.0 / 12.9.1 |
| Flutter / Dart | 3.44.1 / 3.12.1 |
| Android SDK | 当前 Flutter doctor 检测到 Android API 37 工具链；已生成 Debug APK 并在 API 36 模拟器安装/启动 |
| Java | 命令行 JDK 17；Flutter 使用 Android Studio JBR 21 |
| Chrome | 已安装 Chrome 155；使用独立配置运行扩展验证；追加独立 CDP 自然休眠测试通过 |
| ADB | 可用设备仅有 emulator-5554，Android 16/API36；未发现 Android 14 真机 |
| Docker | 本机 desktop-linux，29.5.2，Compose 5.1.3；DataFolder 与 VHDX 位于 M 盘指定根内 |
| 验证产物 | JSON 运行日志、截图、浏览器配置与构建产物留在本地忽略目录；仓库仅提交可复现源代码和文档 |

## 已通过与证据

| 验证 | 结果 / 范围 | 证据 |
| --- | --- | --- |
| TypeScript | 9 组测试通过，含 257 个 RFC HPKE 解密向量；类型检查通过 | `pnpm test`、`pnpm typecheck` |
| 软件库互操作 | @hpke/core 1.9.0 与 Bouncy Castle 1.81 双向 HPKE 成功，BC 同样通过 257 个标准向量 | `scripts/interop.ts`、`scripts/java/HpkeInterop.java` |
| 单条保护 | A 密钥不能解 B/未来版本，错收件方和篡改拒绝；恢复私钥可打开合成记录 | `tests/protocol.test.ts` |
| 审批实验 | 未配对/无权限/不同检查点/重复挑战拒绝；显示内容来自解密记录；会话签名、请求摘要、临时密钥绑定及并发消费检查通过 | 仅内存软件 ApprovalProbe，不是 Android 审批产品 |
| 人工码与帧 | 56 字符、规范尾位、输错拒绝；TS→Dart 固定码与帧向量通过，乱序/重复/超时/嵌套超限覆盖 | `packages/test-vectors`；Flutter 3 个测试通过 |
| Chrome MV3 | 扩展构建/类型检查、HPKE/码/会话在浏览器执行、QR 渲染、强制停后台后重启通过 | `pnpm exec tsx scripts/browser-probe.ts`；原始日志为本机忽略产物 |
| 原生保存设置 | 隔离配置中读取、设 false 并读回成功，finally 清除覆盖 | 测试副本预授予 privacy；未验真实权限弹窗/企业控制/已有密码行为 |
| Flutter/Kotlin | 分析、Dart 测试、Debug APK 构建；模拟器原生通道执行成功 | Flutter analyze/test、APK 构建及模拟器探针；不代表硬件调用成功 |
| WebDAV 基础 | 实际 HTTPS PUT/GET/HEAD/DELETE、PROPFIND、401、ETag 412、幂等重复、重定向拒绝通过 | `artifacts/p1-webdav.json` |
| 同步故障模型 | 部分上传不发布提交，缺失/损坏引用拒绝，更新/删除竞争保留双头，显式合并和循环检测通过 | `tests/sync.test.ts`；内存故障注入，不冒充真实断网全场景 |
| 依赖通告 | P1 基线 pnpm audit 返回已知漏洞 0 | 历史本地检查；非独立审计，不覆盖 Maven/Flutter 全栈 |

## 规模结果

软件基准：50/100/500/1000 条按真实字段格式加密，逐条恢复解密，目录按 100 条分片加密并读回。1000 条记录 623,993 字节，目录 127,528 字节；样本最大请求 902 字节、2 帧，约 2.1 秒。包括密码长度变化和中文账号；不是字段上限/最坏负载。

真实 WebDAV：另一批 1000 条记录 609,993 字节，20 个签名提交共 193,594 字节；实际上传、读回、引用校验与恢复解密全部成功，约 21.0 秒。按脚本计算 4,040 次 HTTP 请求，排除头部/TLS 开销；**这是本机回环性能，不是公网估计**。没有测量实际线上带宽，也没有完成整个库的备份文件或新手机重封装。

原始 JSON 数据只保存在本地 `artifacts/` 忽略目录，可按 [P1 复现手册](p1-runbook.md) 重新生成。WebDAV 合成密文留在独立测试目录；恢复测试密钥在运行进程内，不向服务器上传。

## 失败、修复及技术调整

1. **Android 14 per-operation ECDH 的 API 衔接尚不可直接成立。** 检查 Android 14 AOSP `BiometricPrompt.CryptoObject`，支持 Signature/Cipher/Mac 等但没有 KeyAgreement 构造器。不能把 `local_auth=true` 等同密钥认证。探针同时提供实际签名与 30 秒认证窗口 ECDH 对照，但后者不能当作逐次密钥使用保证；尚未选为生产方案。
2. **成熟 HPKE 与 Keystore 私钥尚未接通。** Bouncy Castle HPKE receiver 接收库内 `AsymmetricCipherKeyPair`，并非 JCA Android 不可导出 PrivateKey。软件互操作不能解决这个接口问题。下一步调查可注入硬件 ECDH 的成熟实现/上游接口；若要库扩展，需单独评审、标准向量和独立审计，不能临时手写 HPKE 密钥调度。
3. **模拟器密钥生成失败。** per-use 与 30 秒窗口均返回 `InvalidAlgorithmParameterException`；后续本地验证确认 `deviceSecure=false`、`strongBiometricStatus=11`（未登记）。未替用户设置锁屏/登记认证，不能据此推断真实手机或 API31 可用/不可用。真实 TEE/StrongBox、认证硬件执行、认证失败/后台取消待测。
4. **WebDAV 同名条件创建不是原子。** Apache 2.4.65 上两个不同内容的同时 `If-None-Match:*` PUT 都成功。该能力未通过，不得将适配器 `putIfAbsent` 名字当作服务保证。沿用随机独立对象 ID、不可变提交和显式冲突方向；P4 前增加可重复竞态检验、对象哈希复核、签名 DAG/父闭包和能力拒绝机制。不要用“支持 ETag”代替同步正确性结论。
5. **Alpine 镜像失败。** httpd:2.4.65-alpine 缺少 APR DBM 驱动，PUT=500，已改为固定 digest 的 Debian httpd:2.4.65。镜像归档保留，未影响其他环境。
6. **实现中的并发消费问题已修复。** 首轮测试发现会话验签期间并发进入导致双重接受；增加同步状态复核并保留测试。软件 phone challenge 同样在异步校验后复核。
7. **构建/浏览器工具问题已处理。** Chrome 命令行加载失败后改为隔离 browser-level CDP；Playwright 默认禁用扩展参数已显式移除。下载的 Playwright Chromium 无法启动，没有用其冒充 Chrome。Windows C/L 跨盘 Kotlin 增量缓存失败，通过项目级关闭该缓存处理，不改系统配置。

参考：[Android 14 BiometricPrompt 源码](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-14.0.0_r1/core/java/android/hardware/biometrics/BiometricPrompt.java)、[KeyGenParameterSpec](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec.Builder#setUserAuthenticationParameters(int,int))、[Bouncy Castle HPKE](https://github.com/bcgit/bc-java/blob/main/core/src/main/java/org/bouncycastle/crypto/hpke/HPKE.java)。这些是接口证据，不是假定的真机结果。

## 未完成与最小外部条件

- **Android 14 真机**：ADB 连接、锁屏及强生物识别登记，用户亲自在机上操作；具体步骤见 runbook。仍需研发 HPKE 硬件适配、审批状态/可信显示/持久检查点；拿到手机并不会自动补齐这些实现。
- **Google Cloud/OAuth**：启用 Drive API 的项目、绑定稳定扩展 ID 的公开客户端 ID/测试账号；不需要 client secret 或 Google 密码。真实授权账号显示、drive.file 目录与多设备/跨客户端访问全部未执行。
- **手机扫码闭环**：已有相机和有界组帧原型，但未完成屏幕→真机摄像头的光学测试，也未实现 Android HPKE→两种返回路径全链路。
- **同步/恢复**：完整备份描述符、目录恢复信封、PhoneApproval 凭证、提交 DAG/设备授权验证、真实网络部分故障/限流、旧手机缺失后重封装和重新配对未完成。当前测试不构成可恢复产品。
- 本机独立 CDP 检查已观察到 45 秒空闲后的 MV3 休眠/唤醒；Chrome 真实可选权限提示、企业策略与其他生命周期场景仍需检查。
- **独立安全审计尚未进行。** 应用协议目前为可审阅的实验元组，不冻结为发布协议。

## 后续顺序

继续停留在 P1：优先解决不可导出硬件 ECDH 与成熟 HPKE/认证的衔接，完成 Android 14 真机实验；并行条件具备后人工完成 Drive OAuth 多设备矩阵，再执行扫码授权及完整恢复试验。若上述组合需要改变认证策略或最低系统版本，应拿到实际证据后单独提交调整；现在不擅自降级或提高最低版本。P2–P6 顺序及已确认产品边界不变。

复现入口：[p1-runbook.md](p1-runbook.md)；格式细节：[p1-wire-format.md](p1-wire-format.md)。
