# 工程推进状态

更新时间：2026-10-20。本轮重新运行本机回归、Chrome/Android 模拟器探针、扩展隔离安装和两端打包；TypeScript、Flutter、本机 pnpm 安全审计均通过。范围及阶段门槛见 [整体方案评审](plan-review.md)，证据与缺口见 [P1 技术验证报告](p1-report.md)。本地工程打包不代表产品阶段验收。

| 工作流 | 状态 | 说明 |
| --- | --- | --- |
| P1 协议与软件互操作 | 限定范围通过 | RFC 向量、TypeScript/Dart 向量、Java 双实现及本地单元测试通过；不代表独立审计 |
| P1 Chrome MV3 生命周期与 QR 传输 | 本机验证通过 | Chrome 155 独立配置；不代表真实手机硬件批准 |
| P1 Android 相机与传输解析 | 模拟器验证通过 | 2026-10-20 重新运行集成测试 3 项通过；Android 16/API 36 模拟器，没有 Android 14 真机光学或认证密钥证据 |
| P1 硬件 HPKE 与逐次认证 | 阻塞 | HPKE 库没有已验证的 Android Keystore 不可导出私钥适配；认证 ECDH 的可用语义尚未证明 |
| P1 Google Drive OAuth | 待外部条件 | 没有 Cloud 项目、扩展 ID 绑定 OAuth 客户端或授权测试 |
| 核心批准与填充产品流程 | 未实现 | 当前 Flutter 与扩展都是探针；软件 `ApprovalProbe` 不作为产品授权边界 |
| CSV 迁移、加密备份、恢复 | 未实现 | 当前恢复代码仅用于软件向量/实验，缺少完整备份格式和手机恢复流程 |
| 全量同步与多设备 | 未完成 | WebDAV 探针及软件故障模型存在；父提交闭包、提交 DAG 接收、真实 Drive 多端和完整恢复仍未完成 |
| 本机交付打包 | 已实现并复验 | Windows PowerShell 脚本生成 Chrome ZIP 和 Android Debug APK；Chrome 隔离配置一键安装及 Android ADB 安装/启动均已执行 |
| 正式发布 | 未放行 | 缺失真机验证、生产密钥策略、独立审计、隐私/商店资料及正式 APK 签名 |

本轮工程检查：`pnpm test`（9 组）、TypeScript 类型检查、扩展类型检查/构建/Chrome 探针、Flutter 分析与单元测试（3 项）、Android 模拟器集成测试（3 项）、`pnpm audit --audit-level=low` 均通过。Android 集成验证脚本现在可以从 `ANDROID_SDK_ROOT`、`ANDROID_HOME` 或项目 `local.properties` 查找 ADB，避免仅因 ADB 未加入 PATH 而失败。以上只证明当前本机/模拟器条件下的工程行为。

不可绕过的顺序：先解决硬件私钥 HPKE/认证可行性并获取 Android 14 真机证据，再实现受该能力保护的逐条审批闭环。没有该证据之前，继续完善无密钥威胁模型的验证工具，不把模拟器或软件密钥结果描述成可用密码管理产品。
