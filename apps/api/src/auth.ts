import { getAuth } from 'firebase-admin/auth'
import type { NextFunction, Request, Response } from 'express'
import { firebaseConfigured } from './firebaseAdmin.js'

// Request augmented with the verified caller identity. Handlers read req.uid.
export interface AuthedRequest extends Request {
  uid?: string
  email?: string
}

// A verifier reduces a raw ID token to just the identity we care about. Injected so the
// middleware is unit-testable without initializing Firebase.
type VerifyIdToken = (token: string) => Promise<{ uid: string; email?: string }>

// Builds the auth middleware. When disabled (no Firebase credentials configured) it is a
// pass-through so local dev works without a project, mirroring the GEMINI_API_KEY basic
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

// Dev escape hatch: AUTH_REQUIRED=false forces open mode even with creds present, so local
// work isn't blocked while extension sign-in is still being set up.
const authForcedOff = process.env.AUTH_REQUIRED === 'false'

export const authEnabled = firebaseConfigured && !authForcedOff

console.log(
  authEnabled
    ? 'Simply: auth enabled (Firebase ID token verification)'
    : authForcedOff
      ? 'Simply: auth DISABLED via AUTH_REQUIRED=false (dev open mode)'
      : 'Simply: no Firebase credentials. Auth DISABLED (dev open mode).',
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
