# dsh-duplex 执行计划

> 项目：给 DeepSeek Harness 的语音双工/免手模式
> 目标：90 天冲 5k★（基准 2–4k）；北极星指标是"语音审批被真实使用"的次数
> 当前版本：**v0.1.0**（语音审批 + 提问/计划语音回答 + 本轮摘要已上线）

---

## 0. 成功指标与砍掉线

| 时间点 | 指标 | 不达标动作 |
|---|---|---|
| 发布后 10 天 | 300★ + 20 份真实使用反馈 | 收敛为"语音审批"小工具，砍手机端 |
| 发布后 21 天 | 1,000★ + 语音审批可用 + 1 个 UP 主/KOL 转发 | 停止功能扩张，只做兼容与修复 |
| 发布后 30 天 | 2,000★ + 15 个真实日活 | 转维护模式 |
| 90 天 | 5,000★ | — |

## 1. 已完成

### v0.0.1（2026-11-18）
- [x] 可安装 bundle（`package.json` + `cordis.patch.yml` + host/client 双入口）
- [x] 展示元数据（locale/icon/详情页）、双语 README、MIT
- [x] 回复朗读（暂停/继续/停止、跳过代码块与链接）
- [x] 自动朗读、麦克风转写入草稿（可选自动发送）
- [x] CI：`node --check` + 清单校验 + 零依赖客户端冒烟测试

### v0.1.0（2026-11-22）
- [x] **语音审批**：播报待审批操作 → 口头"批准/拒绝" → 结束宿主审批
- [x] **高风险二次确认**：bash/shell/pwsh/terminal/exec/computer/browser 等需再说"确认批准"，"取消"即中止
- [x] **提问/计划语音回答**：单选 ≤5 选项按序号或名称回答；plan-review 说批准/拒绝；多选/多问题只播报
- [x] **本轮工具摘要**：自动朗读前播报"本轮用了 N 个工具：…"
- [x] 安全行为：听不清最多追问一次后交还界面；已撤回/不可答请求跳过；未知 pending 类型忽略；无 LLM 代答
- [x] 朗读与识别的时序修复（TTS 结束后 220ms 才开麦，避免回声）
- [x] 49 项冒烟测试（覆盖批准/拒绝/二次确认/取消/序号选择/听不清/撤回/多选/摘要）
- [x] `CHANGELOG.md`、README/DETAIL 重写

## 2. 已核验的扩展点（写代码前先读，别猜）

以下来自本机 DSH **0.2.2-rc.5** 的包源码/文档，均已核对：

| 需求 | 扩展点 | 证据 |
|---|---|---|
| 监听待审批/提问 | `ctx.uiSession.sessionStatus`（`HostObservable<SessionStatusSnapshot>`，`getSnapshot()/subscribe()`）；`SessionStatus.pendingInteraction` | `@deepseek-ai/dsh-client-ui-session/src/client/index.ts` |
| 审批对象 | `PendingApproval`：`kind:'approval'`、`key`、`toolName`、`reason`、`answerable`、`answer('allowed-once'\|'rejected')` | `@deepseek-ai/dsh-client-ui-approval/src/client/contract/slots.ts` |
| 提问对象 | `PendingQuestion`：`kind:'question'\|'plan-review'`、`questions[]`、`answer({answers:[{id,selected:[label]}]})`；选项 `{label, description?}`；plan-review 的 `intent.approve` 是批准选项标签 | `@deepseek-ai/dsh-client-ui-user-questions/src/client/contract/slots.ts`、`@deepseek-ai/dsh-user-questions/src/types.ts` |
| 给每条助手回复加按钮 | slot `conversation.chat.assistant-actions`，props 含 `messageId`、`useSession` | 现有插件 dsh-omi-voice 的 client.js |
| 输入框工具条 | slot `conversation.input.dock`（list, session scope） | `dsh-client-ui-conversation/src/client/contract/slots.ts` |
| 写入/发送草稿 | 标准 props `inputActions`：`setDraft(text)`、`insertText`、`captureInsertion()`、`submit()` | 同上 `contract/input.ts` |
| 会话快照 | `session.chat.nodes.values()` → `{node}`；助手 `kind:'assistant'`（`messageId`/`turn`/`blocks`，或 `data.*`）；工具 `kind:'tool-call'`（`data.root.name`） | `dsh-client-ui-chat/src/client/contract/chat-nodes.ts` |
| 虚拟环境 | 客户端 `inject` 可加 `uiSession`；`ctx.effect` 注册清理 | 审批插件的 `inject` 列表 |

