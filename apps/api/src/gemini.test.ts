import { describe, expect, it } from 'vitest'
import { formatGeminiError, getGeminiApiKeys, isQuotaError, textModelChain } from './gemini.js'

describe('isQuotaError', () => {
  it('detects quota and rate-limit failures', () => {
    expect(isQuotaError(new Error('429 Too Many Requests'))).toBe(true)
    expect(isQuotaError(new Error('RESOURCE_EXHAUSTED quota'))).toBe(true)
    expect(isQuotaError(new Error('network timeout'))).toBe(false)
  })
})

describe('textModelChain', () => {
  it('falls back to flash when primary is pro', () => {
    expect(textModelChain('gemini-2.5-pro')).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash'])
    expect(textModelChain('gemini-2.5-flash')).toEqual(['gemini-2.5-flash'])
  })
})

describe('formatGeminiError', () => {
  it('shortens JSON error payloads', () => {
    const message = formatGeminiError(new Error('{"error":{"message":"Quota exceeded for model\\n* detail"}}'))
    expect(message).toBe('Quota exceeded for model')
  })
})

describe('getGeminiApiKeys', () => {
  it('loads from env after load-env runs', () => {
    expect(Array.isArray(getGeminiApiKeys())).toBe(true)
  })
})
