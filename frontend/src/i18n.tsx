import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type Lang = 'en' | 'zh'

const STORAGE_KEY = 'tourskill_lang'

// Flat translation dict. Keys use dotted namespacing.
const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  en: {
    // ─── Header ───
    'nav.registration': 'Registration',
    'nav.explorer': 'Explorer',
    'nav.demo': 'Agent Demo',
    'header.connect': 'Connect Wallet',
    'header.profile': 'View Profile',
    'header.disconnect': 'Disconnect',
    'header.connectedAs': 'Connected as',

    // ─── Footer ───
    'footer.copy': '© 2026 TourSkill. The Decentralized A2A Tourism Registry.',
    'footer.contract': 'Contract',
    'footer.skillMd': 'SKILL.md',
    'footer.github': 'GitHub',

    // ─── Home: live badge ───
    'home.liveBadge': '28 merchants live on 0G testnet',

    // ─── Home: hero ───
    'home.hero.line1': 'The Decentralized',
    'home.hero.line2': 'A2A Tourism Registry',
    'home.hero.subtitle.before': "Your agent talks to their agent. No OTA, no middleman. Every merchant bound to a real wallet, every call settled via ",
    'home.hero.subtitle.highlight': 'x402 micropayments',
    'home.hero.subtitle.after': ' at the HTTP layer.',

    // ─── Home: CTAs ───
    'home.cta.human': "I'm Human",
    'home.cta.agent': "I'm an Agent",
    'home.cta.noAgent.before': "Don't have an AI agent? ",
    'home.cta.noAgent.link': 'Try the web demo',

    // ─── Home: install card ───
    'home.install.tab.personal': 'Personal Agent',
    'home.install.tab.merchant': 'Merchant Agent',
    'home.install.title.personal': 'Send your AI agent to TourSkill',
    'home.install.title.merchant': 'Bring your merchant agent to TourSkill',
    'home.install.copy': 'Copy',
    'home.install.copied': 'Copied',
    // Personal agent flow
    'home.install.personal.step1': 'Paste this to your personal agent (Claude Code, Cursor, or any AI that can load skills)',
    'home.install.personal.step2': 'The agent fetches the SKILL.md — no auth needed, no local backend to run',
    'home.install.personal.step3.before': 'Ask it ',
    'home.install.personal.step3.example': '"find me dinner in Hangzhou tomorrow"',
    'home.install.personal.step3.after': ' — watch A2A commerce happen',
    // Merchant agent flow
    'home.install.merchant.step1': 'Paste this to your business owner\'s AI agent — the one that knows your shop',
    'home.install.merchant.step2': 'The agent drafts your profile, you confirm, then sign once via MetaMask to anchor on-chain',
    'home.install.merchant.step3.before': 'Later, just say ',
    'home.install.merchant.step3.example': '"update my opening hours"',
    'home.install.merchant.step3.after': ' — daily edits never require signing',

    // ─── Home: three pillars ───
    'home.pillar1.title': 'On-chain Identity',
    'home.pillar1.body': 'Every merchant anchored on 0G Chain via ERC-8004. Identity is verifiable, portable, sovereign — no platform can de-list you.',
    'home.pillar2.title': 'x402 Native',
    'home.pillar2.body': 'The first A2A registry with payment baked into HTTP. Agent pays agent at the edge, no take-rate, no 30% OTA margin.',
    'home.pillar3.title': 'MCP / A2A Compatible',
    'home.pillar3.body': 'Standard tool interface — any AI agent that speaks MCP can discover, verify, and transact. Zero custom SDK.',

    // ─── Home: AgentLoopDemo ───
    'demo.badge': 'Live demo · no real charges',
    'demo.title': 'Watch your agent work',
    'demo.subtitle': 'Four HTTP calls. One on-chain receipt. No platform in between.',
    'demo.terminalLabel.running': 'running',
    'demo.terminalLabel.idle': 'idle',
    'demo.replay': 'Replay',
    'demo.restartSoon': '── replays in a few seconds ──',
    'demo.cta.before': 'Want to actually try it? ',
    'demo.cta.link': 'Install the skill →',

    // ─── Roadmap ───
    'roadmap.badge': 'Roadmap',
    'roadmap.title': "What's shipped, what's next",
    'roadmap.subtitle': 'Open registry · merchant agents · payments · reputation. Built in the open.',
    'roadmap.status.live': 'Live',
    'roadmap.status.building': 'Building',
    'roadmap.status.planned': 'Planned',

    // ─── Explorer ───
    'explorer.title': 'Registry Explorer',
    'explorer.subtitle': 'Discover merchants and their on-chain AI Skills available on the network.',
    'explorer.cityAll': 'All Cities Globally',
    'explorer.agentSkills': 'Available Agent Skills',
    'explorer.testSkillApi': 'Test Skill API',
    'explorer.emptyTitle': 'No Merchants Found',
    'explorer.emptyBody': 'There are no registered merchants in the selected city yet.',

    // ─── Status badges ───
    'status.active': 'Open for business',
    'status.inactive': 'Paused',

    // ─── Profile page ───
    'profile.connectWallet.title': 'Connect your wallet',
    'profile.connectWallet.body': 'Sign in with your wallet to view your TourSkill profile, manage your registered merchants, and connect your AI agent.',
    'profile.connectWallet.hint': 'Use the Connect Wallet button in the top right →',
    'profile.wallet.title': 'Wallet Profile',
    'profile.wallet.viewChainscan': 'View on chainscan',
    'profile.merchants.title': 'My Merchants',
    'profile.merchants.registerNew': 'Register new',
    'profile.merchants.empty': 'No merchants registered with this wallet yet.',
    'profile.merchants.emptyCta': 'Register your first merchant',
    'profile.merchants.pause': 'Pause',
    'profile.merchants.resume': 'Resume',
    'profile.merchants.updating': 'Updating…',
    'profile.merchants.toggleError': 'Could not toggle status — check your connection and try again.',
    'profile.agent.title': 'Connect your AI Agent',
    'profile.agent.body': 'Send this one-line install prompt to your personal AI agent. It will fetch the TourSkill SKILL.md and immediately start interacting with the on-chain registry.',
    'profile.agent.copyButton': 'Copy install prompt',
    'profile.agent.copied': 'Copied to clipboard',

    // ─── MerchantDetail page ───
    'detail.back': 'Back to Explorer',
    'detail.loading': 'Loading merchant…',
    'detail.error': "Couldn't load this merchant",
    'detail.badge.verified': 'Verified on 0G Chain',
    'detail.badge.open': 'Open',
    'detail.badge.paused': 'Paused',
    'detail.section.contact': 'Contact & Hours',
    'detail.section.onchain': 'On-chain Proof',
    'detail.section.skills': 'Available Agent Skills',
    'detail.section.specifics': 'Merchant-Specific Fields',
    'detail.field.hours': 'Hours',
    'detail.field.phone': 'Phone',
    'detail.field.email': 'Email',
    'detail.field.website': 'Website',
    'detail.field.wallet': 'Owner wallet',
    'detail.field.did': 'Merchant DID',
    'detail.field.profileHash': 'Profile hash',
    'detail.field.contract': 'Registry contract',
    'detail.viewRegisterTx': 'View register tx on chainscan',
    'detail.onchain.footer': 'Anchored on 0G Galileo testnet (chainId 16602) via the ERC-8004 MerchantRegistry contract.',
    'detail.testSkills': 'Test these skills →',

    // ─── AgentDemo page (main hero only) ───
    'demoPage.title': 'Personal Agent Demo',
    'demoPage.subtitle': 'Connect your wallet to use 0G Compute LLM — your tokens power the AI agent.',
    'demoPage.reset': 'Reset',

    // ─── Registration portal ───
    'register.title': 'Register your Merchant',
    'register.subtitle': 'Publish your hotel, restaurant, or attraction onto the decentralized TourSkill registry. Any AI agent will be able to discover and invoke your on-chain skills.',
    'register.step1.title': 'Basic Info',
    'register.step1.desc': 'Type, name and location',
    'register.step2.title': 'Business Details',
    'register.step2.desc': 'Common and type fields',
    'register.step3.title': 'On-Chain Auth',
    'register.step3.desc': 'Wallet signature',
    'register.field.type': 'Merchant Type',
    'register.type.restaurant': 'Restaurant',
    'register.type.hotel': 'Hotel',
    'register.type.attraction': 'Attraction',
    'register.type.shop': 'Shop',
    'register.fillDemo': 'Fill Demo Data',
    'register.field.name': 'Business Name',
    'register.field.name.ph': 'e.g. Louwailou Restaurant',
    'register.field.city': 'City',
    'register.field.city.ph': 'e.g. Hangzhou',
    'register.field.country': 'Country Code',
    'register.field.country.ph': 'e.g. CN',
    'register.field.address': 'Detailed Address',
    'register.field.address.ph': 'No. 30 Gushan Road, West Lake District',
    'register.field.desc': 'Description (For AI Agents)',
    'register.field.desc.ph': 'Provide a clear, concise description of your business. AI agents will use this to match you with user requests.',
    'register.specificFields': '{type} Specific Fields',
    'register.noTypeFields': 'No type fields loaded yet.',
    'register.almostThere': 'Almost there!',
    'register.almostTitle.desc': 'Your profile data will be hashed and stored on the 0G Network. You need to sign the transaction with your Web3 wallet.',
    'register.field.wallet': 'Wallet Address',
    'register.field.skills': 'Supported Skills (comma-separated)',
    'register.field.skills.ph': 'get_menu,reserve_table,create_booking',
    'register.back': 'Back',
    'register.next': 'Next Step',
    'register.submit': 'Register on 0G Chain',
    'register.submitting.off': 'Saving Profile...',
    'register.submitting.chain': 'Signing On-Chain Tx...',
    'register.success.title': 'Registration Successful!',
    'register.success.desc': 'Your business profile has been anchored to the 0G blockchain.',
    'register.success.did': 'Your On-Chain DID',
    'register.success.hash': 'Profile Hash (SHA-256)',
    'register.success.tx': 'On-Chain Transaction',
    'register.success.viewExplorer': 'View on 0G Explorer',
    'register.success.endpoint': 'Skill Endpoint',
    'register.success.again': 'Register Another Business',

    // ─── Agent demo page (chat UI) ───
    'demo.connectTitle': 'Connect to 0G Compute Network',
    'demo.connectBadge': 'Connected to 0G Compute · {network}',
    'demo.agentName': 'TourSkill AI Agent',
    'demo.agentStatus.ready': '0G Compute · {model}',
    'demo.agentStatus.notConnected': 'Not Connected',
    'demo.empty.title': 'Connect your wallet to start',
    'demo.empty.subtitle': 'Your 0G tokens power the AI inference',
    // Provider toggle (0G wallet vs Qiniu API key)
    'demo.provider.zerog': '0G Compute · Wallet',
    'demo.provider.qiniu': 'Qiniu AIGC · API Key',
    'demo.qiniu.title': 'Connect with Qiniu AIGC',
    'demo.qiniu.desc': 'Paste your Qiniu API key and pick any model from the marketplace. Stays in this tab only.',
    'demo.qiniu.apiKey': 'API Key',
    'demo.qiniu.model': 'Model',
    'demo.qiniu.loadingModels': 'Loading models…',
    'demo.qiniu.noModels': 'Could not load model list',
    'demo.qiniu.getKey': 'Get a key on Qiniu portal',
    'demo.qiniu.cta': 'Connect with API Key',
    'demo.qiniu.connectedBadge': 'Connected to Qiniu AIGC',
    'demo.qiniu.connectedModel': 'Model: {model} · API key auth',
    'demo.greeting': "Hello! I'm your AI travel assistant powered by **0G Compute Network** and the **TourSkill** decentralized registry.",
    'demo.greeting.canDo': 'I can discover tourism merchants and interact with their on-chain skills. Try asking me:',
    'demo.greeting.ex1': '"Find restaurants in Hangzhou"',
    'demo.greeting.ex2': '"Any hotels in Shanghai?"',
    'demo.greeting.ex3': '"Show me attractions in Suzhou"',
    'demo.greeting.ask': 'What are you looking for?',
    'demo.connect.desc': 'Your MetaMask wallet pays for LLM inference with 0G tokens — fully decentralized.',
    'demo.connect.cta': 'Connect Wallet',
    'demo.connect.connecting': 'Connecting...',
    'demo.connected.model': 'Model: {model} · Provider: {provider}',
    'demo.input.send': 'Send',
    'demo.footer.poweredBy': 'Powered by 0G Compute · {model} · Your wallet pays for inference',
    'demo.chat.errorReply': 'Sorry, an error occurred: {msg}',
    'demo.input.ph.ready': 'Ask about restaurants, hotels, attractions...',
    'demo.input.ph.notReady': 'Connect your wallet first...',
    'demo.footer.ready': 'Each message consumes 0G credits from your wallet.',
    'demo.footer.notReady': 'Connect MetaMask to power the AI agent with your 0G tokens',
    'demo.logs.title': 'Agent Execution Logs',
    'demo.logs.connected': '0G Connected',
    'demo.logs.disconnected': 'Disconnected',
    'demo.logs.empty': 'Connect wallet to see agent activity...',
    'demo.log.responded': 'Agent responded',
    'demo.log.unknownError': 'Unknown error',

    // ─── Merchant sign ceremony (agent-initiated draft → browser signs) ───
    'sign.title': 'Approve your Merchant Agent',
    'sign.subtitle': 'Your AI agent has prepared a merchant listing. Review it below, then connect your wallet to sign and anchor it on 0G Chain. Signing once gives your agent permission to manage this listing forever.',
    'sign.loading': 'Loading draft…',
    'sign.notFound': 'Draft not found or expired',
    'sign.notFoundDesc': 'This sign URL has already been used or has expired. Ask your agent to generate a fresh draft.',
    'sign.preview': 'What your agent wants to register',
    'sign.editHint': 'Review carefully — once you sign, this is anchored on-chain forever. Click "Edit" to fix anything.',
    'sign.edit': 'Edit',
    'sign.save': 'Done',
    'sign.cancel': 'Discard changes',
    'sign.editing': 'Editing — changes apply to your signature',
    'sign.field.type': 'Type',
    'sign.field.city': 'City',
    'sign.field.country': 'Country',
    'sign.field.address': 'Address',
    'sign.field.coords': 'Coordinates',
    'sign.field.skills': 'Agent skills',
    'sign.field.contact': 'Contact',
    'sign.field.phone': 'Phone',
    'sign.field.email': 'Email',
    'sign.field.website': 'Website',
    'sign.field.hours': 'Hours',
    'sign.field.priceLevel': 'Price level (1-5)',
    'sign.field.tags': 'Tags',
    'sign.field.languages': 'Languages',
    'sign.field.specifics': 'Type-specific fields',
    'sign.field.name': 'Name',
    'sign.field.description': 'Description',
    'sign.section.basic': 'Basic info',
    'sign.section.location': 'Location',
    'sign.section.contact': 'Contact & hours',
    'sign.section.classification': 'Classification',
    'sign.section.skills': 'Agent capabilities',
    'sign.section.specifics': 'Merchant-specific',
    'sign.commaHint': 'Separate values with commas',
    'sign.alreadySigned': 'This draft is already signed',
    'sign.alreadySignedDesc': 'You can close this tab — your agent has everything it needs.',
    'sign.connect': 'Connect wallet to continue',
    'sign.connectedAs': 'Signing as',
    'sign.signButton': 'Sign & register on 0G Chain',
    'sign.signing.off': 'Saving profile off-chain…',
    'sign.signing.chain': 'Waiting for MetaMask signature…',
    'sign.signing.bind': 'Authorizing your agent (free signature)…',
    'sign.signing.complete': 'Notifying your agent…',
    'sign.success': 'Signed successfully',
    'sign.successDesc': 'Your merchant is now anchored on-chain and your agent has been notified. You can close this tab.',
    'sign.viewMerchant': 'View merchant page →',
    'sign.viewTx': 'View register tx on chainscan',
    'sign.errorPrefix': 'Signing failed',
    'sign.close': 'Close this tab',

    // ─── Agent install credentials (shown after sign or in Profile) ───
    'install.title': 'Install to your agent',
    'install.desc': 'Paste these into your merchant agent so it can manage this wallet\'s listings. The token is a 30-day session credential — if you lose it, just re-sign from this page.',
    'install.wallet': 'Wallet address',
    'install.token': 'Session token',
    'install.copy': 'Copy',
    'install.copied': 'Copied',
    'install.reveal': 'Reveal token',
    'install.hide': 'Hide',
    'install.regenerate': 'Regenerate token',
    'install.generate': 'Generate agent token',
    'install.generating': 'Waiting for wallet signature…',
    'install.expires': 'Expires {date}',
    'install.snippet': '.env snippet',

    // ─── Common ───
    'common.loading': 'Loading…',
  },
  zh: {
    // ─── Header ───
    'nav.registration': '商家注册',
    'nav.explorer': '商家浏览',
    'nav.demo': 'Agent 演示',
    'header.connect': '连接钱包',
    'header.profile': '个人资料',
    'header.disconnect': '断开连接',
    'header.connectedAs': '已连接',

    // ─── Footer ───
    'footer.copy': '© 2026 TourSkill · 去中心化 A2A 旅游注册表',
    'footer.contract': '智能合约',
    'footer.skillMd': 'SKILL.md',
    'footer.github': 'GitHub',

    // ─── Home: live badge ───
    'home.liveBadge': '0G 测试网已注册 28 家商家',

    // ─── Home: hero ───
    'home.hero.line1': '去中心化',
    'home.hero.line2': 'A2A 旅游注册表',
    'home.hero.subtitle.before': '你的 agent 跟他们的 agent 对话——无 OTA、无中间商。每个商家绑定真实钱包，每次调用通过 ',
    'home.hero.subtitle.highlight': 'x402 微支付',
    'home.hero.subtitle.after': ' 在 HTTP 层结算。',

    // ─── Home: CTAs ───
    'home.cta.human': '我是真人',
    'home.cta.agent': '我是 Agent',
    'home.cta.noAgent.before': '没有 AI agent？',
    'home.cta.noAgent.link': '试用网页版演示',

    // ─── Home: install card ───
    'home.install.tab.personal': '个人 Agent',
    'home.install.tab.merchant': '商家 Agent',
    'home.install.title.personal': '把你的 AI agent 接入 TourSkill',
    'home.install.title.merchant': '让你的商家 agent 接入 TourSkill',
    'home.install.copy': '复制',
    'home.install.copied': '已复制',
    // Personal
    'home.install.personal.step1': '把这句话粘贴给你的个人 agent（Claude Code / Cursor 或任何支持 skill 加载的 AI）',
    'home.install.personal.step2': 'Agent 会自动抓取 SKILL.md——无需鉴权，无需本地后端',
    'home.install.personal.step3.before': '然后跟它说 ',
    'home.install.personal.step3.example': '"帮我找杭州明天的晚餐"',
    'home.install.personal.step3.after': '——亲眼见证 A2A 商业闭环',
    // Merchant
    'home.install.merchant.step1': '把这句话粘贴给你的商家 agent——那个了解你店铺经营情况的 AI',
    'home.install.merchant.step2': 'Agent 起草你的 profile，你确认后通过 MetaMask 一次性签名上链',
    'home.install.merchant.step3.before': '之后随时跟它说 ',
    'home.install.merchant.step3.example': '"更新一下营业时间"',
    'home.install.merchant.step3.after': '——日常修改完全免签',

    // ─── Home: three pillars ───
    'home.pillar1.title': '链上身份',
    'home.pillar1.body': '每个商家通过 ERC-8004 锚定在 0G 链上。身份可验证、可迁移、自主掌控——没有平台能下架你。',
    'home.pillar2.title': 'x402 原生',
    'home.pillar2.body': '首个把支付做进 HTTP 协议的 A2A 注册表。Agent 边缘对 Agent 直接结算——零抽成，不吃 30% OTA 佣金。',
    'home.pillar3.title': 'MCP / A2A 兼容',
    'home.pillar3.body': '标准工具接口——任何支持 MCP 的 AI agent 都能发现、验证、交易。零定制 SDK。',

    // ─── Home: AgentLoopDemo ───
    'demo.badge': '实时演示 · 无真实扣费',
    'demo.title': '看你的 agent 怎么干活',
    'demo.subtitle': '4 次 HTTP 调用，1 条链上回执，中间没有任何平台。',
    'demo.terminalLabel.running': '运行中',
    'demo.terminalLabel.idle': '待机',
    'demo.replay': '重放',
    'demo.restartSoon': '── 几秒后自动重播 ──',
    'demo.cta.before': '想真正试一下？',
    'demo.cta.link': '装载 skill →',

    // ─── Roadmap ───
    'roadmap.badge': '路线图',
    'roadmap.title': '已上线 / 正在建 / 规划中',
    'roadmap.subtitle': '开放注册表 · 商家 agent · 支付 · 信誉——一切公开进行。',
    'roadmap.status.live': '已上线',
    'roadmap.status.building': '建设中',
    'roadmap.status.planned': '规划中',

    // ─── Explorer ───
    'explorer.title': '商家浏览',
    'explorer.subtitle': '发现已上链的商家及其可被 AI agent 调用的技能。',
    'explorer.cityAll': '全部城市',
    'explorer.agentSkills': '可用 Agent 技能',
    'explorer.testSkillApi': '测试 Skill API',
    'explorer.emptyTitle': '未找到商家',
    'explorer.emptyBody': '当前筛选条件下暂无已注册商家。',

    // ─── Status badges ───
    'status.active': '正常营业',
    'status.inactive': '已暂停',

    // ─── Profile page ───
    'profile.connectWallet.title': '连接钱包',
    'profile.connectWallet.body': '用钱包登录后即可查看你的 TourSkill 身份、管理已注册的商家，并把你的 AI agent 接入 TourSkill。',
    'profile.connectWallet.hint': '点击右上角"连接钱包"按钮 →',
    'profile.wallet.title': '钱包身份',
    'profile.wallet.viewChainscan': '在 chainscan 查看',
    'profile.merchants.title': '我的商家',
    'profile.merchants.registerNew': '新增商家',
    'profile.merchants.empty': '当前钱包还没有注册任何商家。',
    'profile.merchants.emptyCta': '注册第一家',
    'profile.merchants.pause': '暂停营业',
    'profile.merchants.resume': '恢复营业',
    'profile.merchants.updating': '更新中……',
    'profile.merchants.toggleError': '切换状态失败——请检查网络后重试。',
    'profile.agent.title': '接入你的 AI Agent',
    'profile.agent.body': '把下面这一行粘贴给你的个人 AI agent，它会自动抓取 TourSkill SKILL.md 并开始跟链上注册表交互。',
    'profile.agent.copyButton': '复制安装命令',
    'profile.agent.copied': '已复制到剪贴板',

    // ─── MerchantDetail page ───
    'detail.back': '返回商家列表',
    'detail.loading': '加载商家详情……',
    'detail.error': '加载失败',
    'detail.badge.verified': '已上链 0G',
    'detail.badge.open': '营业中',
    'detail.badge.paused': '已暂停',
    'detail.section.contact': '联系方式 & 营业时间',
    'detail.section.onchain': '链上凭证',
    'detail.section.skills': '可用 Agent 技能',
    'detail.section.specifics': '商家特定字段',
    'detail.field.hours': '营业时间',
    'detail.field.phone': '电话',
    'detail.field.email': '邮箱',
    'detail.field.website': '官网',
    'detail.field.wallet': '所有者钱包',
    'detail.field.did': '商家 DID',
    'detail.field.profileHash': 'Profile 哈希',
    'detail.field.contract': '注册表合约',
    'detail.viewRegisterTx': '在 chainscan 查看注册交易',
    'detail.onchain.footer': '锚定在 0G Galileo 测试网 (chainId 16602)，通过 ERC-8004 MerchantRegistry 合约。',
    'detail.testSkills': '试用这些技能 →',

    // ─── AgentDemo page (main hero only) ───
    'demoPage.title': '个人 Agent 演示',
    'demoPage.subtitle': '连接你的钱包以使用 0G Compute LLM——你钱包里的 tokens 为 AI agent 的推理买单。',
    'demoPage.reset': '重置',

    // ─── Registration portal ───
    'register.title': '注册你的商家',
    'register.subtitle': '把你的酒店、餐厅或景点发布到 TourSkill 去中心化注册表。任何 AI agent 都能发现并调用你链上声明的技能。',
    'register.step1.title': '基本信息',
    'register.step1.desc': '类型、名称与位置',
    'register.step2.title': '经营详情',
    'register.step2.desc': '通用字段与类型专属字段',
    'register.step3.title': '链上验证',
    'register.step3.desc': '钱包签名',
    'register.field.type': '商家类型',
    'register.type.restaurant': '餐厅',
    'register.type.hotel': '酒店',
    'register.type.attraction': '景点',
    'register.type.shop': '商店',
    'register.fillDemo': '填入示例数据',
    'register.field.name': '商家名称',
    'register.field.name.ph': '例：楼外楼',
    'register.field.city': '城市',
    'register.field.city.ph': '例：杭州',
    'register.field.country': '国家代码',
    'register.field.country.ph': '例：CN',
    'register.field.address': '详细地址',
    'register.field.address.ph': '西湖区孤山路 30 号',
    'register.field.desc': '商家介绍（供 AI Agent 读取）',
    'register.field.desc.ph': '用清晰简洁的语言介绍你的商家。AI agent 会据此为用户匹配推荐。',
    'register.specificFields': '{type} 专属字段',
    'register.noTypeFields': '暂无类型字段。',
    'register.almostThere': '即将完成！',
    'register.almostTitle.desc': '你的商家资料将被哈希并写入 0G Network。你需要用 Web3 钱包对交易进行签名。',
    'register.field.wallet': '钱包地址',
    'register.field.skills': '支持的技能（逗号分隔）',
    'register.field.skills.ph': 'get_menu,reserve_table,create_booking',
    'register.back': '上一步',
    'register.next': '下一步',
    'register.submit': '注册到 0G Chain',
    'register.submitting.off': '正在保存商家资料…',
    'register.submitting.chain': '正在签名链上交易…',
    'register.success.title': '注册成功！',
    'register.success.desc': '你的商家资料已锚定到 0G 区块链。',
    'register.success.did': '链上 DID',
    'register.success.hash': '资料哈希 (SHA-256)',
    'register.success.tx': '链上交易',
    'register.success.viewExplorer': '在 0G Explorer 查看',
    'register.success.endpoint': '技能接入点',
    'register.success.again': '再注册一家',

    // ─── Agent demo page (chat UI) ───
    'demo.connectTitle': '连接到 0G Compute Network',
    'demo.connectBadge': '已连接 0G Compute · {network}',
    'demo.agentName': 'TourSkill AI Agent',
    'demo.agentStatus.ready': '0G Compute · {model}',
    'demo.agentStatus.notConnected': '未连接',
    'demo.empty.title': '连接钱包以开始对话',
    'demo.empty.subtitle': '你钱包里的 0G tokens 为 AI 推理买单',
    // Provider toggle (0G wallet vs Qiniu API key)
    'demo.provider.zerog': '0G Compute · 钱包付费',
    'demo.provider.qiniu': '七牛云 AIGC · API Key',
    'demo.qiniu.title': '接入七牛云 AIGC',
    'demo.qiniu.desc': '粘贴你的七牛云 API Key，从模型广场任选一个模型。仅保存在当前标签页。',
    'demo.qiniu.apiKey': 'API Key',
    'demo.qiniu.model': '模型',
    'demo.qiniu.loadingModels': '正在加载模型列表……',
    'demo.qiniu.noModels': '模型列表加载失败',
    'demo.qiniu.getKey': '到七牛云控制台获取 Key',
    'demo.qiniu.cta': '使用 API Key 连接',
    'demo.qiniu.connectedBadge': '已连接七牛云 AIGC',
    'demo.qiniu.connectedModel': '模型：{model} · API key 鉴权',
    'demo.greeting': '你好！我是你的 AI 旅行助手，由 **0G Compute Network** 驱动，接入 **TourSkill** 去中心化商家注册表。',
    'demo.greeting.canDo': '我可以发现各种旅游商家，并调用它们的链上技能。试着问我：',
    'demo.greeting.ex1': '"杭州有什么餐厅推荐？"',
    'demo.greeting.ex2': '"上海有什么酒店？"',
    'demo.greeting.ex3': '"苏州的景点有哪些？"',
    'demo.greeting.ask': '今天想去哪？',
    'demo.connect.desc': '你的 MetaMask 钱包为 LLM 推理买单——完全去中心化。',
    'demo.connect.cta': '连接钱包',
    'demo.connect.connecting': '连接中……',
    'demo.connected.model': '模型：{model} · 服务商：{provider}',
    'demo.input.send': '发送',
    'demo.footer.poweredBy': '由 0G Compute 驱动 · {model} · 由你的钱包支付推理费用',
    'demo.chat.errorReply': '抱歉出错了：{msg}',
    'demo.input.ph.ready': '问我餐厅、酒店、景点……',
    'demo.input.ph.notReady': '请先连接钱包……',
    'demo.footer.ready': '每条消息都会从你的钱包消耗 0G credits。',
    'demo.footer.notReady': '连接 MetaMask，用你钱包里的 0G tokens 为 AI agent 供能',
    'demo.logs.title': 'Agent 执行日志',
    'demo.logs.connected': '0G 已连接',
    'demo.logs.disconnected': '未连接',
    'demo.logs.empty': '连接钱包后可看到 agent 活动……',
    'demo.log.responded': 'Agent 已回复',
    'demo.log.unknownError': '未知错误',

    // ─── Merchant sign ceremony (agent-initiated draft → browser signs) ───
    'sign.title': '授权你的商家 Agent',
    'sign.subtitle': '你的 AI agent 已经拟好了商家资料。审查下方内容后，连接钱包签名并上链到 0G Chain。一次签名后，agent 将长期代管这个商家。',
    'sign.loading': '正在加载草稿……',
    'sign.notFound': '草稿不存在或已过期',
    'sign.notFoundDesc': '这个签名链接已经使用过或已过期，让你的 agent 重新生成一份新的草稿吧。',
    'sign.preview': 'Agent 想要注册的内容',
    'sign.field.type': '类型',
    'sign.field.city': '城市',
    'sign.field.address': '地址',
    'sign.field.skills': 'Agent 技能',
    'sign.field.contact': '联系方式',
    'sign.field.hours': '营业时间',
    'sign.alreadySigned': '此草稿已签名完成',
    'sign.alreadySignedDesc': '你可以关闭此页面——你的 agent 已经收到所需信息。',
    'sign.connect': '连接钱包以继续',
    'sign.connectedAs': '签名钱包',
    'sign.signButton': '签名并注册到 0G Chain',
    'sign.signing.off': '正在保存资料……',
    'sign.signing.chain': '等待 MetaMask 签名……',
    'sign.signing.bind': '正在授权你的 agent（免费签名）……',
    'sign.signing.complete': '正在通知你的 agent……',
    'sign.success': '签名成功',
    'sign.successDesc': '你的商家已上链，agent 已收到通知。可以关闭此页面了。',
    'sign.viewMerchant': '查看商家页 →',
    'sign.viewTx': '在 chainscan 查看注册交易',
    'sign.errorPrefix': '签名失败',
    'sign.close': '关闭此页',

    // ─── Agent install credentials (shown after sign or in Profile) ───
    'install.title': '安装到你的 Agent',
    'install.desc': '把下面的凭证粘到你的商家 agent 里，它就能代管这个钱包下的商家。Token 是 30 天有效的会话凭证——丢了就在本页重新签名一次就行。',
    'install.wallet': '钱包地址',
    'install.token': '会话 Token',
    'install.copy': '复制',
    'install.copied': '已复制',
    'install.reveal': '显示 token',
    'install.hide': '隐藏',
    'install.regenerate': '重新生成 token',
    'install.generate': '生成 agent token',
    'install.generating': '等待钱包签名……',
    'install.expires': '到期时间 {date}',
    'install.snippet': '.env 代码片段',

    // ─── Common ───
    'common.loading': '加载中……',
  },
}

interface LanguageCtx {
  lang: Lang
  setLang: (l: Lang) => void
  /**
   * Translate a key. Optional `params` interpolates `{name}` placeholders
   * in the string (e.g. `t('demo.agentStatus.ready', { model })`).
   */
  t: (key: string, params?: Record<string, string | number>) => string
}

const Ctx = createContext<LanguageCtx | null>(null)

function detectInitialLang(): Lang {
  if (typeof window === 'undefined') return 'en'
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'zh' || saved === 'en') return saved
  // Auto-detect from browser — any zh-* locale goes to 'zh'
  const nav = navigator.language?.toLowerCase() ?? ''
  return nav.startsWith('zh') ? 'zh' : 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectInitialLang())

  // Keep <html lang="…"> in sync for a11y + search engines
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* ignore */ }
  }, [])

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const raw = TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key] ?? key
    if (!params) return raw
    return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
      const v = params[name]
      return v === undefined ? `{${name}}` : String(v)
    })
  }, [lang])

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

export function useT(): LanguageCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useT must be used inside <LanguageProvider>')
  return v
}
