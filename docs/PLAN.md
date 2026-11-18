# dsh-duplex 执行计划（1 个月版）

> 项目：给 DeepSeek Harness 的语音双工/免手模式
> 目标：4 周内发布 v1.0，90 天冲 5k★（基准 2–4k，P≈20%）
> 状态：v0.0.1 骨架已落地（朗读 + 语音输入 + 自动朗读），见 README

---

## 0. 成功指标与砍掉线

| 时间点 | 指标 | 不达标动作 |
|---|---|---|
| 第 10 天 | 300★ + 20 份真实使用反馈 | 停止打磨，转 dshguard（见调研报告 §6） |
| 第 21 天 | 1,000★ + 语音审批可用 + 1 个 UP 主/KOL 转发 | 收敛为"语音审批小工具"，砍手机端 |
| 第 30 天 | 2,000★ + 15 个真实日活 | 继续但停止扩张，转维护 |
| 第 90 天 | 5,000★ | — |

北极星指标不是 star，而是**"语音审批"被真实使用的次数**（会写进 v0.1 日志开关）。

## 1. v0.0.1 已完成（本次）

- [x] 可安装的 bundle 骨架（`package.json` + `cordis.patch.yml` + host/client 双入口）
- [x] 展示元数据（`locale/en.json`、`locale/zh.json`、`icon.svg`、`docs/DETAIL.md`、`docs/preview.svg`）
- [x] 助手回复朗读按钮（暂停/继续/停止；跳过代码块；分块朗读）
- [x] 自动朗读开关（新回复稳定 1.4s 后朗读；localStorage 持久化）
- [x] 输入框麦克风（Web Speech ASR → 写入草稿，可选自动发送）
- [x] 中英双语 README + 计划 + demo 脚本
- [x] `node --check` / JSON 校验通过

**待你验证（安装后）**：两个 slot 是否真的渲染在预期位置、按钮是否符合主题、Electron 端 TTS 是否可控。

## 2. 经核验的扩展点（写代码前先读，别猜）

以下来自本机 DSH 0.2.2-rc.3 的包源码/文档，已核对：

| 需求 | 扩展点 | 证据 |
|---|---|---|
| 给每条助手回复加按钮 | slot `conversation.chat.assistant-actions`，props 含 `messageId`、`useSession` | 现有插件 dsh-omi-voice 的 client.js |
| 输入框工具条 | slot `conversation.input.dock`（list, session scope），外层 `conversation.input.overlay/left/right` 也可用 | `@deepseek-ai/dsh-client-ui-conversation/src/client/contract/slots.ts` |
| 写入/发送草稿 | 标准 props `inputActions`：`setDraft(text)`、`insertText(text, span)`、`captureInsertion()`、`submit()`、`insertQuote()` | 同上 `src/client/contract/input.ts`（`interface InputActions`） |
| 读会话消息 | `session.chat.nodes.values()` → `{node}`，`node.kind === 'assistant'`，`node.messageId`，`node.blocks[].kind === 'text'` | 同上 + 现有插件实现 |
| 审批/提问事件 | `docs/subsystems/approval.md`、`conversation.md`、`commands.md`；Host 侧 `ctx.on(...)` | 待 W2 精读 |
| 宿主配置持久化 | `references/configuration.md`（Host config 服务） | 待 W2 精读 |
| 插件可见文案 | Client locale 服务（v0 先用 `document.lang` 判断） | `references/ui-plugin.md` |

**约束**：资源注册必须走 `ctx.effect`/`ctx.on` 并返回清理函数；不要替换 app root、不要改宿主 DOM；不要写 `$DSH_HOME` 或 profile 文件。

## 3. 四周计划

### 第 1 周（11-17 → 11-23）：能装、能用、能量化

