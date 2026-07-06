import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { signInWithGoogle, signOutUser, userInitial, watchAuth } from './auth'

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => watchAuth(setUser), [])

  async function handleSignIn() {
    setBusy(true)
    try {
      await signInWithGoogle()
    } finally {
      setBusy(false)
    }
  }

  async function handleSignOut() {
    setBusy(true)
    try {
      await signOutUser()
    } finally {
      setBusy(false)
    }
  }

  if (user) {
    return (
      <div className="auth-chip">
        <span className="auth-avatar" title={user.email ?? 'Signed in'} aria-hidden="true">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
          ) : (
            userInitial(user)
          )}
        </span>
        <button type="button" className="auth-signout" disabled={busy} onClick={() => void handleSignOut()}>
          Sign out
        </button>
      </div>
    )
  }

  return (
    <button type="button" className="nav-button auth-signin" disabled={busy} onClick={() => void handleSignIn()}>
      Sign in
    </button>
  )
}
