import { useEffect, useMemo, useState } from 'react'
import { Store, CheckCircle2, ChevronRight, Loader2, ArrowRight, Wallet, Link2, FlaskConical } from 'lucide-react'
import { BrowserProvider, Contract } from 'ethers'
import { MERCHANT_REGISTRY_ABI, MERCHANT_REGISTRY_ADDRESS, ZERO_G_CHAIN } from '../contracts/MerchantRegistry'
import { useT } from '../i18n'

// Same env contract used by every other page so prod hits api.tourskill.paking.xyz.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://api.tourskill.paking.xyz'

const SKILLS_BY_TYPE: Record<string, string> = {
  restaurant: 'get_menu,reserve_table,check_table_availability,get_dietary_options',
  hotel: 'check_availability,get_rates,create_booking,get_cancellation_policy',
  attraction: 'check_ticket_inventory,get_opening_hours,purchase_ticket,get_visitor_guide',
  shop: '',
}

const MOCK_DATA: Record<string, Partial<FormState>> = {
  restaurant: {
    name: 'Louwailou Restaurant',
    description: 'Historic Hangzhou restaurant est. 1848, famous for West Lake Fish in Vinegar Sauce and Dongpo Pork. Located lakeside near Solitary Hill with panoramic views. Serves traditional Zhejiang cuisine with seasonal specialties using local ingredients.',
    city: 'hangzhou',
    country: 'CN',
    address: 'No. 30 Gushan Road, West Lake District, Hangzhou',
    latitude: '30.2518',
    longitude: '120.1427',
    contact_phone: '+86-571-87969023',
    contact_email: 'info@louwailou.com.cn',
    opening_hours: '10:30-14:00, 16:30-21:00',
    website_url: 'https://www.louwailou.com.cn',
    price_level: '3',
    tags: 'Zhejiang cuisine,historic,lakeside,signature dishes',
    languages_supported: 'zh,en',
    supported_skills: SKILLS_BY_TYPE.restaurant,
    cuisine_type: 'Zhejiang (Hangbang)',
    signature_dishes: 'West Lake Fish in Vinegar Sauce,Dongpo Pork,Beggar Chicken,Longjing Shrimp',
    vegetarian_options: true,
    reservation_required: true,
    average_spend_per_person: '180',
  },
  hotel: {
    name: 'Four Seasons Hotel Hangzhou at West Lake',
    description: 'Luxury 5-star resort set in 10 acres of gardens on the western shore of West Lake. Features traditional Chinese architecture with modern amenities, indoor/outdoor pools, full-service spa, and three restaurants. Ideal base for exploring West Lake scenic area.',
    city: 'hangzhou',
    country: 'CN',
    address: 'No. 5 Lingyin Road, Xihu District, Hangzhou',
    latitude: '30.2395',
    longitude: '120.1172',
    contact_phone: '+86-571-81028888',
    contact_email: 'reservations.hangzhou@fourseasons.com',
    opening_hours: '24h',
    website_url: 'https://www.fourseasons.com/hangzhou',
    price_level: '5',
    tags: 'luxury,5-star,lakeside,spa,garden',
    languages_supported: 'zh,en,ja',
    supported_skills: SKILLS_BY_TYPE.hotel,
    star_rating: '5',
    room_types: 'Deluxe Lake View,Premier Garden,West Lake Suite,Presidential Suite',
    check_in_time: '15:00',
    check_out_time: '12:00',
    breakfast_included: true,
    parking_available: true,
  },
  attraction: {
    name: 'West Lake Scenic Area',
    description: 'UNESCO World Heritage Site featuring the iconic West Lake surrounded by temples, pagodas, gardens, and causeways. Famous for "Ten Scenes of West Lake" including Broken Bridge, Three Pools Mirroring the Moon, and Leifeng Pagoda. Best visited in spring and autumn.',
    city: 'hangzhou',
    country: 'CN',
    address: 'West Lake, Xihu District, Hangzhou',
    latitude: '30.2420',
    longitude: '120.1485',
    contact_phone: '+86-571-87179603',
    contact_email: 'service@westlake.gov.cn',
    opening_hours: '06:00-18:00 (Boat tours until 17:00)',
    website_url: 'https://www.westlake.gov.cn',
    price_level: '2',
    tags: 'UNESCO,scenic,lake,heritage,nature',
    languages_supported: 'zh,en,ja,ko',
    supported_skills: SKILLS_BY_TYPE.attraction,
    ticket_types: 'adult,child,student,senior,vip',
    opening_seasons: 'Year-round (peak: Mar-May, Sep-Nov)',
    duration_hours: '4',
    family_friendly: true,
    wheelchair_accessible: true,
  },
  shop: {
    name: 'Hangzhou Silk City',
    description: 'Major silk retail market in Hangzhou offering authentic Chinese silk products including scarves, clothing, bedding, and accessories. Over 100 vendor stalls with on-site tailoring services and shipping worldwide.',
    city: 'hangzhou',
    country: 'CN',
    address: 'No. 253 Xinhua Road, Xiacheng District, Hangzhou',
    latitude: '30.2750',
    longitude: '120.1620',
    contact_phone: '+86-571-85177253',
    contact_email: 'info@hzsilkcity.com',
    opening_hours: '09:00-21:00',
    price_level: '3',
    tags: 'silk,souvenirs,local products,fashion',
    languages_supported: 'zh,en',
    supported_skills: '',
    shop_category: 'Silk & Textiles',
    main_products: 'Silk scarves,Silk clothing,Silk bedding,Silk accessories',
    tax_refund_supported: true,
    shipping_supported: true,
  },
}

