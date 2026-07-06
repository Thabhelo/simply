import './style.css'
import {
  AUTH_STORAGE_KEY,
  authedFetch,
  ensureValidSession,
  LAST_ERROR_KEY,
  NotSignedInError,
  type SessionProfile,
} from './auth.js'
import { apiBase, webBase } from './config.js'

type PaperPayload = {
  title: string
  url: string
  text?: string
}

type Lesson = {
  area: string
  concept: string
  title: string
  hook: string
  definition: string
  intuition: string
  example: string
  inThisPaper: string
  buildsOn: string[]
}

type AnalysisResponse = {
  id?: string
  title: string
  overview?: string
  summary: string
  mode?: 'ai' | 'basic'
  lessons?: Lesson[]
  concepts: { area: string; term: string; whyItMatters: string; plainEnglish: string }[]
  nextSteps: string[]
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const analyzeButton = document.querySelector<HTMLButtonElement>('#analyze')
const statusEl = document.querySelector<HTMLElement>('#status')
const resultsEl = document.querySelector<HTMLElement>('#results')
const authSlot = document.querySelector<HTMLElement>('#auth-slot')
const signInButton = document.querySelector<HTMLButtonElement>('#signin')
const signOutButton = document.querySelector<HTMLButtonElement>('#signout')
const avatarEl = document.querySelector<HTMLElement>('#avatar')
const authLabelEl = document.querySelector<HTMLElement>('#auth-label')
const authHintEl = document.querySelector<HTMLElement>('#auth-hint')

let signedIn = false

function setStatus(message: string) {
  if (statusEl) statusEl.textContent = message
}

function avatarInitial(profile: SessionProfile): string {
  const fromName = profile.displayName?.trim()?.[0]
  if (fromName) return fromName.toUpperCase()
  const fromEmail = profile.email?.trim()?.[0]
  return fromEmail ? fromEmail.toUpperCase() : '?'
}

function displayLabel(profile: SessionProfile): string {
  const name = profile.displayName?.trim()
  if (name) return name
  const email = profile.email?.trim()
  if (email) return email.split('@')[0] ?? email
  return 'Signed in'
}

function renderAvatar(profile: SessionProfile) {
  if (!avatarEl) return
  avatarEl.replaceChildren()
  if (profile.photoURL) {
    const img = document.createElement('img')
    img.src = profile.photoURL
    img.alt = ''
    img.referrerPolicy = 'no-referrer'
    img.addEventListener('error', () => {
      avatarEl.textContent = avatarInitial(profile)
    })
    avatarEl.append(img)
    return
  }
  avatarEl.textContent = avatarInitial(profile)
}

function setAuthState(state: 'loading' | 'signed-out' | 'signed-in', profile?: SessionProfile) {
  signedIn = state === 'signed-in'
  if (authSlot) authSlot.dataset.state = state

  if (signInButton) signInButton.disabled = state === 'loading'
  if (analyzeButton) analyzeButton.disabled = !signedIn
  if (authHintEl) authHintEl.hidden = signedIn

  if (state === 'signed-in' && profile) {
    renderAvatar(profile)
    if (authLabelEl) {
      authLabelEl.textContent = displayLabel(profile)
      authLabelEl.title = profile.email ?? profile.displayName ?? 'Signed in'
    }
    if (signOutButton) signOutButton.title = profile.email ?? 'Sign out'
  } else if (avatarEl) {
    avatarEl.replaceChildren()
    if (authLabelEl) authLabelEl.textContent = ''
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab & { id: number }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab found.')
  return { ...tab, id: tab.id }
}

async function collectPaper(): Promise<PaperPayload> {
  const tab = await getActiveTab()

  try {
    const response = (await chrome.tabs.sendMessage(tab.id, {
      type: 'SIMPLY_COLLECT_PAPER',
    })) as PaperPayload | undefined

    if (response?.text) return response
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      })
    } catch {
      if (tab.url) {
        return { title: tab.title || 'Untitled research paper', url: tab.url }
      }
    }
  }

  const response = (await chrome.tabs.sendMessage(tab.id, {
    type: 'SIMPLY_COLLECT_PAPER',
  })) as PaperPayload | undefined

  const url = response?.url || tab.url
  if (!url) {
    throw new Error('Could not read this page. Try opening an arXiv paper or selecting text first.')
  }

  return {
    title: response?.title || tab.title || 'Untitled research paper',
    url,
    text: response?.text,
  }
}

