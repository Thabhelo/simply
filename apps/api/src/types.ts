export type VisualStep = { label: string; narration: string }

export type SketchElementType = 'rectangle' | 'ellipse' | 'diamond' | 'text' | 'arrow'

export type ExcalidrawElementSkeleton = {
  type: SketchElementType
  x: number
  y: number
  width: number
  height: number
  label?: { text: string }
}

export type Area = 'Probability' | 'Statistics' | 'Linear algebra' | 'Calculus' | 'Optimization' | 'ML'
export const AREAS: Area[] = ['Probability', 'Statistics', 'Linear algebra', 'Calculus', 'Optimization', 'ML']
export const maxLessons = 6

export type Prerequisite = { area: Area; concept: string; evidenceQuote: string; whyAssumed: string; buildsOn: string[] }
export type Lesson = {
  area: Area
  concept: string
  title: string
  hook: string
  definition: string
  intuition: string
  example: string
  inThisPaper: string
  buildsOn: string[]
  diagram?: string
  excalidrawElements?: ExcalidrawElementSkeleton[]
  illustration?: string
  visualSteps?: VisualStep[]
}
export type ConceptCard = { area: Area; term: string; plainEnglish: string; whyItMatters: string }
export type Guide = {
  id: string
  title: string
  url?: string
  summary: string
  mode: 'ai' | 'basic'
  overview: string
  lessons: Lesson[]
  concepts: ConceptCard[]
  nextSteps: string[]
}
