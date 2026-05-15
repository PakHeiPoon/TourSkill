import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import RegistrationPortal from './pages/RegistrationPortal'
import Explorer from './pages/Explorer'
import AgentDemo from './pages/AgentDemo'
import MerchantDetail from './pages/MerchantDetail'
import MerchantSign from './pages/MerchantSign'
import ProfilePage from './pages/ProfilePage'
import { Wallet, User as UserIcon, LogOut, ChevronDown, Languages } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BrowserProvider } from 'ethers'
import { useT } from './i18n'

function LanguageToggle() {
  const { lang, setLang } = useT()
  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
      className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-text-muted hover:text-text hover:bg-surface-2 border border-border transition-colors mr-2"
      aria-label="Toggle language"
      title={lang === 'en' ? 'Switch to 中文' : 'Switch to English'}
    >
      <Languages className="w-3.5 h-3.5" />
      <span>{lang === 'en' ? 'EN' : '中'}</span>
    </button>
  )
}

function NavLink({ to, children }: { to: string, children: React.ReactNode }) {
  const location = useLocation()
  const isActive = location.pathname === to
  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-text-muted hover:text-text hover:bg-surface-2'
      }`}
    >
      {children}
    </Link>
  )
}

function shortAddress(address: string): string {
  if (address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function Layout() {
  const { t } = useT()
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [menuOpen, setMenuOpen] = useState<boolean>(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('concourse_wallet_address')
    if (saved) setWalletAddress(saved)
  }, [])

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const connectWallet = async () => {
    try {
      const eth = (window as Window & { ethereum?: unknown }).ethereum
      if (!eth) {
        alert('Please install MetaMask first.')
        return
      }
      const provider = new BrowserProvider(eth as any)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      setWalletAddress(address)
      localStorage.setItem('concourse_wallet_address', address)
      window.dispatchEvent(new Event('concourse:wallet-changed'))
    } catch (error) {
      console.error(error)
      alert('Failed to connect wallet.')
    }
  }

  const disconnectWallet = () => {
    setWalletAddress('')
    setMenuOpen(false)
    localStorage.removeItem('concourse_wallet_address')
    window.dispatchEvent(new Event('concourse:wallet-changed'))
  }

  return (
    <div className="min-h-screen text-text font-sans flex flex-col">
      {/* Glassmorphism header on white */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-bg/80 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center space-x-10">
              <Link to="/" className="flex items-center space-x-2 group">
                <img
                  src="/tourskill-logo.png"
                  alt="Concourse logo"
                  className="w-10 h-10 rounded-xl object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <span className="text-xl font-bold tracking-tight text-text">
                  Concourse
                </span>
              </Link>

              <nav className="hidden md:flex items-center p-1 space-x-1 bg-surface rounded-full border border-border">
                <NavLink to="/register">{t('nav.registration')}</NavLink>
                <NavLink to="/explorer">{t('nav.explorer')}</NavLink>
                <NavLink to="/demo">{t('nav.demo')}</NavLink>
              </nav>
            </div>

            <div className="flex items-center" ref={menuRef}>
              <LanguageToggle />
              {walletAddress ? (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(v => !v)}
                    className="flex items-center gap-2 bg-text hover:bg-text/90 text-white pl-2 pr-3 py-2 rounded-full text-sm font-semibold transition-all duration-300 shadow-md hover:shadow-lg"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                  >
                    {/* Mini gradient avatar */}
                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-accent flex-shrink-0" />
                    <span>{shortAddress(walletAddress)}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {menuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl shadow-text/10 border border-border py-2 animate-in fade-in slide-in-from-top-1 duration-150 z-50"
                    >
                      <div className="px-4 py-2 text-xs text-text-muted border-b border-border">
                        {t('header.connectedAs')}
                        <div className="text-text font-mono mt-0.5 break-all">{shortAddress(walletAddress)}</div>
                      </div>
                      <Link
                        to="/profile"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-text hover:bg-surface-2 transition-colors"
                      >
                        <UserIcon className="w-4 h-4 text-text-muted" />
                        <span>{t('header.profile')}</span>
                      </Link>
                      <button
                        onClick={disconnectWallet}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>{t('header.disconnect')}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={connectWallet}
                  className="flex items-center space-x-2 bg-text hover:bg-text/90 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-0.5"
                >
                  <Wallet className="w-4 h-4" />
                  <span>{t('header.connect')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full relative">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<RegistrationPortal />} />
          <Route path="/explorer" element={<Explorer />} />
          <Route path="/merchant/sign/:draftId" element={<MerchantSign />} />
          <Route path="/merchant/:merchantId" element={<MerchantDetail />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/demo" element={<AgentDemo />} />
        </Routes>
      </main>

      <footer className="border-t border-border bg-surface/40 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-text-muted font-medium">
            {t('footer.copy')}
          </p>
          <div className="flex space-x-6">
            <a href="https://chainscan-galileo.0g.ai/address/0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543" target="_blank" rel="noreferrer"
               className="text-sm text-text-muted hover:text-primary transition-colors">{t('footer.contract')}</a>
            <a href="https://api.tourskill.paking.xyz/skills/user-client/SKILL.md" target="_blank" rel="noreferrer"
               className="text-sm text-text-muted hover:text-primary transition-colors">{t('footer.skillMd')}</a>
            <a href="https://github.com/PakHeiPoon/Concourse" target="_blank" rel="noreferrer"
               className="text-sm text-text-muted hover:text-primary transition-colors">{t('footer.github')}</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}

export default App
