import { useState, useCallback, useRef } from 'react'
import { BrowserProvider } from 'ethers'
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker'

export type NetworkType = 'testnet' | 'mainnet'

export const NETWORKS: Record<NetworkType, {
  name: string
  chainId: number
  chainIdHex: string
  rpcUrl: string
  explorer: string
  currency: string
}> = {
  testnet: {
    name: '0G Testnet (Galileo)',
    chainId: 16602,
    chainIdHex: '0x40DA',
    rpcUrl: 'https://evmrpc-testnet.0g.ai',
    explorer: 'https://chainscan-galileo.0g.ai',
    currency: 'A0GI',
  },
  mainnet: {
    name: '0G Mainnet',
    chainId: 16661,
    chainIdHex: '0x4115',
    rpcUrl: 'https://evmrpc.0g.ai',
    explorer: 'https://chainscan.0g.ai',
    currency: 'A0GI',
  },
}

export interface ToolCall {
  id: string
  function: { name: string; arguments: string }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolLogEntry {
  type: 'tool_call' | 'tool_result' | 'info' | 'error'
  name?: string
  args?: Record<string, unknown>
  text?: string
  time: string
}

interface ComputeState {
  ready: boolean
  model: string | null
  provider: string | null
  network: NetworkType | null
  error: string | null
  loading: boolean
  step: string | null
}

// Match the same env contract used by every other page so prod hits
// api.tourskill.paking.xyz, while local dev with VITE_API_BASE_URL set
// can still point at a local backend.
const MCP_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://api.tourskill.paking.xyz'

export const SYSTEM_PROMPT = `You are a helpful AI travel assistant powered by the TourSkill decentralized registry on the 0G Network.

You help users discover tourism merchants (hotels, restaurants, attractions) and interact with their on-chain skills.

You have access to tools to:
1. discover_merchants — search the registry by city, type, or keyword
2. invoke_merchant_skill — call a merchant's skill API (get_menu, check_availability, reserve_table, etc.)
3. get_merchant_details — get full merchant profile

CRITICAL: When calling invoke_merchant_skill, use the "merchant_id" field from discovery results as the "did" parameter (e.g. "merchant:968e07fdafc1"). Do NOT use the "did" field (e.g. "did:tourskill:merchant:...") — it will fail.

When a user asks about dining, hotels, or attractions in a city:
1. First use discover_merchants to find relevant merchants
2. Then use invoke_merchant_skill with the merchant_id to get details like menus, availability, or rates
3. Present the results in a friendly, helpful way
4. Offer to take action (reserve table, book room, purchase ticket) if appropriate

Always be concise and helpful. Format prices with ¥ symbol for CNY.
Today's date is ${new Date().toISOString().slice(0, 10)}.
Tomorrow's date is ${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}.`

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'discover_merchants',
      description: 'Search the TourSkill decentralized registry for tourism merchants by city, type, or keyword.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name in lowercase (e.g. hangzhou, shanghai)' },
          type: { type: 'string', enum: ['hotel', 'restaurant', 'attraction'], description: 'Merchant category' },
          keyword: { type: 'string', description: 'Free-text search' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'invoke_merchant_skill',
      description: 'Invoke a skill on a registered merchant (e.g. get_menu, check_availability, reserve_table). IMPORTANT: Use the merchant_id value directly (e.g. "merchant:968e07fdafc1"), NOT the did field.',
      parameters: {
        type: 'object',
        properties: {
          did: { type: 'string', description: 'The merchant_id value from discovery results (e.g. "merchant:968e07fdafc1"). Do NOT use the did field.' },
          skill_name: { type: 'string', description: 'Skill to invoke' },
          skill_args: { type: 'object', description: 'Arguments for the skill' },
        },
        required: ['did', 'skill_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_merchant_details',
      description: 'Get full profile details for a specific merchant by ID.',
      parameters: {
        type: 'object',
        properties: {
          merchant_id: { type: 'string', description: 'The merchant_id to look up' },
        },
        required: ['merchant_id'],
      },
    },
  },
]

export async function executeMcpTool(toolName: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${MCP_BASE}/mcp/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: toolName, arguments: args }),
  })
  const data = await res.json()
  return data.content?.[0]?.text || '{}'
}

type BrokerType = Awaited<ReturnType<typeof createZGComputeNetworkBroker>>

