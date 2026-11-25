# Wilco 的 Pi 扩展

[English](README.md) · **简体中文**

## wilco-guard

wilco-guard 在执行有风险的工具调用之前，通过 Pi 的扩展 UI 征求你的批准。由 Wilco Host 启动的会话里，这个问题会出现在你的 iPhone 或 iPad 上；你不在手机前时，它会作为通知送达，可以直接在锁屏上批准。问题没有时间限制：Pi 会一直等到你回答。

会询问的情况：

| 规则 | 默认 | 在以下操作之前询问 |
|---|---|---|
| 危险命令 | 开 | `rm -r`、`sudo`、`git push --force`（以及 `+ref`、`--delete`、`--mirror`）、`git reset --hard`、`git clean -f`、`mkfs`、`dd of=`、`chmod -R` / `chown -R`、`find -delete`、`shutdown` / `reboot`、管道传给 shell、重定向写入设备 |
| 写入工作区之外 | 开 | 对会话工作目录之外的路径执行 `write` 和 `edit` |
| 所有命令（严格模式） | 关 | 每一条 `bash` 命令 |

无法判断实际执行什么的命令（命令位置上的 `$CMD`、`$(…)`）也会询问；`env`、`nice`、`timeout`、`xargs`、`sh -c`、`eval` 等包装会被穿透检查。涉及 wilco-guard 自身目录（策略和代码）的操作无论规则如何设置都会询问。

这些规则是一张安全网，而不是沙箱：刻意构造的命令仍可能绕过简单的模式匹配（例如写进脚本文件再执行）。在意这一点时请开启严格模式。

### 配合 Wilco Host 使用

无需安装：Wilco Host 自带 wilco-guard，并加载到它启动的每个会话中。规则可以在 Wilco Host 的设置里修改，也可以在手机上该 Host 的设置中修改，修改会立即对正在运行的会话生效。

### 单独使用

```sh
pi install npm:@matrixreligio/wilco
```

每次工具调用时，都会从 `WILCO_GUARD_POLICY` 指向的 JSON 文件读取策略。没有设置该变量、文件无法读取或格式错误时，使用默认值：

```json
{ "dangerousCommands": true, "outsideWorkspace": true, "allBash": false }
```

询问通过 `ctx.ui.confirm` 发出，标题以 `wilco-guard: ` 开头。没有可用的 UI 时（例如 `pi -p`），本应询问的调用会被直接阻止。

## wilco-bridge

wilco-bridge（计划在 M4 里程碑实现）将通过本地 Unix 套接字把 Pi 的 TUI 会话连接到 Wilco Host，让你在手机上跟随并操作它。

## 开发

```sh
npm install
npm test          # 规则测试；装有 pi 时还会运行真实 Pi（隔离环境：临时 HOME，不会碰你的 ~/.pi）
npm run typecheck
```
