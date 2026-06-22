import { describe, expect, it } from 'vitest'
import { detectBasic, projectConcepts, nextSteps, buildDetectInput, cacheKey } from './analysis.js'

describe('detectBasic', () => {
  it('matches concepts present in the text', () => {
    const prereqs = detectBasic('We use KL divergence and a gradient step.')
    const concepts = prereqs.map((p) => p.concept)
    expect(concepts).toContain('KL divergence')
    expect(concepts).toContain('Gradient')
  })
  it('falls back to the first concepts when nothing matches', () => {
    const prereqs = detectBasic('lorem ipsum unrelated text')
    expect(prereqs.length).toBeGreaterThan(0)
    expect(prereqs.length).toBeLessThanOrEqual(4)
  })
  it('returns the fixed Area vocabulary only', () => {
    const areas = new Set(detectBasic('matrix vector bayes dropout').map((p) => p.area))
    for (const a of areas) {
      expect(['Probability', 'Statistics', 'Linear algebra', 'Calculus', 'Optimization', 'ML']).toContain(a)
    }
  })
})

describe('projectConcepts', () => {
  it('maps a Lesson to the legacy ConceptCard shape', () => {
    const cards = projectConcepts([
      { area: 'ML', concept: 'Dropout', title: 'Dropout', intuition: 'Hide units.', example: 'x', inThisPaper: 'used as regularizer' },
    ])
    expect(cards[0]).toEqual({ area: 'ML', term: 'Dropout', plainEnglish: 'Hide units.', whyItMatters: 'used as regularizer' })
  })
})

describe('buildDetectInput', () => {
  it('caps long text to maxDetectChars and includes the title', () => {
    const long = 'a'.repeat(50_000)
    const out = buildDetectInput('Cool Paper', long, 14_000)
    expect(out).toContain('Cool Paper')
    expect(out.length).toBeLessThanOrEqual(14_000 + 'Cool Paper'.length + 4)
  })
})
describe('cacheKey', () => {
  it('is stable for the same inputs and differs when text changes', () => {
    const a = cacheKey('T', 'http://x', 'body')
    const b = cacheKey('T', 'http://x', 'body')
    const c = cacheKey('T', 'http://x', 'body2')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