export function use0gCompute() {
  const [state, setState] = useState<ComputeState>({
    ready: false,
    model: null,
    provider: null,
    network: null,
    error: null,
    loading: false,
    step: null,
  })

  const brokerRef = useRef<BrokerType | null>(null)
  const providerAddrRef = useRef<string>('')
  const endpointRef = useRef<string>('')
  const modelRef = useRef<string>('')

  const setStep = (step: string) => {
    setState(prev => ({ ...prev, step }))
  }

  const connect = useCallback(async (network: NetworkType, onLog?: (text: string, type: 'info' | 'action' | 'success' | 'error') => void) => {
    setState(prev => ({ ...prev, loading: true, error: null, step: 'Connecting MetaMask...' }))
    const log = onLog || (() => {})
    const netConfig = NETWORKS[network]

    try {
      // Step 1: Connect MetaMask and switch to correct chain
      const eth = (window as Window & { ethereum?: unknown }).ethereum
      if (!eth) throw new Error('Please install MetaMask to use 0G Compute')

      // Request account access
      await (eth as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }).request({ method: 'eth_requestAccounts' })

      // Switch to the selected 0G network
      log(`Switching to ${netConfig.name}...`, 'action')
      try {
        await (eth as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }).request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: netConfig.chainIdHex }],
        })
      } catch (switchErr: unknown) {
        // Chain not added yet — add it
        if ((switchErr as { code?: number }).code === 4902) {
          await (eth as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }).request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: netConfig.chainIdHex,
              chainName: netConfig.name,
              nativeCurrency: { name: 'A0GI', symbol: netConfig.currency, decimals: 18 },
              rpcUrls: [netConfig.rpcUrl],
              blockExplorerUrls: [netConfig.explorer],
            }],
          })
        } else {
          throw switchErr
        }
      }

      const provider = new BrowserProvider(eth as never)
      const signer = await provider.getSigner()
      log(`MetaMask connected to ${netConfig.name}`, 'success')

      // Step 2: Create 0G Compute broker
      setStep('Creating 0G Compute broker...')
      log('Initializing 0G Compute broker...', 'action')
      const broker = await createZGComputeNetworkBroker(signer)
      brokerRef.current = broker
      log('Broker initialized', 'success')

      // Step 3: Discover chatbot providers
      setStep('Discovering AI providers...')
      log('Discovering chatbot providers on 0G Network...', 'action')
      const services = await broker.inference.listService()
      const chatbots = (services as unknown[]).filter((s: unknown) => (s as string[])[1] === 'chatbot')

      if (chatbots.length === 0) {
        throw new Error('No chatbot providers available on 0G Compute Network. Try again later.')
      }

      const selected = chatbots[0] as string[]
      providerAddrRef.current = selected[0]
      modelRef.current = selected[6]
      log(`Found provider: ${providerAddrRef.current.slice(0, 10)}...`, 'success')
      log(`Model: ${modelRef.current}`, 'success')

      // Step 4: Get endpoint
      const meta = await broker.inference.getServiceMetadata(providerAddrRef.current)
      endpointRef.current = meta.endpoint

      // Step 5: Check ledger and fund if needed
      setStep('Checking compute account balance...')
      log('Checking 0G Compute ledger balance...', 'action')

      let hasLedger = false
      try {
        const ledger = await broker.ledger.getLedger()
        // ledger is a tuple: [0]=owner, [1]=totalBalance, [2]=availableBalance, etc.
        const totalBalance = ledger[1] as bigint
        hasLedger = totalBalance > 0n
        if (hasLedger) {
          const balanceOG = Number(totalBalance) / 1e18
          log(`Ledger found. Balance: ${balanceOG.toFixed(4)} 0G`, 'success')
        }
      } catch {
        // No ledger exists yet
        log('No ledger found — will create one', 'info')
      }

      if (!hasLedger) {
        // Create ledger with minimum 3 0G deposit
        setStep('Creating ledger (depositing 3 0G)...')
        log('Creating ledger with 3 0G deposit (MetaMask will prompt)...', 'action')
        try {
          await broker.ledger.addLedger(3)
          log('Ledger created with 3 0G deposit!', 'success')
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          if (msg.includes('user rejected') || msg.includes('denied')) {
            throw new Error('Transaction rejected. You need to deposit at least 3 0G to create a compute ledger.')
          }
          // Maybe ledger already exists but had 0 balance — try depositFund instead
          if (msg.includes('already') || msg.includes('exist')) {
            log('Ledger exists, depositing 3 0G...', 'action')
            await broker.ledger.depositFund(3)
            log('Deposited 3 0G', 'success')
          } else {
            throw e
          }
        }
      }

      // Step 6: Check provider locked balance, transfer only if insufficient
      // Required: > 1 0G locked balance (provider needs minimum reserve 1.0 + fee overhead)
      // We use 2 0G as the target to leave comfortable buffer for fees
      setStep('Checking provider locked balance...')
      log('Checking provider locked balance...', 'action')

      const MIN_REQUIRED = BigInt(15) * BigInt(10 ** 17) // 1.5 0G — threshold to trigger top-up
      const TOP_UP_AMOUNT = BigInt(2) * BigInt(10 ** 18) // 2 0G — transfer amount with buffer

      let providerBalance = 0n
      try {
        const providers = await broker.ledger.getProvidersWithBalance('inference')
        const match = providers.find(([addr]: [string, bigint, bigint]) =>
          addr.toLowerCase() === providerAddrRef.current.toLowerCase()
        )
        if (match) {
          providerBalance = match[1]
        }
      } catch {
        // No sub-account yet
      }

      const balOG = Number(providerBalance) / 1e18
      log(`Provider locked balance: ${balOG.toFixed(4)} 0G`, providerBalance >= MIN_REQUIRED ? 'success' : 'info')

      if (providerBalance < MIN_REQUIRED) {
        setStep('Transferring 2 0G to provider...')
        log(`Balance insufficient (need >1.5 0G). Transferring 2 0G (MetaMask will prompt)...`, 'action')
        try {
          await broker.ledger.transferFund(
            providerAddrRef.current,
            'inference',
            TOP_UP_AMOUNT,
          )
          log('Transferred 2 0G to provider — ready for inference!', 'success')
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          if (msg.includes('user rejected') || msg.includes('denied')) {
            throw new Error('Transaction rejected. You need to transfer funds to the provider to enable inference.')
          }
          throw e
        }
      } else {
        log('Locked balance sufficient — skipping transfer', 'success')
      }

      // Step 7: Acknowledge provider signer (transferFund may auto-do this, but be safe)
      try {
        await broker.inference.acknowledgeProviderSigner(providerAddrRef.current)
      } catch {
        // Already acknowledged
      }

      log('0G Compute fully connected and funded!', 'success')

      setState({
        ready: true,
        model: modelRef.current,
        provider: providerAddrRef.current,
        network,
        error: null,
        loading: false,
        step: null,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to 0G Compute'
      log(`Error: ${msg}`, 'error')
      setState({ ready: false, model: null, provider: null, network: null, error: msg, loading: false, step: null })
    }
  }, [])

  const chat = useCallback(async (
    userMessages: { role: string; content: string }[],
    onToolLog: (entry: ToolLogEntry) => void,
  ): Promise<string> => {
    if (!brokerRef.current) throw new Error('Not connected to 0G Compute')

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...userMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    let iterations = 0
    const MAX_ITERATIONS = 8

    while (iterations < MAX_ITERATIONS) {
      iterations++

      const headers = await brokerRef.current.inference.getRequestHeaders(providerAddrRef.current)

      onToolLog({ type: 'info', text: `Calling 0G Compute LLM (${modelRef.current})...`, time: new Date().toISOString() })

      const response = await fetch(`${endpointRef.current}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          messages,
          model: modelRef.current,
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        // Auto top-up if insufficient balance during chat
        if (response.status === 400 && errText.includes('insufficient balance') && brokerRef.current) {
          onToolLog({ type: 'info', text: 'Insufficient locked balance — auto top-up 2 0G...', time: new Date().toISOString() })
          try {
            await brokerRef.current.ledger.transferFund(
              providerAddrRef.current,
              'inference',
              BigInt(2) * BigInt(10 ** 18),
            )
            onToolLog({ type: 'info', text: 'Top-up successful, retrying...', time: new Date().toISOString() })
            continue // Retry this iteration
          } catch {
            // Top-up failed, throw original error
          }
        }
        throw new Error(`0G Compute error (${response.status}): ${errText.slice(0, 200)}`)
      }

      const data = await response.json()

      // CRITICAL: processResponse for fee settlement
      const chatID: string | undefined =
        response.headers.get('ZG-Res-Key') ||
        response.headers.get('zg-res-key') ||
        data.id ||
        undefined
      await brokerRef.current.inference.processResponse(
        providerAddrRef.current,
        chatID,
        JSON.stringify(data.usage || {}),
      )

      const choice = data.choices?.[0]
      if (!choice) return 'No response from model.'

      // Handle tool calls
      if (choice.finish_reason === 'tool_calls' || choice.message?.tool_calls?.length > 0) {
        messages.push(choice.message)

        for (const toolCall of choice.message.tool_calls) {
          const fn = toolCall.function
          const args = JSON.parse(fn.arguments || '{}')

          onToolLog({ type: 'tool_call', name: fn.name, args, time: new Date().toISOString() })

          const result = await executeMcpTool(fn.name, args)

          onToolLog({
            type: 'tool_result',
            name: fn.name,
            text: result.slice(0, 150) + (result.length > 150 ? '...' : ''),
            time: new Date().toISOString(),
          })

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          })
        }
        continue
      }

      // Final text response
      return choice.message?.content || 'Done.'
    }

    return 'Reached maximum tool call iterations.'
  }, [])

  return { ...state, connect, chat }
}
