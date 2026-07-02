# Landing app auth — contract for the frontend

The API now requires a Firebase **ID token** on the protected routes (`POST /api/analyze`,
`POST /api/ingest`, `POST /api/report.pdf`). Send it as `Authorization: Bearer <idToken>`.
`GET /api/guide/:id` and `GET /health` stay open.

This is the landing app's lane (Thabhelo). Reference wiring below — adapt to the app's
component structure.

## 1. Install + init (Firebase Web SDK)

```bash
npm install firebase   # in the root landing app
```

```ts
// src/firebase.ts
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyD8fCQa0V3imk-ttnIlf1pIAit0IaBkSNc',
  authDomain: 'simply-def0f.firebaseapp.com',
  projectId: 'simply-def0f',
  storageBucket: 'simply-def0f.firebasestorage.app',
  messagingSenderId: '769969379454',
  appId: '1:769969379454:web:0af599bafbbc9db36ee02f',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
```

## 2. Sign in / out

```ts
import { signInWithPopup, signOut } from 'firebase/auth'
import { auth, googleProvider } from './firebase'

await signInWithPopup(auth, googleProvider) // opens Google account chooser
await signOut(auth)
```

## 3. Attach the token to API calls

```ts
import { auth } from './firebase'

export async function authedFetch(input: string, init: RequestInit = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in required.')
  const idToken = await user.getIdToken() // auto-refreshes when near expiry
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${idToken}`)
  return fetch(input, { ...init, headers })
}
```

Use `onAuthStateChanged(auth, cb)` to drive the signed-in UI. A 401 from the API means the
token is missing/expired — prompt the user to sign in again.

## Notes
- The web `apiKey` is not a secret; it identifies the project and is safe in client code.
- Enable **Google** as a sign-in provider in the Firebase console (Authentication →
  Sign-in method) and add the landing app's domain to Authorized domains.
- The extension uses a REST-based equivalent of this flow (no Firebase Web SDK) — see
  `apps/extension/src/auth.ts`.
