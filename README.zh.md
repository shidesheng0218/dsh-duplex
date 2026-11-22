# dsh-duplex 语音双工

**给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的免手语音模式。**
说需求，听结论，语音审批。

[English](README.md) | 简体中文

> 本项目与 DeepSeek 官方无隶属、背书或支持关系。

## 为什么做

DSH 已经有桌面端、手机端、TUI、IM 等入口，**语音是唯一还没有"工作级"方案的模态**：
生态里最强的语音插件还是个"AI 女友"（1,066★），官方只有听写。
`dsh-duplex` 面向的是真正干活的场景：短摘要播报、语音审批、离开键盘也能用。

## 现在能用的功能（v0.1.0）

| 能力 | 状态 | 说明 |
|---|---|---|
| 朗读助手回复 | ✅ | 每条回复旁有朗读按钮；支持暂停/继续/停止；代码块与链接跳过并用语音提示 |
| 自动朗读 | ✅ | 输入框工具栏开关；等回复稳定约 1.4 秒后朗读，并在前面加一句本轮摘要（如"本轮用了 3 个工具：bash ×2、read"） |
| 语音输入到输入框 | ⚠️ 仅浏览器 | 浏览器 SpeechRecognition 转写写入草稿（可选自动发送） |
| **语音审批** | ✅ | 播报待审批操作，接受口头"批准/拒绝"；**高风险工具**（`bash`、`pwsh`、`terminal`、`computer`、`browser` 等）必须再说一次"确认批准" |
| 提问/计划语音回答 | ✅ | 单选且选项 ≤5 时可按序号或名称回答；计划评审可说批准/拒绝；多选与多问题只播报不代答 |
| 云端/本地 ASR 兜底 | 🚧 计划中（P1.5） | Electron 桌面端目前无法用浏览器内置识别 |
| 手机 PWA 扫码配对 | 🚧 计划中（P2） | 复用 DSH 远程配对的思路 |

**桌面端说明：** DSH Desktop 是 Electron，浏览器内置语音识别通常不可用。
TTS 与**语音审批**在桌面端可用（审批播报与作答走同一路语音输入），语音输入需要 Chrome 打开 Web UI。

## 语音审批与安全设计

语音审批**默认关闭**，在输入框工具栏点 `🎙 语音审批` 开启。设计原则是 fail-closed（出错宁可不做）：

- 没有明确的口头决定，绝不批准。静音、环境噪音、听不清、未知类型的 pending interaction，都不会结束请求。
- 高风险工具必须**二次确认**（说"确认批准"）；在确认环节说"取消"即中止。
- 已作答或已撤回的请求（`answerable === false`）直接跳过。
- 多选、选项过多、一次多个问题的场景只播报，由界面决定。
- 语音识别由浏览器自带服务完成，插件不保存音频、不保存转写；语音决定就是普通的 DSH 审批，会像点卡片一样进入会话审计。
- **没有 LLM 替你做决定**：与"自动审批/第二次模型评审"类插件不同，`dsh-duplex` 不会替你编出一个审批结论。

## 安装

1. 克隆本仓库。
2. DSH 里打开 **Plugins → Add plugin**，选择这个目录（清单声明了 `dsh.bundle.patch`，可直接安装）。
3. 重启或等 HMR 生效，打开会话即可看到：回复旁的朗读按钮、输入框里的麦克风 / 自动读 / 自动发 / 语音审批。

CLI 安装方式：

```sh
dsh plugin --profile web add github:shidesheng0218/dsh-duplex
```

或安装固定版本的 Release 包（无构建步骤，也避开 pnpm 的最短发布等待）：

```sh
dsh plugin --profile web add https://github.com/shidesheng0218/dsh-duplex/releases/download/v0.1.0/dsh-duplex-0.1.0.tgz
```

卸载不留补丁：客户端只注册 slot，样式会随销毁清理。

## 环境要求

- DSH `>=0.2.1 <0.3.0`（web 或 desktop profile；客户端面向 Web UI）
- 系统可用 TTS 音色（macOS/Windows/Linux 自带；Chromium 至少需要装一个音色）
- 语音输入需要 Chromium 内核浏览器（Chrome/Edge）；Electron 桌面端暂不支持是已知限制

## 路线图

- ~~**P0.1** 审批/提问播报 + 语音决定~~（v0.1.0 已完成）
- ~~**P0.2** 本轮工具活动摘要~~（v0.1.0 已完成，规则版）
- **P1** 连续对话、打断、全局快捷键
- **P1.5** Electron / 手机浏览器的云端 ASR 兜底
- **P2** 手机 PWA 扫码配对、锁屏播报

## 开发

纯 JavaScript，无构建步骤：

- `host/index.js` — Host 半边（当前为空；审批闭环在客户端实现）
- `client/client.js` — 浏览器 bundle（`window.__ModuleLoader__.load`，从模块表取 React）
- `locale/en.json`、`locale/zh.json` — 插件展示元数据
- `docs/` — 计划、Demo 脚本、详情页
- `scripts/smoke.mjs` — 零依赖测试脚本

安装前自检：

```sh
npm run check   # 对 host/client 入口做 node --check
npm test        # 清单校验 + 客户端冒烟测试（不需要浏览器）
```

`npm test` 会在 `vm` 沙箱里用假的 DOM、语音合成与语音识别加载 bundle，验证 slot 注册、
Markdown 清理、审批的批准/拒绝/高风险二次确认/取消、问题选项选择、听不清、已撤回请求与本轮摘要。

## 已知限制

- 语音质量取决于系统音色，本版不带神经 TTS。
- 长回复会分块朗读；暂停/打断的表现随浏览器内核而异。
- 语音审批依赖 Web UI 暴露 `uiSession.sessionStatus`（DSH 0.2.1+）；更早的宿主上开关无效，界面仍可正常审批。
- 多数 Chromium 的语音识别依赖网络服务，这也是 Electron 暂不支持 ASR 的原因。

## 许可证

MIT。与 DeepSeek 官方无隶属、背书或支持关系。
