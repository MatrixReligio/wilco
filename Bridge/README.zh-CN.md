# Wilco 的 Pi 扩展

[English](README.md) · **简体中文**

## wilco-guard

wilco-guard 在执行有风险的工具调用之前，通过 Pi 的扩展 UI 征求你的批准。由 Wilco Host 启动的会话里，这个问题会出现在你的 iPhone 或 iPad 上；你不在手机前时，它会作为通知送达；如果完整的命令能在通知里显示，可以直接在锁屏上批准或拒绝，否则会在 App 中打开这个询问。问题没有时间限制：Pi 会一直等到你回答。

会询问的情况：

| 规则 | 默认 | 在以下操作之前询问 |
|---|---|---|
| 危险命令 | 开 | `rm -r`、`sudo`、`git push --force`（以及 `+ref`、`--delete`、`--mirror`）、`git reset --hard`、`git clean -f`、`mkfs`、`dd of=`、`chmod -R` / `chown -R`、`find -delete`、`shutdown` / `reboot`、管道传给 shell、重定向写入设备 |
| 写入工作区之外 | 开 | 对会话工作目录之外的路径执行 `write` 和 `edit` |
| 所有命令（严格模式） | 关 | 每一条 `bash` 命令 |

无法判断实际执行什么的命令（命令位置上的 `$CMD`、`$(…)`）也会询问；`env`、`nice`、`timeout`、`xargs`、`sh -c`、`eval` 等包装会被穿透检查。涉及 wilco-guard 自身目录（策略和代码）的操作无论规则如何设置都会询问。

这些规则是防止失误的安全网，而不是沙箱：Pi 以你的身份运行，刻意绕过规则的命令仍然可以做到（例如写进脚本文件再执行）。在意这一点时请开启严格模式。

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

触碰策略文件所在的文件夹，或 `WILCO_GUARD_PROTECT` 中逐行列出的文件夹（Wilco Host 会列出它的状态文件夹），无论规则如何都会询问。两个变量读取后即从环境中移除，Pi 运行的命令不会继承它们。命令中的 `$(…)` 和反引号替换也会被检查，包括双引号内的；无法可靠解读的替换（括号不配对、含注释，或双引号内的反引号）按间接命令询问。

询问通过 `ctx.ui.confirm` 发出，标题以 `wilco-guard: ` 开头。没有可用的 UI 时（例如 `pi -p`），本应询问的调用会被直接阻止。

## wilco-bridge

wilco-bridge 把你在“终端”里启动的 Pi 会话带到 iPhone 和 iPad 上的 Wilco。Wilco Host 会把这个会话标为**在 Mac 终端中**，你可以在手机上实时跟随它、继续在其中工作，终端里显示的仍是同一个会话。

### 安装

- **通过 Wilco Host：**在 Wilco Host 设置的 Pi 页面中，点按“终端会话”下的**安装**。Wilco Host 会用它自带的 wilco-bridge 执行 `pi install`；**移除**可以撤销。
- **单独安装：**`pi install npm:@matrixreligio/wilco` 会同时安装 wilco-bridge 和 wilco-guard。

安装之后启动的 Pi 会话会加载它。会话所在的文件夹必须已在 Wilco Host 中共享；对其他文件夹，扩展什么也不做。

### 手机上能做什么

发送提示、插话引导和追加消息、停止运行、切换模型和思考级别、为会话命名和压缩会话，以及回答 wilco-guard 的询问（前提是 Pi 中也装了 wilco-guard）。终端无法从外部完成的操作，App 不会提供，例如清空排队的消息或运行 `!` shell 命令。其他扩展在终端里提出的问题只能在终端里回答。

### 一个会话，一个写入方

同一时间只有一个 Pi 运行某个会话：Wilco Host 自己的 Pi，或者终端里的 Pi。如果你在终端里打开一个正由 Wilco Host 的 Pi 持有的会话，Host 会把它交给终端：Pi 空闲时立即交接，否则等当前这次运行结束后交接。在此之前终端只跟随，不接受输入（Pi 会提示）。关闭终端后，下次在手机上打开这个会话时，Wilco Host 会用自己的 Pi 接着运行。

wilco-bridge 通过只有你的 Mac 用户能打开的套接字与 Wilco Host 通信：`~/Library/Application Support/Wilco/Host/bridge.sock`（可用 `WILCO_BRIDGE_SOCKET` 指定其他路径）。Wilco Host 未运行时，它会在后台持续重试，终端照常可用。协议见 [Protocol/bridge.zh-CN.md](../Protocol/bridge.zh-CN.md)。

## 开发

```sh
npm install
npm test          # 规则和 bridge 测试；装有 pi 时还会运行真实 Pi（包括在伪终端中运行的 TUI；隔离环境：临时 HOME，不会碰你的 ~/.pi）
npm run typecheck
```
