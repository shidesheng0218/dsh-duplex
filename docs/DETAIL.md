# dsh-duplex 语音双工

![朗读按钮、输入框里的麦克风与自动朗读开关](preview.svg)

**Hands-free voice mode for DeepSeek Harness: speak your request, hear the result, approve by voice.**

## 功能 / What it does

- **朗读回复 / Read replies aloud**：每条助手回复旁有朗读按钮，支持暂停、继续、停止；Markdown 代码块会被跳过，用一句语音提示代替。
- **自动朗读 / Auto-read**：输入框工具栏的"自动读"开关，新回复稳定后自动朗读；状态保存在浏览器本地。
- **语音输入 / Dictate**：输入框的麦克风按钮，把语音转写写入草稿；可在设置里打开自动发送。
- **规划中 / Planned**：审批与提问的语音播报与语音 yes/no、工具结果的人话摘要、手机 PWA。见 `docs/PLAN.md`。

## 使用 / Usage

1. 在 DSH 里打开任意会话。
2. 想听：点回复旁的朗读按钮，或打开"自动读"。
3. 想说：点输入框的麦克风，说完后转写会进入草稿（默认不自动发送）。

## 限制 / Limitations

- 语音合成使用系统音色，质量取决于操作系统；本版不含神经 TTS。
- Electron 桌面端的浏览器语音识别通常不可用（TTS 可用）；语音输入请用 Chrome/Edge 打开 Web UI。
- 浏览器语音识别多数实现依赖网络服务；插件本身不保存、不上传任何音频或转写。
- 与 DeepSeek 官方无隶属关系。

## 隐私 / Privacy

- 朗读完全在本地进行，不发起网络请求。
- 语音识别由浏览器自带的识别服务完成，行为受浏览器策略约束；插件不记录、不持久化音频。
- 自动朗读/自动发送开关只保存在本机 `localStorage`。
