// Background service worker. Sign-in MUST run here, not in the popup: launchWebAuthFlow
// opens a Google window that closes the popup, destroying its JS context mid-flow. The
// service worker survives, so it runs the whole flow (launchWebAuthFlow → token exchange →
// writeSession) and persists the session to chrome.storage.local, shared with all surfaces.
import { LAST_ERROR_KEY, signIn, signOut } from './auth.js'

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SIMPLY_SIGN_IN') {
    signIn()
      .then(async (email) => {
        await chrome.storage.local.remove(LAST_ERROR_KEY)
        sendResponse({ ok: true, email })
      })
      .catch(async (error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Sign-in failed.'
        // Persist the error so the popup can show it after it reopens (it closes mid-flow).
        await chrome.storage.local.set({ [LAST_ERROR_KEY]: errorMessage })
        sendResponse({ ok: false, error: errorMessage })
      })
    return true // keep the message channel open for the async response
  }

  if (message?.type === 'SIMPLY_SIGN_OUT') {
    signOut().then(() => sendResponse({ ok: true }))
    return true
  }

  return false
})
