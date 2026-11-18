# dsh-duplex

**Hands-free voice mode for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).**
Speak your request, hear the result, approve by voice.

[![dsh 0.2.1+](https://img.shields.io/badge/dsh-0.2.1%2B-2f8fff)](https://github.com/deepseek-ai/deepseek-harness)
[![license MIT](https://img.shields.io/badge/license-MIT-63e6ff)](LICENSE)
[![status v0.0.1](https://img.shields.io/badge/status-v0.0.1%20skeleton-f0a54f)](docs/PLAN.md)
[![plugin topic](https://img.shields.io/badge/topic-dsh--plugin-8b5cf6)](https://github.com/topics/dsh-plugin)

简体中文 | [中文说明](README.zh.md)

> **Status: v0.0.1 skeleton.** This version ships the voice *out* and voice *in*
> foundation (read replies aloud, dictate into the composer, auto-read). Voice
> approval and condensed tool-result announcements are the next milestone — see
> [docs/PLAN.md](docs/PLAN.md). Nothing here claims to be official DeepSeek
> software.

## Why

DSH already has desktop, mobile, TUI and IM surfaces. Voice is the only modality
without a working champion: the best voice plugin in the ecosystem is a
companion toy (1,066★) and official support is dictation only. `dsh-duplex` is
built for work: short spoken summaries, voice approvals, and hands-free use
away from the keyboard.

## What works today (v0.0.1)

| Capability | Status | Notes |
|---|---|---|
| Read any assistant reply aloud | ✅ | Button next to every assistant message; pause/resume/stop; code blocks are skipped and replaced with a spoken marker |
| Auto-read new replies | ✅ | Toggle in the composer dock; waits ~1.4 s for the reply to settle |
| Dictate into the composer | ⚠️ Browser only | Uses the browser SpeechRecognition API; writes the transcript into the draft (optional auto-send) |
| Voice approval / plan confirmation | 🚧 Planned (P0.1) | Host approval events + spoken prompt + yes/no |
| Condensed tool-result announcements | 🚧 Planned (P0.2) | "12 tests, 2 failed in auth.ts" instead of reading raw logs |
| Mobile PWA / QR pairing | 🚧 Planned (P1) | Reuse DSH remote pairing ideas |

**Desktop note:** the DSH Desktop app is Electron, where Chromium's Web Speech
recognition is normally unavailable. TTS works; dictation currently needs a
Chromium browser (open the same Web UI in Chrome). Cloud-ASR fallback is planned
for v0.1 (Whisper-compatible endpoint or a local whisper server).

## Install (local development checkout)

1. Clone / keep this directory.
2. In DSH, open **Plugins → Add plugin** and pick this local directory
   (the manifest declares `dsh.bundle.patch`, so the directory is installable).
3. Restart or let HMR pick it up, then open a session: you should see the
   speak button on assistant replies and the mic + auto-read controls in the
   composer dock.

CLI alternative once the repo is public:

```sh
dsh plugin --profile web add github:shidesheng0218/dsh-duplex
```

Uninstall leaves no patches: the client bundle only registers slots and removes
its styles on dispose.

## Requirements

- DSH `>=0.2.1 <0.3.0` (web or desktop profile; the client bundle targets the web UI)
- A system voice for TTS (macOS/Windows/Linux ship one; Chromium needs at least one installed voice)
- For dictation: a Chromium-based browser (Chrome/Edge). Desktop Electron ASR is a known limitation, not a bug report

## Roadmap

- **P0.1** approval and user-question announcements with voice yes/no
- **P0.2** rule-based + optional small-model summaries of tool output
- **P1** continuous conversation, barge-in, global shortcut
- **P1.5** cloud/local ASR fallback for Electron and mobile browsers
- **P2** mobile PWA with QR pairing, TTS while screen locked

See [docs/PLAN.md](docs/PLAN.md) for the week-by-week plan, API seams, and
launch checklist, and [docs/DETAIL.md](docs/DETAIL.md) for the plugin detail page.

## Development

Plain JavaScript, no build step:

- `host/index.js` — Host half (no-op in v0.0.1; future event bridge)
- `client/client.js` — browser bundle (`window.__ModuleLoader__.load`, React from the module table)
- `locale/en.json`, `locale/zh.json` — plugin display metadata
- `docs/` — plan, demo script, detail page

Validate before installing:

```sh
node --check host/index.js
node --check client/client.js
for f in package.json locale/*.json; do jq empty "$f"; done
```

## Limitations

- Speech quality depends on the platform's system voices; this release does not
  ship neural TTS.
- Reading long replies is chunked; interruption/pause behaviour varies by
  browser engine.
- Transcripts are written into the draft, not submitted, unless auto-send is on.
- Dictation requires network access in most Chromium builds (browser speech
  service), which is also why Electron is unsupported for ASR today.

## License

MIT. Not affiliated with, endorsed by, or supported by DeepSeek.
