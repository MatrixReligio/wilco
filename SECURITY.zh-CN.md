<p align="center"><a href="SECURITY.md">English</a> · <strong>简体中文</strong></p>

# 安全政策

Wilco 控制的是一个能读写你电脑上文件的 coding agent，因此我们非常重视安全报告。

## 报告漏洞

**请不要公开提交 Issue。** 请通过 GitHub 私下报告：打开本仓库的 **Security** 标签页，选择 **Report a vulnerability**。

请尽量提供：

- 受影响的组件（中继、Pi 扩展、协议、iOS App 或 Mac Host）及版本；
- 问题描述及其影响；
- 复现步骤或概念验证；
- 修复建议（如有）。

我们力争在 3 个工作日内确认收到报告，在 14 天内给出修复计划。除非你另有要求，我们会在发布说明中致谢。

## 范围

范围内：本仓库的全部内容、Wilco iOS App、Wilco Mac Host，以及官方托管的 Wilco 中继。范围外：Pi 本身的漏洞（请报告给 [Pi 项目](https://github.com/earendil-works/pi)），以及单纯依靠流量造成的拒绝服务。

## 受支持的版本

1.0 版本之前，只有最新版本会获得安全修复。

Wilco 如何保护你的数据，请参阅[安全模型](docs/zh-CN/security-model.md)。
