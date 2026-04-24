import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Info, TerminalSquare, ExternalLink, Code2, Globe, X, Play, Loader2, ChevronDown } from 'lucide-react'
import OnChainBadge from '../components/OnChainBadge'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://api.tourskill.paking.xyz'

const SKILL_PARAMS: Record<string, { label: string; fields: { name: string; type: string; placeholder: string; required?: boolean }[] }> = {
  check_availability: { label: 'Check Availability', fields: [
    { name: 'check_in', type: 'date', placeholder: 'Check-in date', required: true },
    { name: 'check_out', type: 'date', placeholder: 'Check-out date', required: true },
    { name: 'room_type', type: 'text', placeholder: 'e.g. standard, deluxe, suite' },
  ]},
  get_rates: { label: 'Get Rates', fields: [
    { name: 'check_in', type: 'date', placeholder: 'Check-in date', required: true },
    { name: 'check_out', type: 'date', placeholder: 'Check-out date', required: true },
    { name: 'currency', type: 'text', placeholder: 'CNY (default)' },
  ]},
  create_booking: { label: 'Create Booking', fields: [
    { name: 'check_in', type: 'date', placeholder: 'Check-in date', required: true },
    { name: 'check_out', type: 'date', placeholder: 'Check-out date', required: true },
    { name: 'room_type', type: 'text', placeholder: 'e.g. standard' },
    { name: 'guest_name', type: 'text', placeholder: 'Guest name', required: true },
  ]},
  get_cancellation_policy: { label: 'Cancellation Policy', fields: [] },
  check_table_availability: { label: 'Check Table Availability', fields: [
    { name: 'date', type: 'date', placeholder: 'Date', required: true },
    { name: 'time', type: 'text', placeholder: 'e.g. 18:00', required: true },
    { name: 'party_size', type: 'number', placeholder: 'Party size', required: true },
  ]},
  get_menu: { label: 'Get Menu', fields: [
    { name: 'category', type: 'text', placeholder: 'e.g. signature, appetizer' },
    { name: 'dietary', type: 'text', placeholder: 'e.g. vegetarian, halal' },
  ]},
  reserve_table: { label: 'Reserve Table', fields: [
    { name: 'date', type: 'date', placeholder: 'Date', required: true },
    { name: 'time', type: 'text', placeholder: 'e.g. 19:00', required: true },
    { name: 'party_size', type: 'number', placeholder: 'Party size', required: true },
    { name: 'guest_name', type: 'text', placeholder: 'Guest name', required: true },
  ]},
  get_dietary_options: { label: 'Dietary Options', fields: [] },
  check_ticket_inventory: { label: 'Check Ticket Inventory', fields: [
    { name: 'date', type: 'date', placeholder: 'Date', required: true },
    { name: 'ticket_type', type: 'text', placeholder: 'e.g. adult, child, vip' },
  ]},
  get_opening_hours: { label: 'Opening Hours', fields: [] },
  purchase_ticket: { label: 'Purchase Ticket', fields: [
    { name: 'date', type: 'date', placeholder: 'Date', required: true },
    { name: 'ticket_type', type: 'text', placeholder: 'e.g. adult', required: true },
    { name: 'quantity', type: 'number', placeholder: 'Quantity', required: true },
    { name: 'visitor_name', type: 'text', placeholder: 'Visitor name', required: true },
  ]},
  get_visitor_guide: { label: 'Visitor Guide', fields: [
    { name: 'language', type: 'text', placeholder: 'en or zh' },
  ]},
}

interface SkillTestModalProps {
  merchant: any
  onClose: () => void
}

