# 数据模型

> 2026-10-12 执行更新：用户已确认 docs/plan-review.md 为 P1 基线并授权开始技术验证。原文中“等待审核/未开始编码/不授权开发”等阶段描述已被本次授权取代；P1 尚未验收通过。实际证据与缺口见 [P1 报告](p1-report.md)，不把候选或原型当作真机通过。

2026-10-12 逻辑模型评审版。字段名称用于讨论，二进制格式和签名规范须在 P1 冻结；本项目不兼容此前未发布的草稿格式。

## 1. 共同规则

对象带 schemaVersion、对象类型与套件标识，使用受限规范编码。未知必需字段/算法应拒绝；签名与 AEAD 上下文有明确域隔离。对象名使用随机标识，不编码域名和用户名。

## 2. 核心对象

| 对象 | 主要字段 | 约束 |
| --- | --- | --- |
| VaultDescriptor | vaultId、协议版本、手机签名/加密公钥、恢复公钥、目录密钥信封、身份变更凭证 | 无私钥；初始指纹核对，更换不可静默接受 |
| RecordRevision | vaultId、recordId、revisionId、parentRevisionIds、suite、payloadNonce、payloadCiphertext、recipientEnvelopes、作者身份及签名 | 每个内容版本独立 K_record；浏览器作者签名不等于手机已核验 |
| CredentialPayload | canonicalOrigin、username、password、必要账号上下文 | 当前密钥仅保护本次允许释放的凭据字段；备注/TOTP 等另立对象 |
| RecipientEnvelope | recipientId、suite、HPKE encapsulation、wrappedRecordKey、contextDigest | 分别封装给手机与恢复公钥；绑定库/记录/版本及 payload 摘要 |
| PhoneApproval | vaultId、recordId、revisionId、envelopeDigest、签署设备、核验状态及签名 | 手机认可记录内容，不代表批准以后每次自动释放 |
| DirectoryObject | 目录版本、加密的 recordId/revisionId 与域名/非敏感别名映射、nonce、密钥版本 | 仅 K_directory 可解开；不存用户名/密码，不作为手机可信来源 |
| DeviceGrant | 电脑公钥/指纹、设备标识、手机端记录权限、状态 | 私钥与云 OAuth 凭据不跟随浏览器账号同步 |
| SyncCommit | commitId、父提交、对象 ID/摘要列表、作者签名、操作类型 | 全部引用可验证才发布可用快照；不可假设多文件事务 |
| Tombstone | 记录 ID、父版本、删除操作与来源 | 保留并发关系，不靠当前时间覆盖更新 |
| Reminder | 记录引用、手机本地批准时间、remindAt、延期/完成状态 | 默认仅手机本地；锁屏不展示敏感内容 |

目录使用独立密钥且电脑获准持有，解决本地匹配；其泄露只暴露目录，不解锁凭据。对域名、父版本和收件方的篡改必须受到相应认证绑定保护。

## 3. 请求与响应

AuthorizationRequest 包含设备认证、库/记录/版本、对应完整信封、核验凭证或未核验标志、随机挑战、手机需核对的动作与页面声明、返回格式；会话返回格式还包含临时公钥。不能只提供 recordId 而让离线手机自行联网找密码。

ManualCode 是 K_record 的约 52 字符 Base32 与约 4 字符错误检测。它本身没有可信时间/挑战字段，不是一次性令牌。输入端按当前选定记录执行 AEAD 验证。

EncryptedResponse 包含明确类型标识、请求摘要、HPKE 参数、密文和手机签名；加密 payload 仅含需要释放的凭据字段。校验失败不能转按 ManualCode 处理。

DirectoryGrant 是配对阶段的独立能力传递，封装 K_directory 给已配对电脑；不是批量凭据授权，不混用单条解密接口。

## 4. 备份与恢复文件

EncryptedVaultBackup 保存描述符、凭据信封、加密目录、核验凭证和完整性资料，不含手机/恢复私钥、云令牌或桌面设备私钥。加密包不能漏掉恢复信封；只保存 manifest 不构成完整备份。

RecoveryMaterial 是独立离线文件，包含恢复私密材料、库标识和算法/完整性资料；若设置保护口令，携带 Argon2id 参数与文件加密头。它与普通密文备份不能混为同一个默认云上传对象。

## 5. 同步版本语义

revisionId 使用不依赖本地时钟的唯一标识，父版本关系用于判断并发。手机检查点与云端提交历史分开；客户端签名可用于追踪来源，但不能将受控电脑声明当作手机授权。

同步流程、部分上传和删除恢复见 [存储与恢复](storage-and-recovery.md)。具体对象大小、分帧和历史保留上限由合成 1000 条记录及故障原型确定。
