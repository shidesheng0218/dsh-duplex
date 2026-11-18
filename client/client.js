/**
 * dsh-duplex — Client half (browser bundle).
 *
 * v0.0.1 ships the "voice out + voice in" foundation:
 *   1. a speak button on every assistant reply (Web Speech TTS, no key needed);
 *   2. a microphone button in the composer input dock (Web Speech ASR) that
 *      writes the transcript into the draft, with optional auto-send;
 *   3. an auto-read toggle that speaks newly settled assistant replies.
 *
 * Planned in docs/PLAN.md (P0.1+): approval / user-question announcements,
 * condensed tool-result summaries, and a cloud-ASR fallback for the Electron
 * desktop app, where Chromium's Web Speech recognition is usually unavailable.
 *
 * Loaded by the DSH client module loader: id must equal the package name.
 */
window.__ModuleLoader__.load({
  id: 'dsh-duplex',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // ------------------------------------------------------------------ utils

    const LS = {
      autoread: 'dsh-duplex.autoread',
      autosend: 'dsh-duplex.autosend',
    }

    function isZh() {
      const lang = (document.documentElement.getAttribute('lang') || navigator.language || '').toLowerCase()
      return lang.startsWith('zh')
    }

    function t(zh, en) {
      return isZh() ? zh : en
    }

    function readFlag(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key)
        return raw === null ? fallback : raw === '1'
      } catch (_) {
        return fallback
      }
    }

    function writeFlag(key, value) {
      try {
        window.localStorage.setItem(key, value ? '1' : '0')
      } catch (_) {
        /* storage may be unavailable; the toggle still works for this page */
      }
    }

    // ----------------------------------------------------------- session text

    /**
     * Read the assistant nodes out of the session snapshot the host passes to
     * standard slot props. Shape verified against @deepseek-ai/dsh-client-ui-
     * conversation: session.chat.nodes is a store exposing values().
     */
    function assistantNodes(session) {
      const store = session && session.chat && session.chat.nodes
      if (!store) return []
      try {
        if (typeof store.values === 'function') return store.values() || []
        if (Array.isArray(store)) return store
      } catch (_) {
        /* fall through */
      }
      return []
    }

    function unwrapNode(entry) {
      return (entry && entry.node) || entry || null
    }

    function findAssistantNode(session, messageId) {
      if (!messageId) return null
      const all = assistantNodes(session)
      for (let i = 0; i < all.length; i++) {
        const node = unwrapNode(all[i])
        if (node && node.kind === 'assistant' && node.messageId === messageId) return node
      }
      return null
    }

    function lastAssistantNode(session) {
      const all = assistantNodes(session)
      for (let i = all.length - 1; i >= 0; i--) {
        const node = unwrapNode(all[i])
        if (node && node.kind === 'assistant' && node.messageId) return node
      }
      return null
    }

    function nodeText(node) {
      if (!node) return ''
      const blocks = node.blocks || node.content || []
      const parts = []
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        if (!block) continue
        if (typeof block === 'string') {
          parts.push(block)
          continue
        }
        if (block.kind === 'text' && typeof block.text === 'string') parts.push(block.text)
      }
      if (parts.length === 0 && typeof node.text === 'string') parts.push(node.text)
      return parts.join('\n').trim()
    }

    function findMessageText(session, messageId) {
      return nodeText(findAssistantNode(session, messageId))
    }

    /** Turn Markdown into something that sounds acceptable through TTS. */
    function stripMarkdown(markdown) {
      let text = String(markdown || '')
        .replace(/```[\s\S]*?```/g, t('，代码块。', ' , code block. '))
        .replace(/`([^`]*)`/g, '$1')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/https?:\/\/\S+/g, t('，链接。', ' , link. '))
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*>\s?/gm, '')
        .replace(/[*_~]{1,3}/g, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+[.)]\s+/gm, '')
        .replace(/\|/g, '，')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '。')
        .replace(/\n/g, '，')
        .trim()

      // The substitutions above can stack punctuation; collapse every run into
      // one mark so TTS does not read "comma full stop comma".
      text = text
        .replace(/\s+([。，；、！？!?])/g, '$1')
        .replace(/[，。；、！？!?]+/g, function (run) {
          const question = run.match(/[！？!?]/)
          if (question) return question[0]
          if (run.indexOf('。') >= 0) return '。'
          return '，'
        })
        .replace(/^[，；、。！？!?\s]+/, '')
        .replace(/[，；、。！？!?\s]+$/, '')
        .trim()

      return text
    }

    /** Split long replies into utterance-sized chunks (Chromium cuts long ones). */
    function chunkText(text, maxLength) {
      const limit = maxLength || 180
      const chunks = []
      let current = ''
      const parts = String(text).split(/(?<=[。！？!?；;\n])/)
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (!part) continue
        if ((current + part).length > limit) {
          if (current) chunks.push(current)
          current = part
        } else {
          current += part
        }
      }
      if (current) chunks.push(current)
      return chunks.filter((chunk) => chunk.trim().length > 0)
    }

    function speechSupported() {
      return typeof window !== 'undefined' && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function'
    }

    // --------------------------------------------------------- speech engine

    const speech = {
      messageId: null,
      chunks: [],
      index: 0,
      paused: false,
      active: false,
    }
    const speechListeners = new Set()

    function notifySpeech() {
      speechListeners.forEach((listener) => {
        try {
          listener()
        } catch (_) {
          /* a dead component must not break playback */
        }
      })
    }

    function resetSpeech() {
      speech.messageId = null
      speech.chunks = []
      speech.index = 0
      speech.paused = false
      speech.active = false
      notifySpeech()
    }

    function stopSpeaking() {
      try {
        window.speechSynthesis.cancel()
      } catch (_) {
        /* ignore */
      }
      resetSpeech()
    }

    function pickVoice(lang) {
      try {
        const voices = window.speechSynthesis.getVoices() || []
        const exact = voices.find((voice) => voice.lang && voice.lang.toLowerCase() === lang.toLowerCase())
        if (exact) return exact
        const prefix = lang.slice(0, 2).toLowerCase()
        return voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith(prefix)) || null
      } catch (_) {
        return null
      }
    }

    function speakNextChunk() {
      if (!speech.active) return
      if (speech.index >= speech.chunks.length) {
        resetSpeech()
        return
      }
      const synth = window.speechSynthesis
      const lang = isZh() ? 'zh-CN' : 'en-US'
      const utterance = new window.SpeechSynthesisUtterance(speech.chunks[speech.index++])
      utterance.lang = lang
      const voice = pickVoice(lang)
      if (voice) utterance.voice = voice
      utterance.rate = 1.02
      utterance.pitch = 1
      utterance.onend = function () {
        if (speech.active && !speech.paused) speakNextChunk()
      }
      utterance.onerror = function () {
        stopSpeaking()
      }
      try {
        synth.speak(utterance)
      } catch (_) {
        stopSpeaking()
      }
    }

    function speakText(text, messageId) {
      if (!speechSupported()) {
        toast(t('当前环境不支持系统语音合成', 'System speech synthesis is unavailable here'))
        return false
      }
      const spoken = stripMarkdown(text)
      if (!spoken) {
        toast(t('这条回复没有可朗读的内容', 'This reply has nothing to read aloud'))
        return false
      }
      stopSpeaking()
      speech.messageId = messageId || 'single'
      speech.chunks = chunkText(spoken)
      speech.index = 0
      speech.paused = false
      speech.active = true
      speakNextChunk()
      notifySpeech()
      return true
    }

    function togglePause() {
      if (!speech.active) return
      const synth = window.speechSynthesis
      if (speech.paused) {
        speech.paused = false
        try {
          synth.resume()
        } catch (_) {
          /* ignore */
        }
        // Some engines drop queued chunks after resume; continue defensively.
        if (!synth.speaking) speakNextChunk()
      } else {
        speech.paused = true
        try {
          synth.pause()
        } catch (_) {
          stopSpeaking()
        }
      }
      notifySpeech()
    }

    // ----------------------------------------------------------------- toast

    let toastElement = null
    let toastTimer = null

    function toast(message) {
      try {
        if (!toastElement) {
          toastElement = document.createElement('div')
          toastElement.id = 'dsh-duplex-toast'
          toastElement.style.cssText = [
            'position:fixed',
            'left:50%',
            'bottom:96px',
            'transform:translateX(-50%)',
            'max-width:min(520px,86vw)',
            'padding:10px 14px',
            'border-radius:10px',
            'background:rgba(18,24,38,.94)',
            'color:#e8f4ff',
            'font-size:13px',
            'line-height:1.45',
            'box-shadow:0 8px 28px rgba(0,0,0,.35)',
            'z-index:2147483000',
            'pointer-events:none',
            'opacity:0',
            'transition:opacity .18s ease',
          ].join(';')
          document.body.appendChild(toastElement)
        }
        toastElement.textContent = message
        toastElement.style.opacity = '1'
        if (toastTimer) window.clearTimeout(toastTimer)
        toastTimer = window.setTimeout(function () {
          if (toastElement) toastElement.style.opacity = '0'
        }, 2800)
      } catch (_) {
        /* a toast is best-effort */
      }
    }

    function copyText(text) {
      const fallback = function () {
        const area = document.createElement('textarea')
        area.value = text
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.focus()
        area.select()
        try {
          document.execCommand('copy')
          toast(t('已复制转写文字，粘贴到输入框即可', 'Transcript copied — paste it into the composer'))
        } catch (_) {
          toast(t('复制失败，请手动重试', 'Copy failed'))
        }
        document.body.removeChild(area)
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            toast(t('已复制转写文字，粘贴到输入框即可', 'Transcript copied — paste it into the composer'))
          },
          fallback,
        )
      } else {
        fallback()
      }
    }

    // ---------------------------------------------------------- speak button

    const MIC_SVG =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/></svg>'
    const SPEAKER_SVG =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h3l4 3.5v-11L7 10z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M17.8 7.2a7 7 0 0 1 0 9.6"/></svg>'
    const PAUSE_SVG =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>'
    const STOP_SVG =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>'
    const EQ_SVG =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><rect class="dsh-duplex-eq" x="4" y="10" width="2.6" height="4" rx="1"/><rect class="dsh-duplex-eq" x="9" y="7" width="2.6" height="10" rx="1"/><rect class="dsh-duplex-eq" x="14" y="9" width="2.6" height="6" rx="1"/><rect class="dsh-duplex-eq" x="19" y="11" width="2.6" height="2" rx="1"/></svg>'

    function SpeakButton(props) {
      const [state, setState] = React.useState('idle') // idle | speaking | paused
      const text = props.useSession
        ? props.useSession(function (session) {
            return findMessageText(session, props.messageId)
          })
        : ''

      React.useEffect(function () {
        const listener = function () {
          if (speech.messageId !== props.messageId) {
            setState('idle')
          } else if (speech.paused) {
            setState('paused')
          } else if (speech.active) {
            setState('speaking')
          } else {
            setState('idle')
          }
        }
        speechListeners.add(listener)
        listener()
        return function () {
          speechListeners.delete(listener)
        }
      }, [props.messageId])

      const disabled = !text || !speechSupported()

      function onClick() {
        if (state === 'speaking') {
          stopSpeaking()
          return
        }
        if (state === 'paused') {
          togglePause()
          return
        }
        speakText(text, props.messageId)
      }

      let icon = SPEAKER_SVG
      if (state === 'speaking') icon = EQ_SVG
      if (state === 'paused') icon = PAUSE_SVG

      const label =
        state === 'speaking'
          ? t('停止朗读', 'Stop reading')
          : state === 'paused'
            ? t('继续朗读', 'Resume reading')
            : t('朗读这条回复', 'Read this reply aloud')

      return h('button', {
        type: 'button',
        className: 'dsh-duplex-btn dsh-duplex-speak' + (state !== 'idle' ? ' is-active' : ''),
        title: disabled ? t('没有可朗读的内容', 'Nothing to read aloud') : label,
        'aria-label': label,
        disabled: disabled,
        onClick: onClick,
        dangerouslySetInnerHTML: { __html: icon },
      })
    }

    // ------------------------------------------------------------ mic button

    function getRecognition() {
      return window.SpeechRecognition || window.webkitSpeechRecognition || null
    }

    function MicButton(props) {
      const [listening, setListening] = React.useState(false)
      const [hint, setHint] = React.useState('')
      const recognitionRef = React.useRef(null)

      React.useEffect(function () {
        return function () {
          const recognition = recognitionRef.current
          if (recognition) {
            try {
              recognition.abort()
            } catch (_) {
              /* ignore */
            }
          }
        }
      }, [])

      function start() {
        const Recognition = getRecognition()
        if (!Recognition) {
          toast(
            t(
              '当前环境不支持浏览器语音识别（Electron 桌面端常见）。v0.1 会接入云端 ASR。',
              'Browser speech recognition is unavailable here (common in Electron). Cloud ASR is planned for v0.1.',
            ),
          )
          return
        }
        const recognition = new Recognition()
        recognitionRef.current = recognition
        recognition.lang = isZh() ? 'zh-CN' : 'en-US'
        recognition.interimResults = true
        recognition.continuous = false
        recognition.maxAlternatives = 1
        let finalText = ''

        recognition.onresult = function (event) {
          let interim = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i]
            if (result.isFinal) finalText += result[0].transcript
            else interim += result[0].transcript
          }
          setHint((finalText + interim).trim().slice(-36))
        }

        recognition.onerror = function (event) {
          setListening(false)
          setHint('')
          if (event && event.error === 'no-speech') {
            toast(t('没有听到声音', 'No speech detected'))
            return
          }
          toast(t('语音识别失败：', 'Speech recognition failed: ') + ((event && event.error) || 'unknown'))
        }

        recognition.onend = function () {
          setListening(false)
          setHint('')
          const text = finalText.trim()
          if (!text) return
          const wantAutoSend = readFlag(LS.autosend, false)
          const actions = props.inputActions
          if (actions && typeof actions.setDraft === 'function') {
            actions.setDraft(text)
            if (wantAutoSend && typeof actions.submit === 'function') {
              window.setTimeout(function () {
                actions.submit()
              }, 120)
            }
            return
          }
          copyText(text)
        }

        try {
          recognition.start()
          setListening(true)
          setHint(t('正在听…', 'Listening…'))
        } catch (error) {
          toast(t('无法启动麦克风：', 'Cannot start the microphone: ') + (error && error.message ? error.message : ''))
        }
      }

      function stop() {
        const recognition = recognitionRef.current
        if (!recognition) return
        try {
          recognition.stop()
        } catch (_) {
          /* ignore */
        }
      }

      const supported = !!getRecognition()
      const label = listening ? t('停止语音输入', 'Stop dictation') : t('语音输入到输入框', 'Dictate into the composer')

      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-duplex-btn dsh-duplex-mic' + (listening ? ' is-listening' : ''),
          title: supported
            ? label + (hint ? ' · ' + hint : '')
            : t('当前环境不支持；v0.1 接入云端 ASR', 'Unavailable in this environment; cloud ASR lands in v0.1'),
          'aria-label': label,
          onClick: listening ? stop : start,
          dangerouslySetInnerHTML: { __html: listening ? '<span class="dsh-duplex-mic-waves"></span>' : MIC_SVG },
        },
      )
    }

    // -------------------------------------------------------- auto-read toggle

    // The composer dock receives standard Session props (useSession, useInput,
    // inputActions). Wrap the toggle so those hooks are called legally.
    function AutoReadToggleSlot(props) {
      const [on, setOn] = React.useState(function () {
        return readFlag(LS.autoread, false)
      })
      const spokenRef = React.useRef('')
      const timerRef = React.useRef(null)

      const lastId = props.useSession
        ? props.useSession(function (session) {
            const node = lastAssistantNode(session)
            return node ? node.messageId : ''
          })
        : ''
      const lastText = props.useSession
        ? props.useSession(function (session) {
            return nodeText(lastAssistantNode(session))
          })
        : ''

      React.useEffect(
        function () {
          if (!on || !lastId || !lastText) return undefined
          if (spokenRef.current === lastId) return undefined
          if (timerRef.current) window.clearTimeout(timerRef.current)
          timerRef.current = window.setTimeout(function () {
            if (spokenRef.current === lastId) return
            spokenRef.current = lastId
            speakText(lastText, lastId)
          }, 1400)
          return function () {
            if (timerRef.current) window.clearTimeout(timerRef.current)
          }
        },
        [on, lastId, lastText],
      )

      function toggle() {
        setOn(function (previous) {
          const next = !previous
          writeFlag(LS.autoread, next)
          if (next) {
            spokenRef.current = lastId || ''
            toast(t('自动朗读已开启：新的回复会读出来', 'Auto-read on: new replies will be spoken'))
          } else {
            stopSpeaking()
            toast(t('自动朗读已关闭', 'Auto-read off'))
          }
          return next
        })
      }

      const label = on ? t('自动朗读：开', 'Auto-read: on') : t('自动朗读：关', 'Auto-read: off')

      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-duplex-btn dsh-duplex-autoread' + (on ? ' is-on' : ''),
          title: label,
          'aria-pressed': on,
          'aria-label': label,
          onClick: toggle,
        },
        h('span', { className: 'dsh-duplex-autoread-dot' }),
        t('自动读', 'Auto'),
      )
    }

    // ------------------------------------------------------- auto-send toggle

    function AutoSendToggle() {
      const [on, setOn] = React.useState(function () {
        return readFlag(LS.autosend, false)
      })

      function toggle() {
        setOn(function (previous) {
          const next = !previous
          writeFlag(LS.autosend, next)
          toast(next ? t('说完自动发送：开', 'Auto-send on') : t('说完自动发送：关', 'Auto-send off'))
          return next
        })
      }

      const label = on ? t('说完自动发送：开', 'Auto-send: on') : t('说完自动发送：关', 'Auto-send: off')

      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-duplex-btn dsh-duplex-autoread' + (on ? ' is-on' : ''),
          title: label,
          'aria-pressed': on,
          'aria-label': label,
          onClick: toggle,
        },
        h('span', { className: 'dsh-duplex-autoread-dot' }),
        t('自动发', 'Send'),
      )
    }

    // ------------------------------------------------------------------ styles

    const CSS = [
      '.dsh-duplex-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:26px;min-width:26px;padding:0 5px;border:none;border-radius:8px;background:transparent;color:inherit;cursor:pointer;font-size:12px;line-height:1;transition:background .15s ease,color .15s ease}',
      '.dsh-duplex-btn:hover{background:rgba(127,127,127,.16)}',
      '.dsh-duplex-btn:disabled{opacity:.35;cursor:not-allowed}',
      '.dsh-duplex-btn.is-active{background:rgba(47,143,255,.16);color:#2f8fff}',
      '.dsh-duplex-speak svg{display:block}',
      '.dsh-duplex-eq{animation:dsh-duplex-eq 1s ease-in-out infinite;transform-box:fill-box;transform-origin:center}',
      '.dsh-duplex-eq:nth-child(2){animation-delay:-.25s}',
      '.dsh-duplex-eq:nth-child(3){animation-delay:-.5s}',
      '.dsh-duplex-eq:nth-child(4){animation-delay:-.15s}',
      '@keyframes dsh-duplex-eq{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}',
      '.dsh-duplex-mic.is-listening{background:rgba(240,84,84,.16);color:#f05454}',
      '.dsh-duplex-mic-waves{display:block;width:12px;height:12px;border-radius:50%;background:currentColor;animation:dsh-duplex-pulse 1.1s ease-out infinite}',
      '@keyframes dsh-duplex-pulse{0%{box-shadow:0 0 0 0 rgba(240,84,84,.55)}100%{box-shadow:0 0 0 8px rgba(240,84,84,0)}}',
      '.dsh-duplex-autoread{font-size:11px;letter-spacing:.02em}',
      '.dsh-duplex-autoread-dot{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.35;transition:opacity .15s ease}',
      '.dsh-duplex-autoread.is-on{color:#2f8fff}',
      '.dsh-duplex-autoread.is-on .dsh-duplex-autoread-dot{opacity:1;box-shadow:0 0 6px currentColor}',
    ].join('\n')

    function ensureStyles() {
      if (document.getElementById('dsh-duplex-styles')) return function () {}
      const style = document.createElement('style')
      style.id = 'dsh-duplex-styles'
      style.textContent = CSS
      document.head.appendChild(style)
      return function () {
        if (style.parentNode) style.parentNode.removeChild(style)
      }
    }

    // ----------------------------------------------------------- client plugin

    const inject = ['slots']

    function apply(ctx) {
      ctx.effect(function () {
        return ensureStyles()
      })

      ctx.slots.inject('conversation.chat.assistant-actions', function () {
        return ctx.slots.register(
          {
            name: 'conversation.chat.assistant-actions',
            id: 'dsh-duplex-speak',
            order: 6,
            label: t('朗读', 'Read aloud'),
          },
          SpeakButton,
        )
      })

      ctx.slots.inject('conversation.input.dock', function () {
        return ctx.slots.register(
          {
            name: 'conversation.input.dock',
            id: 'dsh-duplex-mic',
            order: 20,
            label: t('语音输入', 'Dictate'),
          },
          MicButton,
        )
      })

      ctx.slots.inject('conversation.input.dock', function () {
        return ctx.slots.register(
          {
            name: 'conversation.input.dock',
            id: 'dsh-duplex-autoread',
            order: 21,
            label: t('自动朗读', 'Auto-read'),
          },
          AutoReadToggleSlot,
        )
      })

      ctx.slots.inject('conversation.input.dock', function () {
        return ctx.slots.register(
          {
            name: 'conversation.input.dock',
            id: 'dsh-duplex-autosend',
            order: 22,
            label: t('说完自动发送', 'Auto-send'),
          },
          AutoSendToggle,
        )
      })
    }

    return {
      inject: inject,
      apply: apply,
    }
  },
})
