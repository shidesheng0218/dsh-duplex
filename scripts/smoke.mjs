#!/usr/bin/env node
/**
 * Dependency-free smoke test for the dsh-duplex client bundle.
 *
 * It loads client/client.js in a `vm` sandbox with stubbed DOM/React and a
 * fake speech stack, applies the plugin with stub services, then exercises:
 *   - manifest, locale and slot registration checks;
 *   - rendering every registered component;
 *   - read-aloud Markdown stripping;
 *   - voice approval: off by default, spoken allow/reject, high-risk double
 *     confirmation, question option selection, and turn summaries.
 *
 * Run with `npm test`. No network, no install, no browser needed.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const checks = []

function check(name, condition, detail) {
  checks.push(name)
  if (!condition) failures.push(name + (detail ? ': ' + detail : ''))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------- manifest

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
check('package name', pkg.name === 'dsh-duplex', pkg.name)
check('bundle patch declared', Boolean(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch))
check('client platform declared', Boolean(pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web'))
check('bundle patch file exists', existsSync(join(root, pkg.dsh.bundle.patch)))
check('client entry exists', existsSync(join(root, 'client/client.js')))
check('host entry exists', existsSync(join(root, 'host/index.js')))
check('icon exists', existsSync(join(root, 'icon.svg')))

for (const locale of ['en.json', 'zh.json']) {
  const path = join(root, 'locale', locale)
  check('locale ' + locale + ' exists', existsSync(path))
  if (!existsSync(path)) continue
  const data = JSON.parse(readFileSync(path, 'utf8'))
  check('locale ' + locale + ' meta.title', typeof data.meta?.title === 'string' && data.meta.title.length > 0)
  check('locale ' + locale + ' meta.description', typeof data.meta?.description === 'string' && data.meta.description.length > 0)
}

// ------------------------------------------------------------ client bundle

const cleanups = []
const utterances = []
const recognitions = []
const activeUtterances = new Set()
let speechScript = []

const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: (fn) => {
    try {
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    } catch (error) {
      failures.push('useEffect threw: ' + error.message)
    }
  },
  useRef: (value) => ({ current: value }),
}

function element() {
  return {
    style: {},
    textContent: '',
    id: '',
    appendChild() {},
    removeChild() {},
    setAttribute() {},
    getAttribute: () => null,
  }
}

const documentStub = {
  documentElement: { getAttribute: () => 'zh-CN' },
  getElementById: () => null,
  createElement: () => element(),
  head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {} },
}

const storage = new Map()
const windowStub = {
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
  setTimeout,
  clearTimeout,
  addEventListener() {},
  removeEventListener() {},
  speechSynthesis: {
    getVoices: () => [{ lang: 'zh-CN', name: 'Test zh' }],
    speak(utterance) {
      utterances.push(utterance.text)
      activeUtterances.add(utterance)
      setTimeout(() => {
        if (utterance.__cancelled) return
        activeUtterances.delete(utterance)
        if (typeof utterance.onend === 'function') utterance.onend()
      }, 1)
    },
    cancel() {
      for (const utterance of activeUtterances) utterance.__cancelled = true
      activeUtterances.clear()
    },
    pause() {},
    resume() {},
    speaking: false,
  },
  SpeechSynthesisUtterance: function (text) {
    this.text = text
  },
  // Scripted recognition: every start() consumes the next transcript.
  SpeechRecognition: class FakeRecognition {
    constructor() {
      this.lang = ''
      this.interimResults = false
      this.continuous = false
      this.maxAlternatives = 1
      this.aborted = false
      recognitions.push(this)
    }

    start() {
      const next = speechScript.shift()
      if (!next) {
        setTimeout(() => {
          if (!this.aborted && typeof this.onend === 'function') this.onend()
        }, 5)
        return
      }
      setTimeout(() => {
        if (this.aborted) return
        if (typeof this.onresult === 'function') {
          this.onresult({ resultIndex: 0, results: [{ 0: { transcript: next } }] })
        }
        if (typeof this.onend === 'function') this.onend()
      }, 5)
    }

    abort() {
      this.aborted = true
    }

    stop() {
      this.aborted = true
    }
  },
}
windowStub.document = documentStub

// Deterministic tests: skip the TTS-to-mic guard gap.
windowStub.__DSH_DUPLEX_LISTEN_DELAY__ = 0

const sandbox = {
  window: windowStub,
  document: documentStub,
  navigator: { language: 'zh-CN' },
  console,
  setTimeout,
  clearTimeout,
  Math,
  String,
  Array,
  Object,
  JSON,
  Promise,
}

let moduleDefinition = null
sandbox.window.__ModuleLoader__ = {
  load(definition) {
    moduleDefinition = definition
    sandbox.__module = definition.factory((name) => {
      if (name === 'react') return ReactStub
      throw new Error('unexpected module request: ' + name)
    })
  },
}
vm.createContext(sandbox)
vm.runInContext(readFileSync(join(root, 'client/client.js'), 'utf8'), sandbox, { filename: 'client/client.js' })

check('module id', moduleDefinition && moduleDefinition.id === 'dsh-duplex', String(moduleDefinition && moduleDefinition.id))
const mod = sandbox.__module
check('apply exported', Boolean(mod) && typeof mod.apply === 'function')
check('slots injected', Array.isArray(mod?.inject) && mod.inject.includes('slots'))
check('uiSession injected', Array.isArray(mod?.inject) && mod.inject.includes('uiSession'))

// ------------------------------------------------------- stub plugin host

const registered = []
const publishListeners = new Set()
const status = {
  map: new Map(),
  getSnapshot() {
    return status.map
  },
  subscribe(listener) {
    publishListeners.add(listener)
    return () => publishListeners.delete(listener)
  },
}
function publish(entries) {
  status.map = new Map(entries)
  for (const listener of [...publishListeners]) listener()
}

const ctx = {
  effect(fn) {
    const cleanup = fn()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
    return cleanup
  },
  uiSession: { sessionStatus: status },
  slots: {
    inject(_name, callback) {
      return callback()
    },
    register(options, component) {
      registered.push({ name: options.name, id: options.id, component })
      return () => {}
    },
  },
}
mod.apply(ctx)

const expected = [
  ['conversation.chat.assistant-actions', 'dsh-duplex-speak'],
  ['conversation.input.dock', 'dsh-duplex-mic'],
  ['conversation.input.dock', 'dsh-duplex-autoread'],
  ['conversation.input.dock', 'dsh-duplex-autosend'],
  ['conversation.input.dock', 'dsh-duplex-voice-approval'],
]
for (const [name, id] of expected) {
  check('slot ' + id, registered.some((entry) => entry.name === name && entry.id === id))
}

// ------------------------------------------------------------- render pass

const session = {
  chat: {
    nodes: {
      values: () => [
        {
          node: {
            kind: 'assistant',
            messageId: 'm1',
            turn: 3,
            blocks: [
              {
                kind: 'text',
                text: '## 结论\n\n跑了 12 个测试，2 个失败。\n\n```js\nconst x = 1\n```\n\n详见 https://example.com 。',
              },
            ],
          },
        },
        { node: { kind: 'tool-call', turn: 3, data: { root: { name: 'bash' } } } },
        { node: { kind: 'tool-call', turn: 3, data: { root: { name: 'read' } } } },
        { node: { kind: 'tool-call', turn: 3, data: { root: { name: 'bash' } } } },
      ],
    },
  },
}

const props = {
  messageId: 'm1',
  useSession: (selector) => selector(session),
  inputActions: { setDraft() {}, submit() {} },
}
const rendered = new Map()
for (const entry of registered) {
  try {
    const node = entry.component(props)
    rendered.set(entry.id, node)
    check('render ' + entry.id, Boolean(node && node.type))
  } catch (error) {
    check('render ' + entry.id, false, error.message)
  }
}

// Speak path: click the assistant-actions button and inspect what TTS got.
try {
  const button = rendered.get('dsh-duplex-speak')
  button.props.onClick()
  const speech = utterances.join(' ')
  check('speak produced utterances', utterances.length > 0)
  check('speak includes reply text', /12 个测试/.test(speech), speech.slice(0, 80))
  check('speak skips markdown fences', !speech.includes('```'))
  check('speak skips urls', !speech.includes('example.com'))
  check('speak has no punctuation runs', !/[，。；]{2,}/.test(speech), speech.slice(0, 80))
} catch (error) {
  check('speak click', false, error.message)
}

// Mic path: no unsolicited dictation in this sandbox.
try {
  rendered.get('dsh-duplex-mic').props.onClick()
  check('mic click degrades gracefully', true)
} catch (error) {
  check('mic click degrades gracefully', false, error.message)
}

// -------------------------------------------------------- voice approvals

function approval(overrides) {
  return Object.assign(
    {
      kind: 'approval',
      key: 'a1',
      sessionId: 's1',
      toolName: 'bash',
      reason: 'run the failing tests',
      answerable: true,
      answered: null,
      answer(outcome) {
        this.answered = outcome
        return Promise.resolve()
      },
    },
    overrides,
  )
}

function question(overrides) {
  return Object.assign(
    {
      kind: 'question',
      key: 'q1',
      sessionId: 's1',
      answerable: true,
      answered: null,
      questions: [
        {
          id: 'q1',
          question: '用哪个数据库？',
          options: [{ label: 'Postgres' }, { label: 'SQLite' }],
        },
      ],
      answer(answer) {
        this.answered = answer
        return Promise.resolve()
      },
    },
    overrides,
  )
}

function statusFor(interaction) {
  return [['s1', { running: true, pendingInteraction: interaction, completionUnread: false }]]
}

// 1) Off by default: a pending approval must not speak.
const baseline = utterances.length
const idleApproval = approval({ key: 'idle' })
publish(statusFor(idleApproval))
await sleep(40)
check('voice approval off by default', utterances.length === baseline, 'spoke ' + (utterances.length - baseline) + ' utterances')
check('voice approval off leaves request unanswered', idleApproval.answered === null)

// Turn it on through the persisted flag (what the dock toggle writes).
storage.set('dsh-duplex.voice-approval', '1')

// 2) High-risk tool: allow needs a second confirmation.
const risky = approval({ key: 'risky' })
speechScript = ['批准', '确认批准']
publish(statusFor(risky))
await sleep(120)
check('risky approval speaks a prompt', utterances.some((line) => line.includes('需要你批准') || line.includes('高风险')), utterances.slice(-3).join(' | '))
await sleep(120)
check('risky approval asks for confirmation', utterances.some((line) => line.includes('高风险操作')), utterances.slice(-4).join(' | '))
await sleep(160)
check('risky approval allowed after confirmation', risky.answered === 'allowed-once', String(risky.answered))

// 3) Non-risky tool: one word is enough.
const safe = approval({ key: 'safe', toolName: 'read', reason: 'inspect the auth module' })
speechScript = ['批准']
publish(statusFor(safe))
await sleep(220)
check('safe approval allowed once', safe.answered === 'allowed-once', String(safe.answered))

// 4) Rejection.
const denied = approval({ key: 'denied', toolName: 'read' })
speechScript = ['拒绝']
publish(statusFor(denied))
await sleep(220)
check('spoken reject rejected the request', denied.answered === 'rejected', String(denied.answered))

// 5) High-risk cancellation on the second step settles nothing.
const cancelledApproval = approval({ key: 'cancelled' })
speechScript = ['批准', '取消']
publish(statusFor(cancelledApproval))
await sleep(320)
check('cancelled confirmation leaves the request unanswered', cancelledApproval.answered === null, String(cancelledApproval.answered))

// 6) Single-select question answered by ordinal.
const picked = question({ key: 'pick' })
speechScript = ['第二个']
publish(statusFor(picked))
await sleep(320)
check(
  'question answered by ordinal',
  Boolean(picked.answered && picked.answered.answers && picked.answered.answers[0].selected[0] === 'SQLite'),
  JSON.stringify(picked.answered),
)

// 7) Ambiguous speech asks again but never settles the request.
const ambiguous = approval({ key: 'ambiguous', toolName: 'read' })
speechScript = ['嗯……那个', '嗯']
publish(statusFor(ambiguous))
await sleep(450)
check('ambiguous speech never settles', ambiguous.answered === null, String(ambiguous.answered))
check('ambiguous speech asks again', utterances.some((line) => line.includes('没听清')), utterances.slice(-2).join(' | '))

// 8) A withdrawn request is never answered from speech.
const withdrawn = approval({ key: 'withdrawn', toolName: 'read', answerable: false })
speechScript = ['批准']
publish(statusFor(withdrawn))
await sleep(200)
check('withdrawn request not answered', withdrawn.answered === null, String(withdrawn.answered))

// 9) Unknown pending-interaction kinds are ignored.
const beforeUnknown = utterances.length
publish([['s1', { running: true, pendingInteraction: { kind: 'note', key: 'n1', sessionId: 's1' }, completionUnread: false }]])
await sleep(120)
check('unknown interaction kind ignored', utterances.length === beforeUnknown, 'spoke ' + (utterances.length - beforeUnknown))

// 10) Multi-select questions are announced only, never answered by voice.
const multi = question({
  key: 'multi',
  questions: [{ id: 'multi', question: '选哪些？', options: [{ label: 'A' }, { label: 'B' }], multiSelect: true }],
})
publish(statusFor(multi))
await sleep(220)
check('multi-select question not answered', multi.answered === null, JSON.stringify(multi.answered))
check('multi-select question announced for the UI', utterances.some((line) => line.includes('请在界面上选择')), utterances.slice(-2).join(' | '))

// 11) Turn summary in auto-read.
storage.set('dsh-duplex.autoread', '1')
const autoRead = rendered.get('dsh-duplex-autoread')
try {
  // The test React stub runs effects at render time, so re-render to arm the timer.
  autoRead && autoRead.type
  const autoReadComponent = registered.find((entry) => entry.id === 'dsh-duplex-autoread').component
  autoReadComponent(props)
  await sleep(1700)
  check('auto-read speaks the turn summary', utterances.some((line) => line.includes('本轮用了')), utterances.slice(-3).join(' | '))
} catch (error) {
  check('auto-read turn summary', false, error.message)
}

// -------------------------------------------------------------------- report

for (const name of checks) {
  if (!failures.some((failure) => failure.startsWith(name))) console.log('ok   ' + name)
}
if (failures.length > 0) {
  console.error('\n' + failures.length + ' check(s) failed:')
  for (const failure of failures) console.error('fail ' + failure)
  process.exit(1)
}
console.log('\nall ' + checks.length + ' checks passed')
