# Zero Browser Vault 规划文档

> 2026-10-12 执行更新：用户已确认 docs/plan-review.md 为 P1 基线并授权开始技术验证。原文中“等待审核/未开始编码/不授权开发”等阶段描述已被本次授权取代；P1 尚未验收通过。实际证据与缺口见 [P1 报告](p1-report.md)，不把候选或原型当作真机通过。

当前阶段：2026-10-12 P1 技术验证进行中，尚未放行 P2。关键产品选择已确认：独立密码库、单条暴露边界、Windows 11＋Chrome 优先、Android 14 首验、统一 Android 应用、手机扫码＋约 56 字符返回码（可自行通过通信工具传入）、存储由用户指定且默认 Google Drive、账号仅下载密文并由独立离线密钥恢复。

- [p1-report.md](p1-report.md)：本次实现、测试证据、失败项及未满足条件。
- [p1-local-validation.md](p1-local-validation.md)：追加的本机 Chrome 可见窗口、Android 原生 QR 解码、相机及错误路径实测。
- [p1-runbook.md](p1-runbook.md)：复现命令、真机/OAuth 最小条件与本地 WebDAV 环境。
- [p1-wire-format.md](p1-wire-format.md)：P1 实验字节格式与尚未实现的协议部分。

先阅读整体计划，技术推荐随该计划审核；不再重复询问已确认产品选择：

- [plan-review.md](plan-review.md)：已确认目标、技术选型、首版范围、阶段顺序及自审结论，作为整体审核入口。
- [storage-and-recovery.md](storage-and-recovery.md)：Google Drive OAuth/权限、可配置存储、同步与离线恢复。
- [offline-manual-authorization.md](offline-manual-authorization.md)：按最新反馈收敛的扫码授权方案、已接受的约 56 字符码、会话加密回传建议、Flutter 与恢复/存储取舍，优先阅读。
- [feasibility-review.md](feasibility-review.md)：逐项可行性、安全边界、推荐架构、技术候选、旧草稿问题及官方资料。
- [requirements-draft.md](requirements-draft.md)：当前需求评审版、功能与安全需求、阶段计划和验收标准（保留文件名）。
- [decision-register.md](decision-register.md)：用户已确认的产品决策、提交审核的工程选择、技术验证门槛。

以下技术文档已按当前方案统一重写，均为评审版；协议和硬件能力尚未通过原型或独立安全审计：

- [architecture.md](architecture.md)：系统边界、组件、浏览器限制和数据流。
- [threat-model.md](threat-model.md)：资产、攻击者、假设、可保证和不可保证的安全目标。
- [security-design.md](security-design.md)：密钥层级、算法、恢复、轮换和安全模式。
- [protocol.md](protocol.md)：配对、逐条授权、二维码封装和重放防护协议。
- [data-model.md](data-model.md)：同步对象、记录信封、索引和提醒数据模型。
- [roadmap.md](roadmap.md)：阶段计划、验收标准和后续决策点。
- [decisions/ADR-001-no-relay.md](decisions/ADR-001-no-relay.md)：不使用中继服务的决策。
- [decisions/ADR-002-crypto-envelope.md](decisions/ADR-002-crypto-envelope.md)：密码信封和设备密钥方案。
- [decisions/ADR-003-host-security-modes.md](decisions/ADR-003-host-security-modes.md)：保护未批准记录与受控电脑暴露边界（保留文件名）。

“规划完成”不等于“安全审计完成”。在发布前需要独立代码审计、依赖审计、协议测试和浏览器商店审核。
