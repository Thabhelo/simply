import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth, googleProvider } from './firebase'

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider)
  return result.user
}

export async function signOutUser(): Promise<void> {
  await signOut(auth)
}

export function watchAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback)
}

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Sign in required.')
  }
  const idToken = await user.getIdToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${idToken}`)
  return fetch(input, { ...init, headers })
}

export function userInitial(user: User | null): string {
  if (!user) return '?'
  const fromName = user.displayName?.trim()?.[0]
  if (fromName) return fromName.toUpperCase()
  const fromEmail = user.email?.trim()?.[0]
  return fromEmail ? fromEmail.toUpperCase() : '?'
}