**约束**：资源注册必须走 `ctx.effect`/`ctx.on` 并返回清理；不要替换 app root、不要改宿主 DOM；不要写 `$DSH_HOME` 或 profile 文件。

## 3. 下一阶段（P1，2 周）

### P1-a 连续对话与打断（3–4 天）
- 免按键连续模式：一轮回答后自动回到聆听；说"停/等一下"立即打断 TTS
- 全局快捷键（若 Client 提供键盘注册能力；否则用输入框按钮长按）
- 播报队列与优先级：审批 > 计划确认 > 回合摘要 > 用户点读

### P1-b 云端/本地 ASR 兜底（4–5 天，桌面端关键）
- 设置项：OpenAI 兼容 `/audio/transcriptions` 端点（Whisper 类）、本地 whisper.cpp server、豆包 ASR
- Key 存 DSH credentials 或本地加密存储；Settings 面板标明数据发往何处
- 识别结果先写入草稿（可编辑），不直接提交

### P1-c 设置面板与配置持久化（2 天）
- 音色、语速、语言、回声间隔、风险工具清单、是否允许语音审批、自动朗读/发送
- 从 localStorage 迁移到 Host 配置（`Config` schema），保留 localStorage 兼容

### P1-d 兼容性与发布（1–2 天）
- `compatibility.json` 记录实测宿主版本（web/desktop/headless）
- 48h 内跟进官方 rc（当前上游：0.2.2-rc.5 稳定、0.2.3-alpha.2 预览）
- 发布 v0.2.0

## 4. 安全边界（已实现，不可回退）

- 语音审批默认关闭；没有明确口头决定绝不批准
- 高风险工具二次确认；确认环节说"取消"即中止
- 听不清 → 追问一次 → 交还界面；已撤回/不可答请求跳过
- 多选、多问题、未知 pending 类型只播报不代答
- 无 LLM 代答：语音只是输入方式，决定必须来自人
- 音频不落盘、不保存转写；云 ASR 必须显式配置并在设置页标注

## 5. 发布 playbook

### 现在（v0.1.0 已发布）
- [x] npm 版本号、CHANGELOG、CI
- [x] Release：预打包 `.tgz` + SHA256SUMS
- [ ] **提交 awesome-dsh-plugin**：新增 `data/plugins/shidesheng0218__dsh-duplex.yml`（Voice & Audio 分类），描述写"朗读 + 语音审批"
- [ ] dsh-plugin-radar `PLUGINS.md` 登记、dshfind 提交、dsh-market 索引
- [ ] 官方 Discord **Show Your Plugins** + GitHub Discussions **Show Your Plugins!**（只有 11 条，竞争极小）
- [ ] 录制 30s GIF：语音审批 + 高风险二次确认（脚本见 `docs/demo-script.md`）
- [ ] 发布文案：EN 先（Show HN / r/LocalLLaMA / X），24h 后中文（B 站 / V2EX / 知乎 / 掘金）

### 每周
- 48h 内适配官方新 rc；1 次 minor 发布；issue 24h 内响应
- README 首屏保持"一条 GIF + 一句数字"

**不要做**：star 换功能、付费刷量、把未验证的能力写进 README。

## 6. 风险登记

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Electron 桌面端 ASR 不可用，体验断档 | 高 | 高 | P1-b 优先做云端 ASR；README 明说 |
| 语音误批造成破坏 | 中 | 极高 | 默认关闭 + 高风险二次确认 + 口头"取消" + 会话留痕 |
| 官方跟进语音能力 | 中 | 中 | 护城河是审批闭环 + 摘要 + 手机端；与官方互补 |
| 上游 API 变动（2–4 天一个 rc） | 高 | 中 | 只依赖稳定 slot/props；CI + compatibility 表；48h 适配 |
| 新鲜感过后留存低 | 中 | 中 | 主打"离开键盘"场景；自动朗读让用户每天被动用上 |
| 审批插件竞品（auto-review 255★） | 中 | 中 | 对方是"模型自动批"，我们是"人用嘴批"，定位互斥且更安全 |

## 7. 文件结构

```
dsh-duplex/
├── package.json / cordis.patch.yml
├── host/index.js          # Host 半边（当前空壳；审批闭环在客户端）
├── client/client.js       # 朗读 / 麦克风 / 自动读 / 语音审批
├── locale/{en,zh}.json / icon.svg
├── docs/{PLAN,DETAIL,demo-script}.md / preview.svg
├── scripts/smoke.mjs      # 49 项零依赖测试
├── research/              # 本地调研（不入库）
├── README.md / README.zh.md / CHANGELOG.md / LICENSE
```
