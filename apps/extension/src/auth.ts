// Extension auth: Firebase sign-in without the Firebase Web SDK.
//
// Flow: chrome.identity.launchWebAuthFlow gets a Google OpenID id_token, which we exchange
// for a Firebase session via the Identity Toolkit REST endpoint (the REST equivalent of
// signInWithCredential). The Firebase { idToken, refreshToken } is cached in
// chrome.storage.local; authedFetch attaches the ID token and refreshes it via the
// secure-token endpoint when it is close to expiry. Both the popup and the in-page content
// widget import this module, so the session is shared across surfaces via storage.

// Public Firebase web API key. Safe to ship in client code (it identifies the project,
// it is not a secret). Matches src/firebase.ts project simply-def0f-e4e3f.
const FIREBASE_API_KEY = 'AIzaSyCyTAL65fgRCiXUHay-Crx4WzbfIYS36KI'

// OAuth 2.0 Web client ID for project simply-def0f-e4e3f. After enabling Google sign-in in
// Firebase Console, copy the "Web client" ID from GCP → APIs & Services → Credentials and
// add your extension redirect URI (https://<extension-id>.chromiumapp.org/).
const OAUTH_CLIENT_ID = '448198565907-0nokihgt4021fl9knk7qlq6v9k30lj7v.apps.googleusercontent.com'

export const AUTH_STORAGE_KEY = 'simply-auth'
const STORAGE_KEY = AUTH_STORAGE_KEY
export const LAST_ERROR_KEY = 'simply-last-error' // last sign-in error, shown by the popup
const REFRESH_SKEW_MS = 60_000 // refresh a minute before the token actually expires

export type SessionProfile = {
  email?: string
  displayName?: string
  photoURL?: string
  uid?: string
}

export class NotSignedInError extends Error {
  constructor() {
    super('Sign in to Simply to analyze papers.')
    this.name = 'NotSignedInError'
  }
}

type Session = SessionProfile & {
  idToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1]
    if (!payload) return {}
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function readSession(): Promise<Session | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  return (stored[STORAGE_KEY] as Session | undefined) ?? null
}

async function writeSession(session: Session): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: session })
}

export async function signOut(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}

// Returns stored profile fields. Prefer ensureValidSession() for UI — it confirms the token still works.
export async function getSession(): Promise<SessionProfile | null> {
  const session = await readSession()
  if (!session) return null
  return {
    email: session.email,
    displayName: session.displayName,
    photoURL: session.photoURL,
    uid: session.uid,
  }
}

/** Validates the cached session; clears storage and returns null when tokens are dead. */
export async function ensureValidSession(): Promise<SessionProfile | null> {
  try {
    await getIdToken()
    return await getSession()
  } catch {
    await signOut()
    return null
  }
}

// Interactive Google sign-in. Opens the Google account chooser, then exchanges the result
// for a Firebase session. Resolves with the signed-in email.
export async function signIn(): Promise<string | undefined> {
  if (!OAUTH_CLIENT_ID) {
    throw new Error('Extension OAuth client ID is not configured. Set VITE_OAUTH_CLIENT_ID at build time.')
  }
  const redirectUri = chrome.identity.getRedirectURL()
  const nonce = crypto.randomUUID()
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${encodeURIComponent(OAUTH_CLIENT_ID)}` +
    '&response_type=id_token' +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    '&scope=' +
    encodeURIComponent('openid email profile') +
    `&nonce=${encodeURIComponent(nonce)}` +
    '&prompt=select_account'

  const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true })
  if (!responseUrl) {
    throw new Error('Sign-in was cancelled.')
  }

  const fragment = new URL(responseUrl).hash.slice(1)
  const googleIdToken = new URLSearchParams(fragment).get('id_token')
  if (!googleIdToken) {
    throw new Error('Google did not return an identity token.')
  }

  const googleClaims = decodeJwtPayload(googleIdToken)
  const session = await exchangeGoogleToken(googleIdToken, redirectUri, nonce, googleClaims)
  await writeSession(session)
  return session.email
}

async function exchangeGoogleToken(
  googleIdToken: string,
  requestUri: string,
  nonce: string,
  googleClaims: Record<string, unknown>,
): Promise<Session> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `id_token=${googleIdToken}&providerId=google.com&nonce=${encodeURIComponent(nonce)}`,
        requestUri,
        returnSecureToken: true,
        returnIdpCredential: true,
      }),
    },
  )

  const data = (await response.json()) as {
    idToken?: string
    refreshToken?: string
    expiresIn?: string
    email?: string
    localId?: string
    photoUrl?: string
    displayName?: string
    error?: { message?: string }
  }

  if (!response.ok || !data.idToken || !data.refreshToken || !data.expiresIn) {
    const detail = data.error?.message ?? `HTTP ${response.status}`
    console.error('[Simply] signInWithIdp failed:', detail, data)
    throw new Error(`Firebase sign-in failed: ${detail}`)
  }

  const claimPicture = typeof googleClaims.picture === 'string' ? googleClaims.picture : undefined
  const claimName = typeof googleClaims.name === 'string' ? googleClaims.name : undefined
  const claimEmail = typeof googleClaims.email === 'string' ? googleClaims.email : undefined

  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn) * 1000,
    email: data.email ?? claimEmail,
    uid: data.localId,
    photoURL: data.photoUrl ?? claimPicture,
    displayName: data.displayName ?? claimName,
  }
}

// Exchanges the stored refresh token for a fresh ID token (secure-token endpoint).
async function refreshSession(session: Session): Promise<Session> {
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`,
  })

  if (!response.ok) {
    await signOut()
    throw new NotSignedInError() // refresh token revoked or expired. Force re-login.
  }

  const data = (await response.json()) as {
    id_token: string
    refresh_token: string
    expires_in: string
  }

  const refreshed: Session = {
    ...session,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in) * 1000,
  }
  await writeSession(refreshed)
  return refreshed
}

// Returns a valid Firebase ID token, refreshing if needed. Throws NotSignedInError if there
// is no session so callers can prompt the user to sign in.
export async function getIdToken(): Promise<string> {
  let session = await readSession()
  if (!session) {
    throw new NotSignedInError()
  }
  if (Date.now() >= session.expiresAt - REFRESH_SKEW_MS) {
    session = await refreshSession(session)
  }
  return session.idToken
}

// fetch() wrapper that attaches the Firebase ID token. Use for all protected API calls.
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const idToken = await getIdToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${idToken}`)
  return fetch(input, { ...init, headers })
}
