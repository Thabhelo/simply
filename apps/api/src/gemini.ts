import { GoogleGenAI } from '@google/genai'
import './load-env.js'

export const FREE_TIER_TEXT_MODEL = 'gemini-2.5-flash'

function loadApiKeys(): string[] {
  const fromList =
    process.env.GEMINI_API_KEYS?.split(',')
      .map((key) => key.trim())
      .filter(Boolean) ?? []
  if (fromList.length > 0) return fromList
  const single = process.env.GEMINI_API_KEY?.trim()
  return single ? [single] : []
}

let cachedKeys: string[] | null = null

function apiKeys(): string[] {
  if (!cachedKeys) cachedKeys = loadApiKeys()
  return cachedKeys
}

export function getGeminiApiKeys(): readonly string[] {
  return apiKeys()
}

// GoogleGenAI clients are stateless per API key but hold an HTTP agent; reuse
// one per key instead of allocating a fresh client on every request/retry.
const clientCache = new Map<string, GoogleGenAI>()
function clientForKey(apiKey: string): GoogleGenAI {
  let client = clientCache.get(apiKey)
  if (!client) {
    client = new GoogleGenAI({ apiKey })
    clientCache.set(apiKey, client)
  }
  return client
}

export function hasGemini(): boolean {
  return apiKeys().length > 0
}

export function isQuotaError(error: unknown): boolean {
  const message = formatGeminiError(error).toLowerCase()
  return (
    message.includes('429') ||
    message.includes('quota') ||
    message.includes('resource_exhausted') ||
    message.includes('rate limit')
  )
}

/** Primary model first, then flash — pro has limit:0 on free tier. */
export function textModelChain(primary: string): string[] {
  return primary === FREE_TIER_TEXT_MODEL ? [primary] : [primary, FREE_TIER_TEXT_MODEL]
}

export function formatGeminiError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const raw = error.message.trim()
  if (!raw.startsWith('{')) return raw
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: number } }
    const msg = parsed.error?.message
    if (msg) {
      const firstLine = msg.split('\n')[0]?.trim()
      return firstLine || raw
    }
  } catch {
    // keep raw
  }
  return raw.slice(0, 240)
}

/** Rotate API keys, then fall back to flash when a model hits quota. */
export async function withGeminiModelRetry<T>(
  models: readonly string[],
  fn: (client: GoogleGenAI, model: string) => Promise<T>,
): Promise<T> {
  const keys = apiKeys()
  if (!keys.length) {
    throw new Error('GEMINI_API_KEY not set')
  }

  let lastError: unknown
  for (const model of models) {
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
      const client = clientForKey(keys[keyIndex])
      try {
        return await fn(client, model)
      } catch (error) {
        lastError = error
        if (!isQuotaError(error)) throw error
        if (keyIndex < keys.length - 1) {
          console.warn(`Simply: quota on key ${keyIndex + 1}, trying next key…`)
          continue
        }
        const nextModel = models[models.indexOf(model) + 1]
        if (nextModel) {
          console.warn(`Simply: quota exhausted on ${model}, falling back to ${nextModel}…`)
        }
        break
      }
    }
  }
  throw lastError
}

/** Try each configured API key when a call hits quota / rate limits. */
export async function withGeminiRetry<T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  const keys = apiKeys()
  if (!keys.length) {
    throw new Error('GEMINI_API_KEY not set')
  }

  let lastError: unknown
  for (let index = 0; index < keys.length; index++) {
    const client = clientForKey(keys[index])
    try {
      return await fn(client)
    } catch (error) {
      lastError = error
      const hasAnotherKey = index < keys.length - 1
      if (!isQuotaError(error) || !hasAnotherKey) throw error
      console.warn(`Simply: Gemini key ${index + 1} exhausted, trying next key…`)
    }
  }
  throw lastError
}
