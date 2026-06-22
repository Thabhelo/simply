import { createHash } from 'node:crypto'
import { maxLessons } from './types.js'
import type { Area, Prerequisite, Lesson, ConceptCard } from './types.js'

const basicFallbackCount = 4 // when nothing matches, show a few generic starters

type Concept = {
  area: Area
  term: string
  whyItMatters: string
  plainEnglish: string
  triggers: RegExp[]
}

const concepts: Concept[] = [
  {
    area: 'Probability',
    term: 'Bayesian inference',
    whyItMatters: 'Many ML papers model uncertainty by updating beliefs after seeing data.',
    plainEnglish: 'Start with a belief, observe evidence, and revise the belief.',
    triggers: [/bayes/i, /posterior/i, /prior/i],
  },
  {
    area: 'Probability',
    term: 'KL divergence',
    whyItMatters: 'It appears when papers compare an approximate distribution with a target distribution.',
    plainEnglish: 'A one-way penalty for how poorly one probability distribution imitates another.',
    triggers: [/kl divergence/i, /kullback/i, /relative entropy/i],
  },
  {
    area: 'Statistics',
    term: 'Monte Carlo estimation',
    whyItMatters: 'Papers use sampling when exact expectations are too expensive to compute.',
    plainEnglish: 'Estimate a hard average by drawing many random examples and averaging them.',
    triggers: [/monte carlo/i, /sampling/i, /sampled/i],
  },
  {
    area: 'Linear algebra',
    term: 'Vectors and matrices',
    whyItMatters: 'Model inputs, weights, embeddings, and transformations are usually matrix-shaped.',
    plainEnglish: 'Vectors store lists of numbers; matrices transform those lists into new lists.',
    triggers: [/matrix/i, /matrices/i, /vector/i, /linear/i],
  },
  {
    area: 'Calculus',
    term: 'Gradient',
    whyItMatters: 'Gradients tell learning algorithms which direction changes the loss fastest.',
    plainEnglish: 'A gradient is a slope for many variables at once.',
    triggers: [/gradient/i, /derivative/i, /differentiat/i],
  },
  {
    area: 'Optimization',
    term: 'Variational inference',
    whyItMatters: 'It turns an impossible inference problem into a trainable optimization problem.',
    plainEnglish: 'Pick a simpler family of distributions and tune it until it mimics the hard one.',
    triggers: [/variational/i, /evidence lower bound/i, /\belbo\b/i],
  },
  {
    area: 'ML',
    term: 'Dropout',
    whyItMatters: 'Dropout is a regularization method that also connects to uncertainty estimates.',
    plainEnglish: 'Randomly hide parts of a neural network during training so it learns robust patterns.',
    triggers: [/dropout/i, /regulari[sz]ation/i],
  },
]

export function detectBasic(text: string): Prerequisite[] {
  const matched = concepts.filter((c) => c.triggers.some((t) => t.test(text)))
  const chosen = matched.length > 0 ? matched.slice(0, maxLessons) : concepts.slice(0, basicFallbackCount)
  return chosen.map((c) => ({
    area: c.area, concept: c.term, evidenceQuote: '', whyAssumed: c.whyItMatters,
  }))
}

export function projectConcepts(lessons: Lesson[]): ConceptCard[] {
  return lessons.map((l) => ({ area: l.area, term: l.concept, plainEnglish: l.intuition, whyItMatters: l.inThisPaper }))
}

export const nextSteps = [
  'Read the abstract and introduction once without stopping.',
  'Review the prerequisite concepts below for 20 minutes.',
  'Return to the methods section and annotate every symbol that repeats.',
  'Export this guide as a PDF and keep it beside the paper.',
]

export function lessonsFromBasic(prereqs: Prerequisite[]): Lesson[] {
  return prereqs.map((p) => ({
    area: p.area, concept: p.concept, title: p.concept, intuition: p.whyAssumed, example: '', inThisPaper: p.whyAssumed,
  }))
}

export function buildDetectInput(title: string, text: string, maxChars: number): string {
  return [title, text.slice(0, maxChars)].filter(Boolean).join('\n\n')
}

export function cacheKey(title: string, url: string | undefined, text: string): string {
  return createHash('sha256').update(JSON.stringify([title, url ?? '', text])).digest('hex')
}
