<p align="center"><a href="CONTRIBUTING.md">English</a> · <strong>简体中文</strong></p>

# 为 Wilco 做贡献

感谢你帮助 Wilco 变得更好。本指南适用于本仓库中的开源部分：中继、Pi 扩展、协议和文档。

## 开始之前

- 除了小修小补，请先提一个 Issue，就实现思路达成一致后再动手。
- 安全问题请按照[安全政策](SECURITY.zh-CN.md)私下报告，切勿公开提交 Issue。
- 提交贡献即表示你同意以 [MIT 许可证](LICENSE)授权你的贡献。

## 基本规则

1. **测试先行。** Wilco 采用测试驱动开发。每个行为变更都要附带一个测试：改动前失败，改动后通过。新增行为缺少测试的 PR 会被要求补上。
2. **原创代码。** 不要从许可证不兼容（例如 GPL）的项目中复制代码。欢迎借鉴思路，但不接受复制的代码。
3. **开源部分保持独立。** 本仓库中的代码不得依赖 Wilco 的闭源 App。
4. **协议变更只做增量。** 在同一个协议大版本内，新增的字段和消息必须是可选的，并由能力位开关控制。请在同一个 PR 中同时更新规范、样本数据和中英文文档。
5. **文档提供两种语言。** 默认英文；所有面向用户的文档都要有简体中文版本。如果你只能写其中一种语言，请在 PR 中说明，维护者会协助补全。

## 开发环境

每个组件都有自己的 README，说明环境搭建和测试命令：

- [`Relay/`](Relay/)：TypeScript、Cloudflare Workers、Vitest
- [`Bridge/`](Bridge/)：TypeScript Pi 扩展、Vitest
- [`Protocol/`](Protocol/)：规范、样本数据和测试向量

## 提交与 Pull Request

- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)（`feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`chore:`）。
- 每个 PR 只做一件事，并填写 PR 模板。
- 所有 CI 检查通过后才会进入评审。

## 报告缺陷与功能建议

请使用 Issue 模板。报告缺陷时，请附上 Wilco、Pi 和操作系统的版本，以及期望结果、实际结果和复现步骤。
