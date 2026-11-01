# 数据来源与重建输入

当前数据快照的校验值见 `data-snapshot.json`。候选人核对时间仍为2026-10-30，程序更新不代表新增资格或号次核验。

本目录直接提供候选人资格、抽签号次、原登记核对等审计JSON。完整公共构建输入保存在 `archive/build-inputs-20261030.zip`，包括投影边界、选区CSV、公开抽签证据及党徽原件。它是固定输入归档，不是当前网站源码包。

运行 `python scripts/prepare_build_inputs.py` 可按固定SHA256校验后，解包归档中的 `sources/`。不会覆盖已有的较新审计文件。当前运行源码、构建脚本、测试以主分支为准，下载完整源码请使用 GitHub 的 Code → Download ZIP。

来源和授权沿用 `THIRD_PARTY_NOTICES.md`、`assets/LICENSE-*.txt` 及各审计JSON中的原始来源URL。
