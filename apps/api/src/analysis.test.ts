import { describe, expect, it } from 'vitest'
import { detectBasic, projectConcepts, lessonsFromBasic, nextSteps, buildDetectInput, cacheKey, filterBuildsOn } from './analysis.js'

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
  it('emits empty evidence quotes', () => {
    const prereqs = detectBasic('KL divergence and gradients')
    expect(prereqs.length).toBeGreaterThan(0)
    for (const p of prereqs) {
      expect(p.evidenceQuote).toBe('')
    }
  })
})

describe('lessonsFromBasic', () => {
  it('maps prerequisites to the enriched basic Lesson shape', () => {
    const lessons = lessonsFromBasic([
      { area: 'ML', concept: 'Dropout', evidenceQuote: '', whyAssumed: 'regularizes', buildsOn: [] },
    ])
    expect(lessons[0]).toEqual({
      area: 'ML', concept: 'Dropout', title: 'Dropout',
      hook: '', definition: '', intuition: 'regularizes', example: '', inThisPaper: 'regularizes',
      buildsOn: [],
    })
  })
})

describe('projectConcepts', () => {
  it('maps a Lesson to the legacy ConceptCard shape', () => {
    const cards = projectConcepts([
      { area: 'ML', concept: 'Dropout', title: 'Dropout', hook: 'h', definition: 'd', intuition: 'Hide units.', example: 'x', inThisPaper: 'used as regularizer', buildsOn: [] },
    ])
    expect(cards[0]).toEqual({ area: 'ML', term: 'Dropout', plainEnglish: 'Hide units.', whyItMatters: 'used as regularizer' })
  })
})

describe('detectBasic buildsOn', () => {
  it('sets buildsOn to [] on every prerequisite', () => {
    expect(detectBasic('KL divergence and gradients').every((p) => Array.isArray(p.buildsOn) && p.buildsOn.length === 0)).toBe(true)
  })
})

describe('filterBuildsOn', () => {
  it('drops buildsOn references to concepts not in the set and self-refs', () => {
    const out = filterBuildsOn([
      { area: 'Linear algebra', concept: 'Vectors', evidenceQuote: '', whyAssumed: '', buildsOn: [] },
      { area: 'Calculus', concept: 'Gradient', evidenceQuote: '', whyAssumed: '', buildsOn: ['Vectors', 'Ghost concept', 'Gradient'] },
    ])
    expect(out[1].buildsOn).toEqual(['Vectors'])
  })
})

describe('buildDetectInput', () => {
  it('caps long text to maxDetectChars and includes the title', () => {
    const long = 'a'.repeat(50_000)
    const out = buildDetectInput('Cool Paper', long, 14_000)
    expect(out).toContain('Cool Paper')
    expect(out.length).toBe('Cool Paper'.length + 2 + 14_000)
  })
  it('omits the title join when the title is empty', () => {
    expect(buildDetectInput('', 'abc', 100)).toBe('abc')
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
  it('treats each field independently', () => {
    expect(cacheKey('A', 'u', 't')).not.toBe(cacheKey('B', 'u', 't'))
    expect(cacheKey('A', 'u', 't')).not.toBe(cacheKey('A', 'v', 't'))
  })
})