function SkillTestModal({ merchant, onClose }: SkillTestModalProps) {
  const [selectedSkill, setSelectedSkill] = useState<string>(merchant.skills[0] || '')
  const [params, setParams] = useState<Record<string, string>>({})
  const [result, setResult] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)

  const skillMeta = SKILL_PARAMS[selectedSkill]

  const handleSkillChange = (skill: string) => {
    setSelectedSkill(skill)
    setParams({})
    setResult(null)
    setError(false)
  }

  const handleRun = async () => {
    setRunning(true)
    setResult(null)
    setError(false)
    try {
      const skillArgs: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(params)) {
        if (v === '') continue
        const field = skillMeta?.fields.find(f => f.name === k)
        skillArgs[k] = field?.type === 'number' ? Number(v) : v
      }
      const res = await fetch(`${API_BASE}/mcp/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'invoke_merchant_skill',
          arguments: {
            did: merchant.merchant_id,
            skill_name: selectedSkill,
            skill_args: skillArgs,
          },
        }),
      })
      const data = await res.json()
      if (data.isError) {
        setError(true)
        setResult(data.content?.[0]?.text || 'Unknown error')
      } else {
        const text = data.content?.[0]?.text || JSON.stringify(data)
        try {
          setResult(JSON.stringify(JSON.parse(text), null, 2))
        } catch {
          setResult(text)
        }
      }
    } catch (err: unknown) {
      setError(true)
      setResult(err instanceof Error ? err.message : 'Network error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div ref={backdropRef} onClick={(e) => e.target === backdropRef.current && onClose()} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{merchant.name.en}</h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{merchant.did}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Skill selector */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Select Skill</label>
            <div className="relative">
              <select
                value={selectedSkill}
                onChange={(e) => handleSkillChange(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-10 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
              >
                {merchant.skills.map((s: string) => (
                  <option key={s} value={s}>{SKILL_PARAMS[s]?.label || s}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Parameter fields */}
          {skillMeta && skillMeta.fields.length > 0 && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Parameters</label>
              <div className="grid grid-cols-2 gap-3">
                {skillMeta.fields.map((f) => (
                  <div key={f.name} className={f.name === 'guest_name' || f.name === 'visitor_name' ? 'col-span-2' : ''}>
                    <label className="text-xs text-slate-500 mb-1 block">
                      {f.name.replace(/_/g, ' ')}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                    </label>
                    <input
                      type={f.type}
                      placeholder={f.placeholder}
                      value={params[f.name] || ''}
                      onChange={(e) => setParams({ ...params, [f.name]: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={running}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {running ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Invoking Skill...</>
            ) : (
              <><Play className="w-4 h-4" /> Execute Skill</>
            )}
          </button>

          {/* Result */}
          {result && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                {error ? 'Error' : 'Response'}
              </label>
              <pre className={`p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto ${error ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-slate-900 text-green-400'}`}>
                {result}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Explorer() {
  const navigate = useNavigate()
  const [merchants, setMerchants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cityFilter, setCityFilter] = useState('')
  const [testingMerchant, setTestingMerchant] = useState<any | null>(null)

  const fetchMerchants = () => {
    setLoading(true)
    fetch(`${API_BASE}/v1/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cityFilter ? { city: cityFilter } : {})
    })
      .then(res => res.json())
      .then(data => {
        setMerchants(data.data || [])
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchMerchants()
  }, [cityFilter])

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Registry Explorer</h2>
          <p className="text-slate-500 mt-2">Discover merchants and their on-chain AI Skills available on the network.</p>
        </div>
        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm">
          <div className="px-3 text-slate-400">
            <MapPin className="w-4 h-4" />
          </div>
          <select 
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="bg-transparent py-2 pr-8 text-sm font-medium text-slate-700 focus:outline-none cursor-pointer appearance-none"
          >
            <option value="">All Cities Globally</option>
            <option value="hangzhou">Hangzhou (杭州)</option>
            <option value="shanghai">Shanghai (上海)</option>
            <option value="suzhou">Suzhou (苏州)</option>
            <option value="beijing">Beijing (北京)</option>
          </select>
        </div>
      </div>
      
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm h-72 animate-pulse flex flex-col">
              <div className="flex justify-between mb-4">
                <div className="w-20 h-6 bg-slate-100 rounded-md"></div>
                <div className="w-24 h-6 bg-slate-100 rounded-md"></div>
              </div>
              <div className="w-3/4 h-6 bg-slate-100 rounded-md mb-2"></div>
              <div className="w-1/2 h-4 bg-slate-100 rounded-md mb-6"></div>
              <div className="space-y-2 mb-auto">
                <div className="w-full h-3 bg-slate-50 rounded-md"></div>
                <div className="w-5/6 h-3 bg-slate-50 rounded-md"></div>
              </div>
              <div className="w-full h-10 bg-slate-100 rounded-xl mt-4"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {merchants.map((m: any) => (
            <div
              key={m.merchant_id}
              onClick={() => navigate(`/merchant/${encodeURIComponent(m.merchant_id)}`)}
              className="group bg-white p-6 rounded-3xl border border-slate-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 flex flex-col cursor-pointer"
            >
              <div className="flex justify-between items-start mb-5">
                <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider
                  ${m.type === 'hotel' ? 'bg-primary-soft text-primary border border-primary/20' :
                    m.type === 'restaurant' ? 'bg-accent-soft text-accent border border-accent/20' :
                    'bg-emerald-50 text-emerald-700 border border-emerald-100/60'}`}>
                  {m.type}
                </span>
                <div onClick={(e) => e.stopPropagation()}>
                  <OnChainBadge
                    walletAddress={m.wallet_address}
                    did={m.did}
                    profileHash={m.profile_hash}
                    registerTxHash={m.register_tx_hash}
                  />
                </div>
              </div>

              <h3 className="text-xl font-bold text-text mb-1 leading-tight group-hover:text-primary transition-colors">{m.name.en}</h3>
              <p className="text-slate-500 text-sm mb-4 font-medium flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {m.location.city.charAt(0).toUpperCase() + m.location.city.slice(1)}, {m.location.country}
              </p>
              
              <div className="bg-slate-50 p-3 rounded-xl mb-5 flex-grow">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-slate-600 text-sm line-clamp-2 leading-relaxed">{m.description.en}</p>
                </div>
              </div>
              
              <div className="mb-6">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <TerminalSquare className="w-3.5 h-3.5" />
                  Available Agent Skills
                </h4>
                <div className="flex flex-wrap gap-2">
                  {m.skills.slice(0, 3).map((skill: string) => (
                    <span key={skill} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors cursor-default">
                      {skill}
                    </span>
                  ))}
                  {m.skills.length > 3 && (
                    <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-500 text-xs font-medium rounded-lg">
                      +{m.skills.length - 3}
                    </span>
                  )}
                </div>
              </div>
              
              <button
                onClick={(e) => { e.stopPropagation(); setTestingMerchant(m) }}
                className="w-full py-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-900 hover:border-slate-900 hover:text-white rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 group/btn"
              >
                <Code2 className="w-4 h-4 text-slate-400 group-hover/btn:text-white transition-colors" />
                <span>Test Skill API</span>
                <ExternalLink className="w-4 h-4 opacity-0 -ml-4 group-hover/btn:opacity-100 group-hover/btn:ml-0 transition-all duration-300" />
              </button>
            </div>
          ))}
          {merchants.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
              <Globe className="w-12 h-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-1">No Merchants Found</h3>
              <p className="text-slate-500">There are no registered merchants in the selected city yet.</p>
            </div>
          )}
        </div>
      )}

      {testingMerchant && (
        <SkillTestModal merchant={testingMerchant} onClose={() => setTestingMerchant(null)} />
      )}
    </div>
  )
}