function renderAnalysis(analysis: AnalysisResponse) {
  if (!resultsEl) return
  const lessons = analysis.lessons ?? []
  resultsEl.innerHTML = `
    <div class="result-head"><h2>${escapeHtml(analysis.title)}</h2></div>
    <div class="lessons">
      ${lessons
        .slice(0, 3)
        .map(
          (l, i) => `
            <article class="guide-row">
              <span>Topic ${String(i + 1).padStart(2, '0')}</span>
              <h3>${escapeHtml(l.title)}</h3>
              <p>${escapeHtml(l.intuition)}</p>
            </article>`,
        )
        .join('')}
    </div>`
}

async function analyzeCurrentPage() {
  setStatus('Reading the page...')
  const latestPayload = await collectPaper()
  setStatus('Building guide...')

  const response = await authedFetch(`${apiBase}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(latestPayload),
  })

  if (!response.ok) throw new Error('The local API rejected the paper payload.')

  const analysis = (await response.json()) as AnalysisResponse
  renderAnalysis(analysis)
  if (analysis.id && (analysis.lessons?.length ?? 0) > 0) {
    window.open(`${webBase}/guide?id=${encodeURIComponent(analysis.id)}`, '_blank', 'noopener')
    setStatus('Guide opened in a new tab.')
    return
  }
  setStatus('Guide preview ready.')
}

function reportError(error: unknown) {
  if (error instanceof NotSignedInError) {
    void refreshAuthUi()
    setStatus('Your session expired. Sign in again.')
    return
  }
  setStatus(error instanceof Error ? error.message : 'Something went wrong.')
}

async function refreshAuthUi() {
  setAuthState('loading')
  const profile = await ensureValidSession()
  if (profile) {
    setAuthState('signed-in', profile)
    return
  }

  setAuthState('signed-out')
  const stored = await chrome.storage.local.get(LAST_ERROR_KEY)
  const lastError = stored[LAST_ERROR_KEY] as string | undefined
  if (lastError) setStatus(lastError)
}

async function runAnalyzeWithAuth() {
  if (!signedIn) {
    setStatus('Sign in with Google first.')
    return
  }

  try {
    await analyzeCurrentPage()
  } catch (error) {
    if (error instanceof NotSignedInError) {
      await refreshAuthUi()
      setStatus('Your session expired. Sign in again.')
      return
    }
    reportError(error)
  }
}

analyzeButton?.addEventListener('click', () => {
  void runAnalyzeWithAuth()
})

signInButton?.addEventListener('click', () => {
  if (signInButton.disabled) return
  signInButton.disabled = true
  setStatus('Choose your Google account in the window that opens…')
  chrome.runtime.sendMessage({ type: 'SIMPLY_SIGN_IN' }, async (response) => {
    if (chrome.runtime.lastError) {
      signInButton.disabled = false
      setStatus('Sign-in interrupted. Try again.')
      return
    }
    if (response?.ok) {
      await refreshAuthUi()
      setStatus('Signed in. You can analyze this paper now.')
    } else if (response?.error) {
      signInButton.disabled = false
      setStatus(response.error)
    }
  })
})

signOutButton?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SIMPLY_SIGN_OUT' }, async () => {
    await refreshAuthUi()
    if (resultsEl) resultsEl.innerHTML = ''
    setStatus('Signed out.')
  })
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (changes[AUTH_STORAGE_KEY] || changes[LAST_ERROR_KEY]) {
    void refreshAuthUi()
  }
})

void refreshAuthUi()
