# P1 向量

- `rfc9180-p256.json`：从 [CFRG HPKE vectors](https://github.com/cfrg/draft-irtf-cfrg-hpke/blob/master/test-vectors.json) 提取 mode=0、kem=16、kdf=1、aead=2 的一组向量；2026-10-12 下载，包含 257 条加密结果。TypeScript 与 Bouncy Castle 独立解密检查。
- `manual-code.json`：`scripts/manual-vectors.ts` 生成的固定合成密钥向量。Dart 与 TypeScript 使用同一文件，包含全零、全 FF 和递增字节。不是任何真实密码库材料。
- `frames.json`：同一脚本生成的 1800 字节分帧样本，Dart 实测乱序重组与摘要一致。
- 本目录中的私钥数值如有，均为公开标准测试向量或明确的合成测试值，不得用于部署。

应用 HPKE 双向互操作的临时软件私钥仅写入 gitignore 排除的 `artifacts/local/interop.json`。它只验证库的字节互操作，不证明 Android Keystore 可接入这些库。

归档标准向量文件 SHA256：`aeed31e558ebe72e2999d1bf71d65c37425b9ae0b09788013737b3e049f24488`。
