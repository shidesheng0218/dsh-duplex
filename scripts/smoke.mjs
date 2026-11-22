#!/usr/bin/env node
/**
 * Dependency-free smoke test for the dsh-duplex client bundle.
 *
 * It loads client/client.js in a `vm` sandbox with stubbed DOM/React, applies
 * the plugin with a stub `ctx.slots`, renders every registered component, and
 * exercises the read-aloud code path with a fake speechSynthesis engine.
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

const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
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

const spokenUtterances = []
const windowStub = {
  localStorage: { getItem: () => null, setItem() {} },
  setTimeout,
  clearTimeout,
  addEventListener() {},
  removeEventListener() {},
  speechSynthesis: {
    getVoices: () => [{ lang: 'zh-CN', name: 'Test zh' }],
    speak(utterance) {
      spokenUtterances.push(utterance.text)
    },
    cancel() {},
    pause() {},
    resume() {},
    speaking: false,
  },
  SpeechSynthesisUtterance: function (text) {
    this.text = text
  },
}
windowStub.document = documentStub

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

const registered = []
const ctx = {
  effect(fn) {
    return fn()
  },
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
]
for (const [name, id] of expected) {
  check('slot ' + id, registered.some((entry) => entry.name === name && entry.id === id))
}

// ------------------------------------------------------------------- render

const session = {
  chat: {
    nodes: {
      values: () => [
        {
          node: {
            kind: 'assistant',
            messageId: 'm1',
            blocks: [
              {
                kind: 'text',
                text: '## 结论\n\n跑了 12 个测试，2 个失败。\n\n```js\nconst x = 1\n```\n\n详见 https://example.com 。',
              },
            ],
          },
        },
      ],
    },
  },
}

const props = {
  messageId: 'm1',
  useSession: (selector) => selector(session),
  inputActions: {
    setDraft() {},
    submit() {},
  },
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
  const speech = spokenUtterances.join(' ')
  check('speak produced utterances', spokenUtterances.length > 0)
  check('speak includes reply text', /12 个测试/.test(speech), speech.slice(0, 80))
  check('speak skips markdown fences', !speech.includes('```'))
  check('speak skips urls', !speech.includes('example.com'))
  check('speak has no punctuation runs', !/[，。；]{2,}/.test(speech), speech.slice(0, 80))
} catch (error) {
  check('speak click', false, error.message)
}

// Mic path: no SpeechRecognition in this sandbox, so a click must not throw.
try {
  rendered.get('dsh-duplex-mic').props.onClick()
  check('mic click degrades gracefully', true)
} catch (error) {
  check('mic click degrades gracefully', false, error.message)
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