- 安装到 `web` profile 与 Desktop，截图验证两个 slot 的位置与主题适配
- 修 v0.0.1 的渲染/交互问题；确认卸载后无残留样式
- 加"语音设置"：音色、语速、自动朗读/自动发送（先 localStorage，W3 迁到 Host config）
- 建立 `compatibility.json` + README 兼容性表（DSH web / Desktop / TUI）
- 发布 `v0.0.2`（npm + GitHub Release + 预打包 tgz）
- 素材：dark/light 截图各 3 张、10s GIF（点朗读 → 播报）

### 第 2 周（11-24 → 11-30）：P0.1 语音审批（核心差异点）

- 精读 `docs/subsystems/approval.md`：审批请求的生命周期、接受/拒绝的动作
- Host 半边：订阅审批/提问事件，把"待审批摘要 + 选项"推给 Client（Remote 方法或事件总线，二选一，写下决策）
- Client：播报"要执行 rm -rf build，批准吗？"→ 说"批准/拒绝"→ 调审批动作
- 安全设计（必须）：
  - 破坏性操作（删除、提权、外部网络写入）要求**口头二次确认**，且默认关闭"全语音批准"
  - 审批播报只念结构化摘要，不念原始命令全文（避免注入）
  - 所有语音批准在会话里留下可见记录（可审计）
- 发布 `v0.1.0`，README 首屏换成"语音审批"演示 GIF

### 第 3 周（12-01 → 12-07）：P0.2 摘要 + P1 连续对话

- 摘要引擎：先规则（工具名 + 成功/失败 + 计数 + 关键文件），再可选小模型压缩到 ≤2 句
- 连续对话模式 + 打断（barge-in）：播报中说话即停，转写进入下一轮
- 全局快捷键（若 Client 提供键盘注册能力则实现；否则用输入框按钮长按）
- 迁移设置到 Host config，补 `Config` schema
- 发布 `v0.2.0`

### 第 4 周（12-08 → 12-14）：发布周

- 录制 30s/90s 演示（脚本见 `docs/demo-script.md`），B 站 + YouTube 双版
- README 定稿：量化对比表（手动读 vs 语音播报耗时）、兼容性矩阵、FAQ
- 提交：awesome-dsh-plugin（一个 YAML）、dsh-plugin-radar、dshfind、dsh-market 索引；加 topic `dsh-plugin`
- 发布 `v1.0.0` + 双语发布文案
- 首 72 小时执行（见 §6）；之后每天 2 小时响应 issue/兼容上游 rc
- **Stretch（有精力再做）**：手机 PWA 扫码连本机、锁屏播报（P2）

## 4. 技术方案要点

### 4.1 TTS 分层

| 层 | 方案 | 何时用 |
|---|---|---|
| v0 默认 | `window.speechSynthesis`（系统音色，零 Key，离线） | 现在 |
| v1 可选 | Edge TTS（免费、自然中文） | W3 起，用户可选 |
| v1.5 BYOK | 豆包 / Qwen3-TTS / 本地 | 有人要求再做，避免过早复杂 |

播报队列与优先级：**审批 > 计划确认 > 回合结束摘要 > 用户主动点读**；同一时刻只播一个，新的高优先级打断低优先级。

### 4.2 ASR 分层（Electron 是硬约束）

| 环境 | 方案 |
|---|---|
| Chrome/Edge Web UI | Web Speech（零配置，v0 已实现） |
| Electron Desktop | v0 提示不可用；v1 接 OpenAI 兼容 `/audio/transcriptions`（Whisper 类端点）、本地 whisper.cpp server、或豆包 ASR（BYOK，配置项） |
| 手机浏览器 | 先 Web Speech；PWA 阶段再优化 |

配置存放：v0 用 localStorage；v1 用 Host 配置服务，Key 走 DSH credentials（`docs/subsystems/credentials.md`），绝不能写进日志/会话。

### 4.3 摘要策略

- 输入：工具名、参数摘要、结果状态、结果大小、错误行
- 规则优先：`{tool} {ok|failed} · {n} {unit} · {key file}` → "跑了 12 个测试，2 个失败，都在 auth.ts"
- 只有规则无法覆盖时才调用小模型（可配置模型），并严格限制在 ≤2 句、≤120 字
- 绝不把工具原始输出整段送进 TTS

