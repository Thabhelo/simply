import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { firebaseConfigured } from './firebaseAdmin.js'
import type { Guide } from './types.js'

const COLLECTION = 'guides'
const maxMemoryEntries = 200

const memory = new Map<string, Guide>()

function evictMemoryIfNeeded(skipId: string) {
  if (memory.size < maxMemoryEntries) return
  let victim: string | undefined
  for (const [key, guide] of memory) {
    if (key === skipId) continue
    if (guide.mode === 'basic') {
      victim = key
      break
    }
    if (victim === undefined) victim = key
  }
  if (victim !== undefined) memory.delete(victim)
}

function firestore() {
  if (!firebaseConfigured) return null
  return getFirestore()
}

export async function getGuide(id: string): Promise<Guide | null> {
  const cached = memory.get(id)
  if (cached) return cached

  const db = firestore()
  if (!db) return null

  try {
    const snap = await db.collection(COLLECTION).doc(id).get()
    if (!snap.exists) return null
    const guide = snap.data()?.guide as Guide | undefined
    if (!guide?.id) return null
    memory.set(id, guide)
    return guide
  } catch (error) {
    console.error('Simply: Firestore getGuide failed:', error)
    return null
  }
}

export async function getCachedAiGuide(id: string): Promise<Guide | null> {
  const guide = await getGuide(id)
  return guide?.mode === 'ai' ? guide : null
}

export async function saveGuide(guide: Guide): Promise<void> {
  evictMemoryIfNeeded(guide.id)
  memory.set(guide.id, guide)

  const db = firestore()
  if (!db) return

  try {
    await db.collection(COLLECTION).doc(guide.id).set({
      guide,
      mode: guide.mode,
      title: guide.title,
      url: guide.url ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    })
  } catch (error) {
    console.error('Simply: Firestore saveGuide failed:', error)
  }
}

export function guideStoreMode(): 'firestore' | 'memory' {
  return firebaseConfigured ? 'firestore' : 'memory'
}
