# dsh-duplex 语音双工

**给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的免手语音模式。**
说需求，听结论，语音审批。

[English](README.md) | 简体中文

> **当前状态：v0.0.1 骨架版。** 已实现"听见"和"开口"两件基础事（朗读回复、语音输入、自动朗读）；
> 语音审批、工具结果摘要播报是下一个里程碑，详见 [docs/PLAN.md](docs/PLAN.md)。
> 本项目与 DeepSeek 官方无隶属关系。

## 为什么做

DSH 已经有桌面端、手机端、TUI、IM 等入口，**语音是唯一还没有"工作级"方案的模态**：
生态里最强的语音插件还是个"AI 女友"（1,066★），官方只有听写。
`dsh-duplex` 面向的是真正干活的场景：短摘要播报、语音审批、离开键盘也能用。

## 现在能用的功能（v0.0.1）

| 能力 | 状态 | 说明 |
|---|---|---|
| 朗读任意助手回复 | ✅ | 每条回复旁有朗读按钮；支持暂停/继续/停止；代码块会被跳过并用语音提示 |
| 自动朗读新回复 | ✅ | 输入框工具栏的开关；等回复稳定约 1.4 秒后朗读 |
| 语音输入到输入框 | ⚠️ 仅浏览器 | 用浏览器 SpeechRecognition；转写文字写入草稿（可选自动发送） |
| 语音审批 / 计划确认 | 🚧 计划中（P0.1） | 订阅宿主审批事件 + 播报 + 语音 yes/no |
| 工具结果摘要播报 | 🚧 计划中（P0.2） | "12 个测试，2 个失败在 auth.ts"，而不是念原始日志 |
| 手机 PWA / 扫码配对 | 🚧 计划中（P1） | 复用 DSH 远程配对的思路 |

**桌面端说明：** DSH Desktop 是 Electron，Chromium 的 Web Speech 识别通常不可用。
TTS 正常；语音输入目前需要在 Chrome 里打开同一个 Web UI。云端 ASR 兼容层排在 v0.1。

## 安装（本地开发目录）

1. 保留本目录。
2. 打开 DSH 的 **Plugins → Add plugin**，选择这个本地目录（清单里声明了
   `dsh.bundle.patch`，可直接安装）。
3. 重启或等 HMR 生效，打开会话即可看到：回复旁的朗读按钮、输入框里的麦克风与"自动读"开关。

仓库公开后的 CLI 安装方式：

```sh
dsh plugin --profile web add github:shidesheng0218/dsh-duplex
```

卸载不留补丁：客户端只注册 slot，样式会随销毁清理。

## 环境要求

- DSH `>=0.2.1 <0.3.0`（web 或 desktop profile；客户端面向 Web UI）
- 系统可用 TTS 音色（macOS/Windows/Linux 自带；Chromium 至少需要装一个音色）
- 语音输入需要 Chromium 内核浏览器（Chrome/Edge）；Electron 桌面端暂不支持是已知限制

## 路线图

- **P0.1** 审批/提问播报 + 语音 yes/no
- **P0.2** 规则 +（可选）小模型的工具结果摘要
- **P1** 连续对话、打断、全局快捷键
- **P1.5** Electron / 手机浏览器的云端 ASR 兜底
- **P2** 手机 PWA 扫码配对、锁屏播报

## 开发

纯 JavaScript，无构建步骤：

- `host/index.js` — Host 半边（v0.0.1 为空，后续放事件桥）
- `client/client.js` — 浏览器 bundle（`window.__ModuleLoader__.load`，从模块表取 React）
- `locale/en.json`、`locale/zh.json` — 插件展示元数据
- `docs/` — 计划、Demo 脚本、详情页

安装前自检：

```sh
node --check host/index.js
node --check client/client.js
for f in package.json locale/*.json; do jq empty "$f"; done
```

## 已知限制

- 语音质量取决于系统音色，本版不带神经 TTS。
- 长回复会分块朗读；暂停/打断的表现随浏览器内核而异。
- 转写只写入草稿，除非打开"自动发送"。
- 多数 Chromium 的语音识别依赖网络服务，这也是 Electron 暂不支持 ASR 的原因。

## 许可证

MIT。与 DeepSeek 官方无隶属、背书或支持关系。
