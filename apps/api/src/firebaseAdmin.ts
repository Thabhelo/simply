import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import './load-env.js'

function loadServiceAccount(): Record<string, unknown> | null {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64
  if (base64) {
    try {
      return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
    } catch {
      console.warn('Simply: FIREBASE_SERVICE_ACCOUNT_B64 is not valid base64 JSON. Ignoring.')
      return null
    }
  }

  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inline) {
    try {
      return JSON.parse(inline)
    } catch {
      console.warn('Simply: FIREBASE_SERVICE_ACCOUNT is not valid JSON. Ignoring.')
      return null
    }
  }

  const rawPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!rawPath) {
    return null
  }

  const path = rawPath.startsWith('~/') ? resolve(homedir(), rawPath.slice(2)) : resolve(rawPath)

  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8'))
  } catch {
    console.warn(`Simply: could not read Firebase service account at ${path}. Ignoring.`)
    return null
  }
}

const serviceAccount = loadServiceAccount()

export const firebaseConfigured = Boolean(serviceAccount)

if (firebaseConfigured && getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]) })
}
