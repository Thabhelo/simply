import { describe, expect, it } from 'vitest'
import { detectBasic, projectConcepts, nextSteps } from './analysis.js'

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
