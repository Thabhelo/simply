import { signInWithCustomToken } from 'firebase/auth'
import { auth } from './firebase'

const MESSAGE_TYPE = 'SIMPLY_EXTENSION_AUTH'

let bridgeAttempted = false

/** Signs the web app in when the Simply extension already has a Firebase session. */
export function bridgeExtensionAuth(apiBase: string): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return
    if (event.data?.type !== MESSAGE_TYPE || typeof event.data.idToken !== 'string') return
    if (auth.currentUser || bridgeAttempted) return

    bridgeAttempted = true
    void (async () => {
      try {
        const response = await fetch(`${apiBase}/api/auth/custom-token`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${event.data.idToken}` },
        })
        if (!response.ok) {
          bridgeAttempted = false
          return
        }
        const { customToken } = (await response.json()) as { customToken?: string }
        if (!customToken) {
          bridgeAttempted = false
          return
        }
        await signInWithCustomToken(auth, customToken)
      } catch {
        bridgeAttempted = false
      }
    })()
  })
}