export default function RegistrationPortal() {
  const { t } = useT()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [chainLoading, setChainLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [did, setDid] = useState('')
  const [merchantId, setMerchantId] = useState('')
  const [profileHash, setProfileHash] = useState('')
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')
  const [schema, setSchema] = useState<Record<string, FieldSchema[]>>({
    common: [],
    hotel: [],
    restaurant: [],
    attraction: [],
    shop: [],
  })
  const [form, setForm] = useState<FormState>({
    merchant_type: 'restaurant',
    name: '',
    description: '',
    city: '',
    country: 'CN',
    address: '',
    latitude: '',
    longitude: '',
    contact_phone: '',
    contact_email: '',
    opening_hours: '',
    website_url: '',
    price_level: '',
    tags: '',
    languages_supported: 'zh,en',
    supported_skills: SKILLS_BY_TYPE.restaurant,
    wallet_address: '',
  })

  useEffect(() => {
    fetch(`${API_BASE}/v1/merchant-form-schema`)
      .then((res) => res.json())
      .then((data) => setSchema(data))
      .catch(() => {
        // Keep UI usable even if backend schema endpoint is unavailable.
      })

    const syncWallet = () => {
      const saved = localStorage.getItem('concourse_wallet_address')
      if (saved) {
        setForm((prev) => ({ ...prev, wallet_address: saved }))
      }
    }
    syncWallet()
    window.addEventListener('concourse:wallet-changed', syncWallet)
    return () => {
      window.removeEventListener('concourse:wallet-changed', syncWallet)
    }
  }, [])

  const typeSpecificFields = useMemo(() => {
    return schema[form.merchant_type] || []
  }, [schema, form.merchant_type])

  const updateField = (key: keyof FormState | string, value: string | boolean) => {
    if (key === 'merchant_type') {
      const mt = value as FormState['merchant_type']
      setForm((prev) => ({ ...prev, merchant_type: mt, supported_skills: SKILLS_BY_TYPE[mt] || '' }))
    } else {
      setForm((prev) => ({ ...prev, [key]: value }))
    }
  }

  const fillMockData = () => {
    const mock = MOCK_DATA[form.merchant_type]
    if (!mock) return
    setForm((prev) => ({ ...prev, ...mock, merchant_type: prev.merchant_type, wallet_address: prev.wallet_address }))
  }

  const parseArray = (input: string): string[] =>
    input
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)

  const handleRegister = async () => {
    setError('')
    setLoading(true)
    const specificFields: Record<string, string | number | boolean | string[]> = {}

    for (const field of typeSpecificFields) {
      const v = form[field.key]
      if (field.type === 'array_text') {
        specificFields[field.key] = parseArray(String(v || ''))
      } else if (field.type === 'number') {
        specificFields[field.key] = v === '' ? 0 : Number(v)
      } else if (field.type === 'boolean') {
        specificFields[field.key] = Boolean(v)
      } else {
        specificFields[field.key] = String(v || '')
      }
    }

    const payload = {
      merchant_type: form.merchant_type,
      name: form.name,
      description: form.description,
      city: form.city,
      country: form.country || 'CN',
      address: form.address,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      contact_phone: form.contact_phone,
      contact_email: form.contact_email,
      opening_hours: form.opening_hours,
      website_url: form.website_url || null,
      price_level: form.price_level ? Number(form.price_level) : null,
      tags: parseArray(form.tags),
      languages_supported: parseArray(form.languages_supported),
      supported_skills: parseArray(form.supported_skills),
      specific_fields: specificFields,
      wallet_address: form.wallet_address,
      profile_hash: null,
      profile_uri: null,
      skill_endpoint: null,
    }

    try {
      // Step 1: Save to Supabase
      const res = await fetch(`${API_BASE}/v1/merchants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.detail || 'Registration failed')
      }

      const returnedDid = data?.data?.did || ''
      const returnedId = data?.data?.merchant_id || ''
      const returnedHash = data?.data?.profile_hash || ''
      const skillEndpoint = `${API_BASE}/v1/merchants/${returnedId}`

      setDid(returnedDid)
      setMerchantId(returnedId)
      setProfileHash(returnedHash)

      // Step 2: Register on-chain via MetaMask
      setChainLoading(true)
      const eth = (window as Window & { ethereum?: unknown }).ethereum
      if (!eth) {
        throw new Error('MetaMask not found. Profile saved off-chain only.')
      }

      const provider = new BrowserProvider(eth as any)

      // Ensure user is on 0G Testnet
      try {
        await provider.send('wallet_switchEthereumChain', [
          { chainId: '0x' + ZERO_G_CHAIN.chainId.toString(16) },
        ])
      } catch (switchErr: unknown) {
        if ((switchErr as { code?: number }).code === 4902) {
          await provider.send('wallet_addEthereumChain', [
            {
              chainId: '0x' + ZERO_G_CHAIN.chainId.toString(16),
              chainName: ZERO_G_CHAIN.name,
              rpcUrls: [ZERO_G_CHAIN.rpcUrl],
              nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 },
            },
          ])
        } else {
          throw switchErr
        }
      }

      const signer = await provider.getSigner()
      const registry = new Contract(MERCHANT_REGISTRY_ADDRESS, MERCHANT_REGISTRY_ABI, signer)

      const tx = await registry.register(
        returnedDid,
        form.merchant_type,
        returnedHash,
        `supabase://${returnedId}`,
        skillEndpoint,
      )
      const receipt = await tx.wait()
      setTxHash(receipt.hash)

      setLoading(false)
      setChainLoading(false)
      setSuccess(true)
    } catch (e) {
      setLoading(false)
      setChainLoading(false)
      const msg = e instanceof Error ? e.message : 'Registration failed'
      if (msg.includes('Profile saved off-chain only') || msg.includes('user rejected')) {
        // Still mark as success if Supabase save succeeded
        setSuccess(true)
        setError(msg)
      } else {
        setError(msg)
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center p-3 bg-blue-50 rounded-2xl mb-4 text-blue-600">
          <Store className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
          {t('register.title')}
        </h1>
        <p className="text-slate-500 mt-3 text-lg max-w-2xl mx-auto">
          {t('register.subtitle')}
        </p>
      </div>

      {success ? (
        <div className="bg-white/80 backdrop-blur-xl p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-emerald-100 text-center max-w-2xl mx-auto">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('register.success.title')}</h2>
          <p className="text-slate-500 mb-8">{t('register.success.desc')}</p>

          <div className="bg-slate-50 rounded-2xl p-6 text-left border border-slate-200 mb-8 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">{t('register.success.did')}</label>
              <div className="font-mono text-sm bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-700 break-all">
                {did}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">{t('register.success.hash')}</label>
              <div className="font-mono text-sm bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-700 break-all">
                {profileHash || 'N/A'}
              </div>
            </div>
            {txHash && (
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                  <Link2 className="w-3 h-3" /> {t('register.success.tx')}
                </label>
                <a
                  href={`${ZERO_G_CHAIN.explorerUrl}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm bg-white border border-slate-200 px-3 py-2 rounded-lg text-emerald-700 break-all block hover:bg-emerald-50 hover:border-emerald-300 transition-colors cursor-pointer"
                >
                  {txHash}
                  <span className="text-xs text-emerald-500 ml-2">{t('register.success.viewExplorer')} &#x2197;</span>
                </a>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">{t('register.success.endpoint')}</label>
              <div className="font-mono text-sm bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-700 break-all">
                {API_BASE}/v1/merchants/{merchantId}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setSuccess(false)
              setStep(1)
            }}
            className="bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-8 rounded-full transition-all hover:-translate-y-0.5 shadow-md"
          >
            {t('register.success.again')}
          </button>
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 overflow-hidden flex flex-col md:flex-row">
          
          {/* Sidebar Progress */}
          <div className="bg-slate-50 p-8 md:w-1/3 border-b md:border-b-0 md:border-r border-slate-200/60">
            <div className="space-y-8">
              <div className="flex items-start">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 ${step >= 1 ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-slate-400'}`}>
                  1
                </div>
                <div className="ml-4 mt-1">
                  <h3 className={`text-sm font-bold ${step >= 1 ? 'text-slate-900' : 'text-slate-500'}`}>{t('register.step1.title')}</h3>
                  <p className="text-xs text-slate-500 mt-1">{t('register.step1.desc')}</p>
                </div>
              </div>
              
              <div className="flex items-start">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 ${step >= 2 ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-slate-400 bg-white'}`}>
                  2
                </div>
                <div className="ml-4 mt-1">
                  <h3 className={`text-sm font-bold ${step >= 2 ? 'text-slate-900' : 'text-slate-500'}`}>{t('register.step2.title')}</h3>
                  <p className="text-xs text-slate-500 mt-1">{t('register.step2.desc')}</p>
                </div>
              </div>

              <div className="flex items-start">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 ${step >= 3 ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-slate-400 bg-white'}`}>
                  3
                </div>
                <div className="ml-4 mt-1">
                  <h3 className={`text-sm font-bold ${step >= 3 ? 'text-slate-900' : 'text-slate-500'}`}>{t('register.step3.title')}</h3>
                  <p className="text-xs text-slate-500 mt-1">{t('register.step3.desc')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-8 md:p-10 md:w-2/3">
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{t('register.field.type')}</label>
                    <select
                      value={form.merchant_type}
                      onChange={(e) => updateField('merchant_type', e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    >
                      <option value="restaurant">{t('register.type.restaurant')}</option>
                      <option value="hotel">{t('register.type.hotel')}</option>
                      <option value="attraction">{t('register.type.attraction')}</option>
                      <option value="shop">{t('register.type.shop')}</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={fillMockData}
                    className="ml-4 mt-6 flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors shrink-0"
                  >
                    <FlaskConical className="w-4 h-4" />
                    {t('register.fillDemo')}
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('register.field.name')}</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    placeholder={t('register.field.name.ph')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{t('register.field.city')}</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all outline-none"
                      placeholder={t('register.field.city.ph')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{t('register.field.country')}</label>
                    <input
                      type="text"
                      value={form.country}
                      onChange={(e) => updateField('country', e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all outline-none"
                      placeholder={t('register.field.country.ph')}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('register.field.address')}</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    placeholder={t('register.field.address.ph')}
                  />
                </div>
                <div className="pt-4 flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-6 rounded-xl transition-all flex items-center gap-2"
                  >
                    <span>{t('register.next')}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('register.field.desc')}</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all outline-none resize-none h-32"
                    placeholder={t('register.field.desc.ph')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {schema.common.map((field) => (
                    <DynamicField key={field.key} field={field} value={form[field.key]} onChange={updateField} />
                  ))}
                </div>
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
                  <p className="text-sm font-semibold text-slate-700 mb-3">
                    {t('register.specificFields', { type: form.merchant_type.toUpperCase() })}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {typeSpecificFields.map((field) => (
                      <DynamicField key={field.key} field={field} value={form[field.key]} onChange={updateField} />
                    ))}
                    {typeSpecificFields.length === 0 && (
                      <p className="text-sm text-slate-500">{t('register.noTypeFields')}</p>
                    )}
                  </div>
                </div>
                <div className="pt-4 flex justify-between">
                  <button
                    onClick={() => setStep(1)}
                    className="text-slate-500 hover:text-slate-800 font-medium py-3 px-4 rounded-xl transition-all"
                  >
                    {t('register.back')}
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-6 rounded-xl transition-all flex items-center gap-2"
                  >
                    <span>{t('register.next')}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mb-6">
                  <h4 className="font-semibold text-blue-900 mb-2">{t('register.almostThere')}</h4>
                  <p className="text-sm text-blue-700 mb-4">
                    {t('register.almostTitle.desc')}
                  </p>
                  <div className="bg-white/60 p-3 rounded-lg border border-blue-100/50 font-mono text-xs text-slate-600">
                    {t('register.field.type')}: {form.merchant_type}<br />
                    {t('register.field.city')}: {form.city || '-'}<br />
                    {t('register.field.skills')}: {form.supported_skills || '-'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('register.field.wallet')}</label>
                  <div className="relative">
                    <Wallet className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={form.wallet_address}
                      onChange={(e) => updateField('wallet_address', e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all outline-none"
                      placeholder="0x..."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('register.field.skills')}</label>
                  <input
                    type="text"
                    value={form.supported_skills}
                    onChange={(e) => updateField('supported_skills', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    placeholder={t('register.field.skills.ph')}
                  />
                </div>
                {error && (
                  <div className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                    {error}
                  </div>
                )}

                <div className="pt-4 flex justify-between">
                  <button
                    onClick={() => setStep(2)}
                    className="text-slate-500 hover:text-slate-800 font-medium py-3 px-4 rounded-xl transition-all"
                    disabled={loading}
                  >
                    {t('register.back')}
                  </button>
                  <button
                    onClick={handleRegister}
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-8 rounded-xl transition-all flex items-center gap-2 shadow-md shadow-blue-500/20"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>{chainLoading ? t('register.submitting.chain') : t('register.submitting.off')}</span>
                      </>
                    ) : (
                      <>
                        <span>{t('register.submit')}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

type FieldSchema = {
  key: string
  label: string
  type: 'text' | 'email' | 'number' | 'boolean' | 'array_text'
  required?: boolean
}

type FormState = {
  merchant_type: 'hotel' | 'restaurant' | 'attraction' | 'shop'
  name: string
  description: string
  city: string
  country: string
  address: string
  latitude: string
  longitude: string
  contact_phone: string
  contact_email: string
  opening_hours: string
  website_url: string
  price_level: string
  tags: string
  languages_supported: string
  supported_skills: string
  wallet_address: string
  [key: string]: string | boolean
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: FieldSchema
  value: string | boolean | undefined
  onChange: (key: string, value: string | boolean) => void
}) {
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
        <span className="text-sm font-medium text-slate-700">{field.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(field.key, e.target.checked)}
          className="h-4 w-4 accent-blue-600"
        />
      </label>
    )
  }

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-2">{field.label}</label>
      <input
        type={field.type === 'array_text' ? 'text' : field.type}
        value={typeof value === 'boolean' ? '' : (value || '')}
        onChange={(e) => onChange(field.key, e.target.value)}
        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
      />
    </div>
  )
}
