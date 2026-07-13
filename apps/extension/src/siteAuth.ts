// Bridges extension Firebase session to the Simply website via postMessage.
// Runs only on Simply web origins (see manifest content_scripts).

import { AUTH_STORAGE_KEY, getIdToken } from './auth.js'

const MESSAGE_TYPE = 'SIMPLY_EXTENSION_AUTH'

async function publishSession(): Promise<void> {
  try {
    const idToken = await getIdToken()
    window.postMessage({ type: MESSAGE_TYPE, idToken }, window.location.origin)
  } catch {
    // Not signed in via extension — nothing to bridge.
  }
}

void publishSession()

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[AUTH_STORAGE_KEY]) {
    void publishSession()
  }
})
