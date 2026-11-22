# Changelog

All notable changes to `dsh-duplex` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
semantic versioning.

## [0.1.0] - 2026-11-22

Voice approval lands. This is the release the project was built around: the
agent can now ask for a decision out loud, and a spoken decision settles it —
with a hard safety stance for destructive tools.

### Added

- **Voice approval**: pending approvals are announced ("需要你批准：bash，原因：…")
  and accept a spoken `批准` / `拒绝` (or English `approve` / `reject`).
- **High-risk double confirmation**: `bash`, `shell`, `pwsh`, `terminal`,
  `exec`, `computer`, `browser` and similar tools require a second spoken
  `确认批准` (`confirm approve`); saying `取消` in that step cancels.
- **Voice answers for questions and plan reviews**: single-select questions with
  up to five options are answered by number ("第二个") or option label; plan
  reviews are approved/declined by voice. Multi-select and multi-question
  batches are announced but left to the UI.
- **Turn activity summary**: auto-read now prefixes replies with a short summary
  of the turn's tool calls (e.g. "本轮用了 3 个工具：bash ×2、read").
- **`🎙 语音审批` toggle** in the composer dock (persisted locally).
- **Safety behaviours**: ambiguous speech asks once and then leaves the request
  to the UI; withdrawn/unanswerable requests are never settled; unknown pending
  interaction kinds are ignored; nothing is approved without explicit speech.
- 18 new smoke-test checks covering allow, reject, high-risk confirmation,
  cancellation, ordinal selection, ambiguous speech, withdrawn requests,
  multi-select fallback and turn summaries.

### Changed

- The read-aloud engine gained a completion callback, so prompts and the
  microphone hand-off are sequenced instead of racing.
- Assistant/tool node extraction now tolerates both `node.blocks` and
  `node.data.blocks` shapes.
- README/DETAIL rewritten around the approval workflow and its safety model.

### Fixed

- Speech recognition is opened ~220 ms after a prompt ends, so the microphone no
  longer hears the tail of the text-to-speech output.

## [0.0.1] - 2026-11-18

First public skeleton.

### Added

- Installable DSH bundle (`dsh.bundle.patch`, client bundle via `dsh.client`).
- Read any assistant reply aloud (pause/resume/stop, code blocks and URLs
  replaced by short spoken markers).
- Auto-read new assistant replies after they settle.
- Dictate into the composer through browser speech recognition, with optional
  auto-send.
- Bilingual README, plugin detail page, icon, locale metadata, MIT license.
- GitHub Actions CI: syntax checks, manifest checks and a dependency-free
  client bundle smoke test.
