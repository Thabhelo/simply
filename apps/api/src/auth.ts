import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import type { NextFunction, Request, Response } from 'express'

// Request augmented with the verified caller identity. Handlers read req.uid.
export interface AuthedRequest extends Request {
  uid?: string
  email?: string
}

// A verifier reduces a raw ID token to just the identity we care about. Injected so the
// middleware is unit-testable without initializing Firebase.
type VerifyIdToken = (token: string) => Promise<{ uid: string; email?: string }>

// Builds the auth middleware. When disabled (no Firebase credentials configured) it is a
// pass-through so local dev works without a project — mirroring the GEMINI_API_KEY basic
// mode. When enabled it requires a valid `Authorization: Bearer <idToken>`.
export function createRequireAuth(opts: { enabled: boolean; verifyIdToken: VerifyIdToken }) {
  return async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
    if (!opts.enabled) {
      next()
      return
    }

    const match = /^Bearer (.+)$/.exec(req.header('authorization') ?? '')

    if (!match) {
      res.status(401).json({ error: 'Sign in required.' })
      return
    }

    try {
      const { uid, email } = await opts.verifyIdToken(match[1])
      req.uid = uid
      req.email = email
      next()
    } catch {
      res.status(401).json({ error: 'Invalid or expired session.' })
    }
  }
}

// Loads a service account from FIREBASE_SERVICE_ACCOUNT (inline JSON) or a file path in
// FIREBASE_SERVICE_ACCOUNT_PATH / GOOGLE_APPLICATION_CREDENTIALS. Returns null if none is
// configured or it can't be parsed — the caller then runs in dev open mode.
function loadServiceAccount(): Record<string, unknown> | null {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inline) {
    try {
      return JSON.parse(inline)
    } catch {
      console.warn('Simply: FIREBASE_SERVICE_ACCOUNT is not valid JSON — ignoring.')
      return null
    }
  }

  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!path) {
    return null
  }

  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8'))
  } catch {
    console.warn(`Simply: could not read Firebase service account at ${path} — ignoring.`)
    return null
  }
}

const serviceAccount = loadServiceAccount()

// Dev escape hatch: AUTH_REQUIRED=false forces open mode even with creds present, so local
// work isn't blocked while extension sign-in is still being set up.
const authForcedOff = process.env.AUTH_REQUIRED === 'false'

export const authEnabled = Boolean(serviceAccount) && !authForcedOff

if (authEnabled && getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]) })
}

console.log(
  authEnabled
    ? 'Simply: auth enabled (Firebase ID token verification)'
    : authForcedOff
      ? 'Simply: auth DISABLED via AUTH_REQUIRED=false (dev open mode)'
      : 'Simply: no Firebase credentials — auth DISABLED (dev open mode)',
)

// The real middleware wired to firebase-admin. Verification runs only when authEnabled,
// so getAuth() is never called in dev open mode.
export const requireAuth = createRequireAuth({
  enabled: authEnabled,
  verifyIdToken: async (token) => {
    const decoded = await getAuth().verifyIdToken(token)
    return { uid: decoded.uid, email: decoded.email }
  },
})
