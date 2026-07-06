export type PaperHistoryEntry = {
  id: string
  title: string
  url?: string
  lessonCount: number
  openedAt: string
  imageQuery?: string
}

const STORAGE_PREFIX = 'simply-papers-'

function storageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`
}

export function loadPaperHistory(uid: string): PaperHistoryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(uid))
    if (!raw) return []
    const parsed = JSON.parse(raw) as PaperHistoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function recordPaperVisit(uid: string, entry: Omit<PaperHistoryEntry, 'openedAt'>): PaperHistoryEntry[] {
  const openedAt = new Date().toISOString()
  const next: PaperHistoryEntry = { ...entry, openedAt }
  const existing = loadPaperHistory(uid).filter((item) => item.id !== entry.id)
  const merged = [next, ...existing].slice(0, 40)
  localStorage.setItem(storageKey(uid), JSON.stringify(merged))
  return merged
}

export function imageQueryForPaper(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('attention') || lower.includes('transformer')) return 'neural network abstract'
  if (lower.includes('vision') || lower.includes('image')) return 'computer vision research'
  if (lower.includes('language') || lower.includes('nlp')) return 'language technology workspace'
  if (lower.includes('reinforcement') || lower.includes('robot')) return 'robotics laboratory'
  return 'research paper study desk'
}
