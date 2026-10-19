# P1 实验字节格式（不是发布冻结版）

2026-10-12。实现：`packages/protocol`；不兼容旧草稿。仅合成数据，缺少手机完整审批实现和独立审计，不能当作 P2 协议验收。

## 编码与限额

CBOR 使用确定长度数组、最短非负安全整数、UTF-8 文本、字节串、布尔和 null。禁止 map、tag、浮点、负数及不定长；TypeScript 解码后重编码逐字节比较。深度 ≤16，数组元素 ≤2048，单文本 ≤8192 JS 字符，单对象 ≤32768 字节。应用对象用数组固定字段顺序，长度/类型/版本须相符。

HPKE 标识 `HPKE-0010-0001-0002`：DHKEM P-256/HKDF-SHA256/AES256GCM，base mode。公钥为 65 字节 SEC1 uncompressed。HPKE info 与 AAD 都取对应 context 的 CBOR。签名为 ECDSA P-256/SHA-256，64 字节 P1363 r||s；签名输入为 CBOR `[domain, body]`。Android 原生签名默认 DER，当前探针仅验证操作，尚未实现应用签名格式转换。

## 固定元组

下列 `1` 为实验版本，所有 digest 均为 SHA-256。

- record context：`["ZV/record",1,vaultId,recordId,revisionId,parentRevisionIds,suite]`。
- record body：context 后附 `[nonce12,ciphertextWithTag,recipientEnvelopes]`；credential 明文为 `[canonicalHttpsOrigin,username,password]`。
- recipient envelope：`[recipientId,enc65,wrappedKey48]`；context 为 `["ZV/record-key",1,recordContext,digest(CBOR([recordContext,nonce,ciphertext])),recipientId]`。
- signed record：`["ZV/signed-record",1,body,signature]`，域 `ZV/author`。探针固定两收件方 phone/recovery。
- request body：`["ZV/request",1,deviceId,"manual"|"session",challenge32,fullSignedRecordBytes,ephemeralPublicKey65|null]`。完整信封内携带库/记录/版本；不得只发记录 ID。
- signed request：`["ZV/signed-request",1,body,signature]`，域 `ZV/request-signature`。
- response body：`["ZV/response",1,digest(fullSignedRequestBytes),enc65,ciphertext]`；前三项作为 HPKE context，明文为 credential 元组，不返回记录密钥。
- signed response：`["ZV/signed-response",1,body,signature]`，域 `ZV/response-signature`。
- directory：`["ZV/directory",1,vaultId,shardRevision,nonce12,ciphertext]`；前四项为 AAD。明文为 `[recordId,revisionId,origin,nonSensitiveAlias]` 列表，规模测试每 100 条一片，随机 nonce。长期目录密钥的轮换及用量上限仍待定义。
- grant body：`["ZV/directory-grant",1,digest(fullPairingTranscript),enc65,wrappedDirectoryKey48]`；前三项为 HPKE context。外层 `ZV/signed-grant`，签名域 `ZV/grant-signature`。配对完整交互尚未实现。
- commit body：`["ZV/commit",1,vaultId,parentCommitIds,[[objectId,digest]],[[recordId,revisionId,parentRevisionIds,deleted,objectId]]]`；外层 `ZV/signed-commit`，域 `ZV/commit-signature`。探针验证单提交引用，不是完整 DAG 接收器；父提交闭包、签名者授权、跨提交一致性仍待实现。

## 人工码

32 字节数据密钥以 Crockford 字母表 `0123456789ABCDEFGHJKMNPQRSTVWXYZ` 编为 52 字符，末尾补零位必须规范。附加 `Base32(SHA256(CBOR(["ZV/manual-check",1,key])))[0:4]`，共 56 字符；20 位校验仅检错，不认证。接受大小写、空格/短横分组及 O→0、I/L→1，输入上限 128 字符；其他字符拒绝。它可重复打开对应记录版本，绝不是一次性码。

## QR 传输

单帧 CBOR：`["ZV/frame",1,digest(fullMessage),index,total,chunk]`。chunk ≤700 字节，非末帧必须为 700 字节；最多 47 帧、组帧后 ≤32768 字节、120 秒单消息窗口。二维码文本为 `ZV1:` + 标准 Base64(frame)，M 纠错。拒绝混帧、冲突重复、未知字段形状、哈希不符和超限。SHA256 只检查组帧完整性，不能替代请求签名。

Dart 当前只解码固定帧元组，以严格字节预检阻止嵌套/标签输入，再调用 CBOR 库。组装后的授权消息保持不透明，不解释为已验签或已批准。真机扫码稳定性和较大帧体验尚待实测。

## 尚未冻结

PhoneApproval 凭证、持久配对策略、限次/退避、检查点迁移、恢复描述符与完整备份均未实现。软件 ApprovalProbe 用内存检查点演示拒绝不同版本，不支持正常新版本核验流程；其测试不能替代手机可信显示/用户认证验收。
