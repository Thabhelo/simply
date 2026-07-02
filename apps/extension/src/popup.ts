import './style.css'
import { authedFetch, getSession, LAST_ERROR_KEY, NotSignedInError } from './auth.js'

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

const apiBase = 'http://localhost:8787'
const analyzeButton = document.querySelector<HTMLButtonElement>('#analyze')
const downloadButton = document.querySelector<HTMLButtonElement>('#download')
const statusEl = document.querySelector<HTMLElement>('#status')
const resultsEl = document.querySelector<HTMLElement>('#results')
const signInButton = document.querySelector<HTMLButtonElement>('#signin')
const signOutButton = document.querySelector<HTMLButtonElement>('#signout')
const authStatusEl = document.querySelector<HTMLElement>('#auth-status')

let latestPayload: PaperPayload | null = null

function setStatus(message: string) {
  if (statusEl) {
    statusEl.textContent = message
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab & { id: number }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab?.id) {
    throw new Error('No active tab found.')
  }

  return { ...tab, id: tab.id }
}

async function collectPaper(): Promise<PaperPayload> {
  const tab = await getActiveTab()

  try {
    const response = (await chrome.tabs.sendMessage(tab.id, {
      type: 'SIMPLY_COLLECT_PAPER',
    })) as PaperPayload | undefined

    if (response?.text) {
      return response
    }
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      })
    } catch {
      if (tab.url) {
        return {
          title: tab.title || 'Untitled research paper',
          url: tab.url,
        }
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
  const badge = analysis.mode === 'basic' ? '<span class="mode-badge">Basic mode</span>' : ''
  resultsEl.innerHTML = `
    <div class="result-head"><h2>${escapeHtml(analysis.title)}</h2>${badge}</div>
    <p>${escapeHtml(analysis.summary)}</p>
    <div class="lessons">
      ${lessons
        .map(
          (l) => `
            <article class="lesson">
              <span>${escapeHtml(l.area)}</span>
              <h3>${escapeHtml(l.title)}</h3>
              <p>${escapeHtml(l.intuition)}</p>
              ${l.definition ? `<code class="formula">${escapeHtml(l.definition)}</code>` : ''}
              ${l.example ? `<p class="example">${escapeHtml(l.example)}</p>` : ''}
              <small>${escapeHtml(l.inThisPaper)}</small>
            </article>`,
        )
        .join('')}
    </div>`
}

async function analyzeCurrentPage() {
  setStatus('Reading the page...')
  latestPayload = await collectPaper()
  setStatus('Asking the local API...')

  const response = await authedFetch(`${apiBase}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(latestPayload),
  })

  if (!response.ok) {
    throw new Error('The local API rejected the paper payload.')
  }

  const analysis = (await response.json()) as AnalysisResponse
  renderAnalysis(analysis)
  setStatus('Guide preview ready.')
}

async function downloadGuide() {
  if (!latestPayload) {
    latestPayload = await collectPaper()
  }

  setStatus('Generating PDF...')
  const response = await authedFetch(`${apiBase}/api/report.pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(latestPayload),
  })

  if (!response.ok) {
    throw new Error('Could not generate the PDF guide.')
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  chrome.tabs.create({ url })
  setStatus('PDF opened in a new tab.')
}

function reportError(error: unknown) {
  if (error instanceof NotSignedInError) {
    setStatus(error.message)
    return
  }
  setStatus(error instanceof Error ? error.message : 'Something went wrong.')
}

async function refreshAuthUi() {
  const session = await getSession()
  const signedIn = Boolean(session)
  if (authStatusEl) {
    authStatusEl.textContent = signedIn
      ? session?.email
        ? `Signed in as ${session.email}`
        : 'Signed in'
      : 'Not signed in'
  }
  if (signInButton) signInButton.hidden = signedIn
  if (signOutButton) signOutButton.hidden = !signedIn

  // Surface the last sign-in error (persisted) so it isn't lost when the popup closes.
  if (!signedIn) {
    const stored = await chrome.storage.local.get(LAST_ERROR_KEY)
    const lastError = stored[LAST_ERROR_KEY] as string | undefined
    if (lastError) setStatus(lastError)
  }
}


analyzeButton?.addEventListener('click', () => {
  analyzeCurrentPage().catch(reportError)
})

downloadButton?.addEventListener('click', () => {
  downloadGuide().catch(reportError)
})

signInButton?.addEventListener('click', () => {
  // Sign-in runs in the background worker (the popup closes when the Google window opens).
  // The response may not arrive if this popup is torn down first — the worker persists the
  // result to storage regardless, so reopening the popup reflects it.
  setStatus('Opening Google sign-in...')
  chrome.runtime.sendMessage({ type: 'SIMPLY_SIGN_IN' }, async (response) => {
    if (chrome.runtime.lastError) return // popup likely closed; worker still completes
    if (response?.ok) {
      await refreshAuthUi()
      setStatus(response.email ? `Signed in as ${response.email}.` : 'Signed in.')
    } else if (response?.error) {
      setStatus(response.error)
    }
  })
})

signOutButton?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SIMPLY_SIGN_OUT' }, async () => {
    await refreshAuthUi()
    setStatus('Signed out.')
  })
})

void refreshAuthUi()
