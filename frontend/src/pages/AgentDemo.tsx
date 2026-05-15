import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Terminal, Sparkles, CheckCircle2, Navigation, Activity, RotateCcw, Wallet, Loader2, AlertCircle, Key, Eye, EyeOff } from 'lucide-react'
import { use0gCompute, NETWORKS, type NetworkType } from '../hooks/use0gCompute'
import { useQiniuCompute, fetchQiniuModels, type QiniuModel } from '../hooks/useQiniuCompute'
import { useT } from '../i18n'

type ProviderKind = 'zerog' | 'qiniu'
const QINIU_KEY_STORAGE = 'concourse_qiniu_key'
const QINIU_MODEL_STORAGE = 'concourse_qiniu_model'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface LogEntry {
  time: string
  text: string
  type: 'info' | 'action' | 'success' | 'error'
}

export default function AgentDemo() {
  const { t } = useT()

  // Both providers are instantiated unconditionally (rules of hooks).
  // The active one is selected at render time based on `providerKind`.
  // The idle hook just keeps its initial state — no network calls.
  const zerog = use0gCompute()
  const qiniu = useQiniuCompute()

  const [providerKind, setProviderKind] = useState<ProviderKind>('zerog')
  const active = providerKind === 'qiniu' ? qiniu : zerog
  const { ready, model, error: computeError, loading: computeLoading, step, chat } = active
  const connectedNetwork = zerog.network  // 0G-specific badge field

  const [selectedNetwork, setSelectedNetwork] = useState<NetworkType>('testnet')

  // Qiniu inputs — persist key + model in sessionStorage so a refresh
  // doesn't ask the visitor to re-paste them, but they vanish on tab close.
  const [qiniuKey, setQiniuKey] = useState<string>('')
  const [qiniuModelId, setQiniuModelId] = useState<string>('')
  const [qiniuModels, setQiniuModels] = useState<QiniuModel[]>([])
  const [qiniuModelsLoading, setQiniuModelsLoading] = useState<boolean>(false)
  const [qiniuKeyRevealed, setQiniuKeyRevealed] = useState<boolean>(false)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Restore stored Qiniu inputs once on mount.
  useEffect(() => {
    try {
      const k = sessionStorage.getItem(QINIU_KEY_STORAGE) ?? ''
      const m = sessionStorage.getItem(QINIU_MODEL_STORAGE) ?? ''
      if (k) setQiniuKey(k)
      if (m) setQiniuModelId(m)
    } catch { /* ignore */ }
  }, [])

  // Lazy-load the Qiniu model catalog the first time the user switches
  // to Qiniu mode. Public endpoint — no key needed.
  useEffect(() => {
    if (providerKind !== 'qiniu' || qiniuModels.length > 0 || qiniuModelsLoading) return
    setQiniuModelsLoading(true)
    fetchQiniuModels()
      .then(list => {
        setQiniuModels(list)
        // Default to deepseek-v3.2 if present, else first model.
        if (!qiniuModelId && list.length > 0) {
          const preferred = list.find(m => m.id.toLowerCase().includes('deepseek')) ?? list[0]
          setQiniuModelId(preferred.id)
        }
      })
      .catch(() => { /* let user know via the inline error path if needed */ })
      .finally(() => setQiniuModelsLoading(false))
  }, [providerKind, qiniuModels.length, qiniuModelsLoading, qiniuModelId])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  const addLog = (text: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, {
      time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      text,
      type,
    }])
  }

  const handleConnect = async () => {
    if (providerKind === 'qiniu') {
      // Persist before connecting so even a failed connect leaves the
      // user's typed values around (annoying to lose them on a typo).
      try {
        if (qiniuKey) sessionStorage.setItem(QINIU_KEY_STORAGE, qiniuKey)
        if (qiniuModelId) sessionStorage.setItem(QINIU_MODEL_STORAGE, qiniuModelId)
      } catch { /* ignore */ }
      await qiniu.connect(qiniuKey, qiniuModelId, addLog)
    } else {
      await zerog.connect(selectedNetwork, addLog)
    }
  }

  // Switching providers should reset chat history + logs so the user
  // doesn't see stale context from the previous backend.
  const switchProvider = (next: ProviderKind) => {
    if (next === providerKind) return
    setProviderKind(next)
    setMessages([])
    setLogs([])
  }

  const handleSend = async () => {
    if (!input.trim() || loading || !ready) return
    const userMsg = input.trim()
    const newMessages: Message[] = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    addLog(`User: "${userMsg}"`, 'info')

    try {
      const reply = await chat(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        (entry) => {
          const logType: LogEntry['type'] =
            entry.type === 'tool_call' ? 'action' :
            entry.type === 'tool_result' ? 'success' :
            entry.type === 'error' ? 'error' : 'info'
          const logText =
            entry.type === 'tool_call' ? `Tool Call: ${entry.name}(${JSON.stringify(entry.args)})` :
            entry.type === 'tool_result' ? `Result [${entry.name}]: ${entry.text}` :
            entry.text || ''
          addLog(logText, logType)
        },
      )

      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      addLog(t('demo.log.responded'), 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('demo.log.unknownError')
      addLog(`Error: ${msg}`, 'error')
      setMessages(prev => [...prev, { role: 'assistant', content: t('demo.chat.errorReply', { msg }) }])
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setMessages([])
    setLogs([])
  }

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <Bot className="w-8 h-8 text-indigo-600" />
            {t('demoPage.title')}
          </h1>
          <p className="text-slate-500 mt-2 text-lg font-light">
            {t('demoPage.subtitle')}
          </p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          {t('demoPage.reset')}
        </button>
      </div>

      {/* Connection Status Bar — provider-aware */}
      {!ready && (
        <div className="mb-6 p-4 bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
          {/* Provider toggle */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => switchProvider('zerog')}
              disabled={computeLoading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                providerKind === 'zerog'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              {t('demo.provider.zerog')}
            </button>
            <button
              onClick={() => switchProvider('qiniu')}
              disabled={computeLoading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                providerKind === 'qiniu'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              {t('demo.provider.qiniu')}
            </button>
          </div>

          {providerKind === 'zerog' ? (
            // ─── 0G Compute: wallet-paid inference ───
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wallet className="w-5 h-5 text-indigo-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t('demo.connectTitle')}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('demo.connect.desc')}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedNetwork}
                    onChange={(e) => setSelectedNetwork(e.target.value as NetworkType)}
                    disabled={computeLoading}
                    className="text-sm font-medium border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                  >
                    {Object.entries(NETWORKS).map(([key, net]) => (
                      <option key={key} value={key}>{net.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleConnect}
                    disabled={computeLoading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
                  >
                    {computeLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('demo.connect.connecting')}
                      </>
                    ) : (
                      <>
                        <Wallet className="w-4 h-4" />
                        {t('demo.connect.cta')}
                      </>
                    )}
                  </button>
                </div>
                {step && (
                  <span className="text-xs text-indigo-500 font-medium animate-pulse">{step}</span>
                )}
              </div>
            </div>
          ) : (
            // ─── Qiniu AIGC: API-key-paid inference ───
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 text-indigo-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t('demo.qiniu.title')}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t('demo.qiniu.desc')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('demo.qiniu.apiKey')}
                  </label>
                  <div className="relative">
                    <input
                      type={qiniuKeyRevealed ? 'text' : 'password'}
                      value={qiniuKey}
                      onChange={(e) => setQiniuKey(e.target.value)}
                      placeholder="sk-…"
                      disabled={computeLoading}
                      autoComplete="off"
                      className="w-full text-sm font-mono border border-slate-200 rounded-xl px-3 py-2.5 pr-10 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setQiniuKeyRevealed(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                      aria-label={qiniuKeyRevealed ? 'Hide key' : 'Show key'}
                    >
                      {qiniuKeyRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('demo.qiniu.model')}
                  </label>
                  <select
                    value={qiniuModelId}
                    onChange={(e) => setQiniuModelId(e.target.value)}
                    disabled={computeLoading || qiniuModelsLoading}
                    className="w-full text-sm font-medium border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                  >
                    {qiniuModelsLoading ? (
                      <option>{t('demo.qiniu.loadingModels')}</option>
                    ) : qiniuModels.length === 0 ? (
                      <option>{t('demo.qiniu.noModels')}</option>
                    ) : (
                      qiniuModels.map(m => (
                        <option key={m.id} value={m.id}>{m.id}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <a
                  href="https://portal.qiniu.com/aitoken/key"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  {t('demo.qiniu.getKey')} →
                </a>
                <button
                  onClick={handleConnect}
                  disabled={computeLoading || !qiniuKey || !qiniuModelId}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
                >
                  {computeLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('demo.connect.connecting')}
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4" />
                      {t('demo.qiniu.cta')}
                    </>
                  )}
                </button>
              </div>
              {step && (
                <span className="block text-xs text-indigo-500 font-medium animate-pulse">{step}</span>
              )}
            </div>
          )}

          {computeError && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 p-3 rounded-xl">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{computeError}</span>
            </div>
          )}
        </div>
      )}

      {ready && (
        <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200/60 rounded-2xl flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex-1">
            {providerKind === 'qiniu' ? (
              <>
                <p className="text-sm font-semibold text-emerald-800">
                  {t('demo.qiniu.connectedBadge')}
                </p>
                <p className="text-xs text-emerald-600 font-mono">
                  {t('demo.qiniu.connectedModel', { model: model || '' })}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-emerald-800">
                  {t('demo.connectBadge', { network: NETWORKS[connectedNetwork || 'testnet'].name })}
                </p>
                <p className="text-xs text-emerald-600 font-mono">
                  {t('demo.connected.model', {
                    model: model || '',
                    provider: `${zerog.provider?.slice(0, 8)}...${zerog.provider?.slice(-4)}`,
                  })}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 h-[700px]">
        {/* Chat Interface */}
        <div className="lg:col-span-3 bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 flex flex-col overflow-hidden relative">
          {/* Header */}
          <div className="p-5 border-b border-slate-200/60 bg-white/50 flex items-center justify-between z-10 relative">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center shadow-md">
                  <Sparkles className="text-white w-5 h-5" />
                </div>
                <div className={`absolute bottom-0 right-0 w-3 h-3 ${ready ? 'bg-green-500' : 'bg-slate-400'} border-2 border-white rounded-full`}></div>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 leading-tight">{t('demo.agentName')}</h3>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${ready ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 bg-slate-100'} px-2 py-0.5 rounded-full w-fit mt-0.5`}>
                  <CheckCircle2 className="w-3 h-3" />
                  {ready ? t('demo.agentStatus.ready', { model: model || '' }) : t('demo.agentStatus.notConnected')}
                </div>
              </div>
            </div>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth z-10 relative">
            {!ready && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
                <Wallet className="w-12 h-12 opacity-40" />
                <div className="text-center">
                  <p className="font-medium text-slate-500">{t('demo.empty.title')}</p>
                  <p className="text-sm mt-1">{t('demo.empty.subtitle')}</p>
                </div>
              </div>
            )}
            {ready && messages.length === 0 && (
              <div className="flex justify-start">
                <div className="max-w-[85%] p-4 text-[15px] leading-relaxed shadow-sm bg-white border border-slate-100 text-slate-700 rounded-2xl rounded-tl-sm">
                  <p>
                    {t('demo.greeting').split('**').map((part, k) =>
                      k % 2 === 1 ? <strong key={k} className="text-slate-900 font-bold">{part}</strong> : part,
                    )}
                  </p>
                  <p className="mt-3">{t('demo.greeting.canDo')}</p>
                  <p className="ml-3 mt-1 flex items-start gap-1.5"><span className="text-indigo-400 mt-0.5">•</span><span>{t('demo.greeting.ex1')}</span></p>
                  <p className="ml-3 mt-1 flex items-start gap-1.5"><span className="text-indigo-400 mt-0.5">•</span><span>{t('demo.greeting.ex2')}</span></p>
                  <p className="ml-3 mt-1 flex items-start gap-1.5"><span className="text-indigo-400 mt-0.5">•</span><span>{t('demo.greeting.ex3')}</span></p>
                  <p className="mt-3">{t('demo.greeting.ask')}</p>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 text-[15px] leading-relaxed shadow-sm ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white rounded-2xl rounded-tr-sm'
                    : 'bg-white border border-slate-100 text-slate-700 rounded-2xl rounded-tl-sm'
                }`}>
                  {m.content.split('\n').map((line, j) => {
                    if (line.startsWith('```')) return null
                    if (line.startsWith('- ')) {
                      const formatted = line.slice(2).split('**').map((part, k) =>
                        k % 2 === 1 ? <strong key={k} className={m.role === 'user' ? 'text-white font-bold' : 'text-slate-900 font-bold'}>{part}</strong> : part
                      )
                      return <p key={j} className="ml-3 mt-1 flex items-start gap-1.5"><span className="text-indigo-400 mt-0.5">•</span><span>{formatted}</span></p>
                    }
                    return (
                      <p key={j} className={j > 0 ? "mt-3" : ""}>
                        {line.includes('**')
                          ? line.split('**').map((part, k) => k % 2 === 1 ? <strong key={k} className={m.role === 'user' ? 'text-white font-bold' : 'text-slate-900 font-bold'}>{part}</strong> : part)
                          : line.includes('`')
                            ? line.split('`').map((part, k) => k % 2 === 1 ? <code key={k} className="bg-slate-100 text-indigo-600 px-1.5 py-0.5 rounded text-sm font-mono">{part}</code> : part)
                            : line}
                      </p>
                    )
                  })}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-100 text-slate-700 p-4 rounded-2xl rounded-tl-sm flex space-x-1.5 items-center shadow-sm">
                  <div className="w-2 h-2 bg-indigo-400/60 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-indigo-400/60 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                  <div className="w-2 h-2 bg-indigo-400/60 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white/80 border-t border-slate-200/60 z-10 relative">
            <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-2xl focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-300 transition-all">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                disabled={!ready}
                className="flex-1 max-h-32 min-h-[44px] bg-transparent px-3 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none resize-none disabled:opacity-50"
                placeholder={ready ? t('demo.input.ph.ready') : t('demo.input.ph.notReady')}
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading || !ready}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white p-3 rounded-xl transition-all flex items-center justify-center shrink-0 mb-0.5 mr-0.5 shadow-sm"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <div className="text-center mt-3">
              <span className="text-[11px] text-slate-400 font-medium">
                {ready
                  ? t('demo.footer.poweredBy', { model: model || '' })
                  : t('demo.footer.notReady')}
              </span>
            </div>
          </div>
        </div>

        {/* Execution Logs Terminal */}
        <div className="lg:col-span-2 bg-[#0A0A0A] rounded-3xl shadow-xl border border-slate-800 flex flex-col overflow-hidden relative">
          {/* Terminal Header */}
          <div className="px-4 py-3 bg-[#111111] border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-300 tracking-wider uppercase">{t('demo.logs.title')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className={`${ready ? 'animate-ping' : ''} absolute inline-flex h-full w-full rounded-full ${ready ? 'bg-emerald-400' : 'bg-slate-600'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${ready ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
              </span>
              <span className={`text-[10px] font-mono ${ready ? 'text-emerald-500' : 'text-slate-600'}`}>
                {ready ? t('demo.logs.connected') : t('demo.logs.disconnected')}
              </span>
            </div>
          </div>

          {/* Terminal Body */}
          <div className="flex-1 p-5 overflow-y-auto font-mono text-[13px] leading-relaxed space-y-3 scroll-smooth">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                <span className={`break-words ${
                  log.type === 'action' ? 'text-indigo-400' :
                  log.type === 'success' ? 'text-emerald-400' :
                  log.type === 'error' ? 'text-rose-400' :
                  'text-slate-300'
                }`}>
                  {log.type === 'action' && <Navigation className="inline w-3 h-3 mr-1.5 -mt-0.5" />}
                  {log.type === 'success' && <CheckCircle2 className="inline w-3 h-3 mr-1.5 -mt-0.5" />}
                  {log.type === 'info' && <Activity className="inline w-3 h-3 mr-1.5 -mt-0.5" />}
                  {log.text}
                </span>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-slate-600 flex flex-col items-center justify-center h-full space-y-3 opacity-50">
                <Terminal className="w-8 h-8" />
                <p>{t('demo.logs.empty')}</p>
              </div>
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