### 4.4 安全与隐私

- 音频不上传、不落盘；转写只写进草稿
- 云端 ASR/TTS 必须显式配置 + 在 Settings 里标注数据会发往哪里
- 语音审批默认只允许"非破坏性"操作；破坏性操作双确认
- 语音识别结果写入会话前给用户可编辑窗口（v0 已有：写草稿不自动发）

## 5. 风险登记

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Electron 桌面端 ASR 不可用，体验断档 | 高 | 高 | W2 内先做云端 ASR 配置（这是桌面用户的主场景），README 明说 |
| 语音误批造成破坏 | 中 | 极高 | 默认只播报不批准；破坏性操作双确认 + 会话留痕 |
| 上游 API 变动（rc 每 2–4 天） | 高 | 中 | CI + `compatibility.json`；48h 内跟进；只依赖稳定 slot/props |
| 官方跟进语音能力 | 中 | 中 | 护城河是审批 + 摘要 + 手机端，不是 TTS 本身；保持与官方互补 |
| 新鲜感过后留存低 | 中 | 中 | 主打"离开键盘"场景；自动朗读默认开（可关），让用户每天被动用上 |
| 延迟/打断体验差 | 中 | 中 | 分块播报 + 首句优先 + 打断即停；先做审批短句，再做长摘要 |

## 6. 发布清单（首 72 小时）

- [ ] npm 发布 `dsh-duplex@1.0.0`，GitHub Release 附预打包 `.tgz` + SHA256
- [ ] topic：`dsh-plugin`（必须）、`deepseek-harness`、`dsh`、`voice`、`tts`、`speech`、`hands-free`
- [ ] awesome-dsh-plugin PR：新增一个 `data/plugins/<owner>__dsh-duplex.yml`（Voice & Audio 分类），按要求填 en/zh 描述
- [ ] dsh-plugin-radar `PLUGINS.md` 登记；dshfind 提交；dsh-market 索引（如支持）
- [ ] 官方 Discord **Show Your Plugins**、GitHub Discussions 的 **Show Your Plugins!**（只有 11 条，竞争极小）
- [ ] 加 `https://awesome-dsh-plugin.com/badge.svg`、Trendshift 徽章（上榜后）
- [ ] 发布文案：EN 先（Show HN / r/LocalLLaMA / X），24h 后中文（B 站 / V2EX / 知乎 / 掘金）
- [ ] 私信 5 个中腰部 UP 主/KOL 发 90s demo
- [ ] 首周每天回 issue；48h 内适配官方新 rc

**不要做**：star 换功能、付费刷量、把未验证的能力写进 README。

## 7. 文件结构

```
dsh-duplex/
├── package.json           # dsh.bundle + dsh.client 清单
├── cordis.patch.yml       # 插入 Host 行（v0 为空操作）
├── host/index.js          # Host 半边（v0 空壳，W2 接审批事件）
├── client/client.js       # 浏览器 bundle：朗读 / 麦克风 / 自动读 / 自动发
├── locale/{en,zh}.json    # 插件展示元数据
├── icon.svg
├── docs/
│   ├── PLAN.md            # 本文
│   ├── DETAIL.md          # 插件详情页
│   ├── preview.svg        # 详情页配图
│   └── demo-script.md     # 30s/90s 演示脚本
├── research/              # 生态调研报告（选题依据）
├── README.md / README.zh.md
└── LICENSE (MIT)
```

## 8. 立刻要做的三件事

1. 在 DSH 里 **Plugins → Add plugin** 选中本目录，打开会话看按钮是否出现（这是对 v0.0.1 的唯一真实验证）。
2. 截图发我：我可以据此修 slot 位置/样式，并开始 W2 的审批事件接线。
3. 决定 ASR 兜底用哪家（OpenAI 兼容 Whisper 端点 / 本地 whisper.cpp / 豆包），我按你的选择写配置页。
