import { describe, expect, it } from 'vitest'
import { getCachedAiGuide, getGuide, saveGuide } from './guideStore.js'
import type { Guide } from './types.js'

const sampleGuide = (mode: 'ai' | 'basic'): Guide => ({
  id: 'test-guide-id',
  title: 'Test Paper',
  summary: 'summary',
  mode,
  overview: 'overview',
  lessons: [],
  concepts: [],
  nextSteps: [],
})

describe('guideStore (memory fallback)', () => {
  it('saves and retrieves a guide', async () => {
    const guide = sampleGuide('basic')
    await saveGuide(guide)
    const loaded = await getGuide('test-guide-id')
    expect(loaded?.title).toBe('Test Paper')
  })

  it('returns cached ai guides only from getCachedAiGuide', async () => {
    await saveGuide(sampleGuide('basic'))
    expect(await getCachedAiGuide('test-guide-id')).toBeNull()

    await saveGuide(sampleGuide('ai'))
    const ai = await getCachedAiGuide('test-guide-id')
    expect(ai?.mode).toBe('ai')
  })
})
