/**
 * Qiniu AIGC (七牛云) compute hook — alternative to use0gCompute that
 * uses a plain OpenAI-compatible API key instead of a wallet ledger.
 *
 * Why this exists alongside use0gCompute:
 *   - 0G Compute is the "decentralized identity + pay-per-call" story we
 *     pitch on stage; great for the demo but requires MetaMask + 0G token
 *     deposit, which isn't viable for everyone.
 *   - Qiniu AIGC offers the same OpenAI/Anthropic-compatible chat surface
 *     against a marketplace of 50+ Chinese-friendly models (DeepSeek-V3.2,
 *     Kimi-K2, GLM-5, Qwen3, MiniMax, etc.) authenticated by a single
 *     API key — much lower friction for visitors who just want to play
 *     with the agent.
 *
 * Surface mirrors use0gCompute on purpose so AgentDemo can swap providers
 * with minimal call-site logic.
 */

import { useCallback, useRef, useState } from 'react'

import {
  type ChatMessage,
  type ToolLogEntry,
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  executeMcpTool,
} from './use0gCompute'

const QINIU_BASE = 'https://api.qnaigc.com/v1'

export interface QiniuModel {
  id: string
  owned_by: string
  created: number
}

interface QiniuState {
  ready: boolean
  model: string | null
  // We surface base URL through `provider` so the badge layout in
  // AgentDemo (which already shows `provider`) renders something useful.
  provider: string | null
  error: string | null
  loading: boolean
  step: string | null
}

const INITIAL_STATE: QiniuState = {
  ready: false,
  model: null,
  provider: null,
  error: null,
  loading: false,
  step: null,
}

/**
 * Fetch the model catalog from Qiniu AIGC. Public endpoint — works
 * without an API key, so we can populate the dropdown before the user
 * has typed anything.
 */
export async function fetchQiniuModels(): Promise<QiniuModel[]> {
  const res = await fetch(`${QINIU_BASE}/models`)
  if (!res.ok) {
    throw new Error(`Qiniu /models failed (${res.status})`)
  }
  const data = (await res.json()) as { data: QiniuModel[] }
  return data.data ?? []
}

export function useQiniuCompute() {
  const [state, setState] = useState<QiniuState>(INITIAL_STATE)

  const apiKeyRef = useRef<string>('')
  const modelRef = useRef<string>('')

  const connect = useCallback(
    async (
      apiKey: string,
      modelId: string,
      onLog?: (text: string, type: 'info' | 'action' | 'success' | 'error') => void,
    ) => {
      const log = onLog ?? (() => {})
      setState({ ...INITIAL_STATE, loading: true, step: 'Validating API key…' })

      try {
        if (!apiKey || !apiKey.startsWith('sk-')) {
          throw new Error('Please paste a Qiniu API key starting with sk-')
        }
        if (!modelId) throw new Error('Please pick a model first')

        log(`Validating Qiniu key against ${modelId}…`, 'action')

        // Light-weight validation: send a minimal chat completion to
        // confirm both the key and the model are usable. This is the
        // same shape we'll use during real chat, so any failure surfaces
        // here (auth errors, billing issues, deprecated model) instead
        // of the first user message.
        const res = await fetch(`${QINIU_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 5,
          }),
        })

        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Qiniu API error (${res.status}): ${body.slice(0, 200)}`)
        }

        apiKeyRef.current = apiKey
        modelRef.current = modelId

        log(`Connected to Qiniu AIGC · ${modelId}`, 'success')

        setState({
          ready: true,
          model: modelId,
          provider: 'qiniu',
          error: null,
          loading: false,
          step: null,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Connect failed'
        log(`Error: ${msg}`, 'error')
        setState({ ...INITIAL_STATE, error: msg })
      }
    },
    [],
  )

  const chat = useCallback(
    async (
      userMessages: { role: string; content: string }[],
      onToolLog: (entry: ToolLogEntry) => void,
    ): Promise<string> => {
      if (!apiKeyRef.current) throw new Error('Not connected to Qiniu AIGC')

      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...userMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ]

      let iterations = 0
      const MAX_ITERATIONS = 8

      while (iterations < MAX_ITERATIONS) {
        iterations++

        onToolLog({
          type: 'info',
          text: `Calling Qiniu AIGC LLM (${modelRef.current})…`,
          time: new Date().toISOString(),
        })

        const response = await fetch(`${QINIU_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKeyRef.current}`,
          },
          body: JSON.stringify({
            messages,
            model: modelRef.current,
            tools: TOOL_DEFINITIONS,
            tool_choice: 'auto',
          }),
        })

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Qiniu AIGC error (${response.status}): ${errText.slice(0, 200)}`)
        }

        const data = await response.json()
        const choice = data.choices?.[0]
        if (!choice) return 'No response from model.'

        // Tool-call branch — execute via the same MCP backend used by 0G.
        if (
          choice.finish_reason === 'tool_calls' ||
          choice.message?.tool_calls?.length > 0
        ) {
          messages.push(choice.message)

          for (const toolCall of choice.message.tool_calls) {
            const fn = toolCall.function
            let args: Record<string, unknown>
            try {
              args = JSON.parse(fn.arguments || '{}')
            } catch {
              args = {}
            }

            onToolLog({
              type: 'tool_call',
              name: fn.name,
              args,
              time: new Date().toISOString(),
            })

            const result = await executeMcpTool(fn.name, args)

            onToolLog({
              type: 'tool_result',
              name: fn.name,
              text: result.slice(0, 150) + (result.length > 150 ? '…' : ''),
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

        return choice.message?.content || 'Done.'
      }

      return 'Reached maximum tool call iterations.'
    },
    [],
  )

  // Mirror the 0G hook's return shape so AgentDemo can use either.
  // `network` is 0G-specific so we always return null.
  return { ...state, network: null, connect, chat }
}
