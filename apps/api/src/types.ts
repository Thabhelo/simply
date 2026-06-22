export type Area = 'Probability' | 'Statistics' | 'Linear algebra' | 'Calculus' | 'Optimization' | 'ML'
export const AREAS: Area[] = ['Probability', 'Statistics', 'Linear algebra', 'Calculus', 'Optimization', 'ML']
export const maxLessons = 6

export type Prerequisite = { area: Area; concept: string; evidenceQuote: string; whyAssumed: string }
export type Lesson = { area: Area; concept: string; title: string; intuition: string; formula?: string; example: string; inThisPaper: string }
export type ConceptCard = { area: Area; term: string; plainEnglish: string; whyItMatters: string }
export type AnalysisResult = {
  title: string; url?: string; summary: string; mode: 'ai' | 'basic'
  lessons: Lesson[]; concepts: ConceptCard[]; nextSteps: string[]
}
