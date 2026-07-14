import {
  AUTH_STORAGE_KEY,
  authedFetch,
  ensureValidSession,
  LAST_ERROR_KEY,
  NotSignedInError,
  type SessionProfile,
} from './auth.js'
import { apiBase, webBase } from './config.js'
import { authHeaderHtml, panelCardHtml } from './panelTemplate.js'
import simplyUiCss from '../../../shared/simply-ui.css?inline'
import contentWidgetCss from '../../../shared/simply-content-widget.css?inline'
import extensionAuthCss from '../../../shared/simply-extension-auth.css?inline'

/** Shadow trees don't inherit page CSS; remap :root tokens and drop page-level body rules. */
function cssForShadow(raw: string): string {
  return raw.replace(/:root\s*\{/g, ':host {').replace(/body\s*\{[^}]*\}/g, '')
}

const shadowUiCss = cssForShadow(simplyUiCss)

const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500&family=Inter+Tight:wght@400;500;600&display=swap'

type PaperPayload = {
  title: string
  url: string
  text?: string
}

type AnalysisResponse = {
  id?: string
  title: string
  overview?: string
  concepts: Array<{ term: string; area: string }>
  mode?: 'ai' | 'basic'
  lessons?: Array<{
    area: string
    concept: string
    title: string
    hook: string
    definition: string
    intuition: string
    example: string
    inThisPaper: string
    buildsOn: string[]
  }>
  ingestion?: { source: string; textLength: number }
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const widgetId = 'simply-research-widget'
const collapsedKey = 'simply-widget-collapsed'

function getMeta(name: string) {
  return document.querySelector<HTMLMetaElement>(
    `meta[name="${name}"], meta[property="${name}"]`,
  )?.content
}

function isKnownResearchHost(hostname: string) {
  return [
    'arxiv.org',
    'openreview.net',
    'biorxiv.org',
    'medrxiv.org',
    'ssrn.com',
    'aclanthology.org',
    'proceedings.mlr.press',
    'papers.nips.cc',
    'neurips.cc',
    'ieee.org',
    'springer.com',
    'sciencedirect.com',
    'nature.com',
    'science.org',
    'frontiersin.org',
    'plos.org',
  ].some((host) => hostname.endsWith(host))
}

function looksLikeResearchPaper() {
  const hostname = window.location.hostname.toLowerCase()
  const pathname = window.location.pathname.toLowerCase()
  const bodyText = document.body.innerText.toLowerCase()
  const hasCitationMeta =
    Boolean(getMeta('citation_title')) ||
    Boolean(getMeta('citation_pdf_url')) ||
    Boolean(getMeta('dc.title'))
  const hasPaperStructure =
    /\babstract\b/.test(bodyText) &&
    /\b(introduction|references|method|methods|results|conclusion)\b/.test(bodyText)

  return (
    isKnownResearchHost(hostname) ||
    pathname.endsWith('.pdf') ||
    /^\/pdf\//.test(pathname) ||
    hasCitationMeta ||
    /\bdoi:\s*10\.\d{4,9}\//i.test(document.body.innerText) ||
    hasPaperStructure
  )
}

function getPaperText(): PaperPayload {
  const selection = window.getSelection()?.toString().trim()
  const pageText = document.body.innerText.trim()
  const text = selection || pageText

  return {
    title:
      getMeta('citation_title') ||
      getMeta('dc.title') ||
      document.title.replace(/\s+-\s+Google Chrome$/, '') ||
      'Untitled research paper',
    url: window.location.href,
    text: text ? text.slice(0, 80_000) : undefined,
  }
}

function renderLessonTeaser(lessons: AnalysisResponse['lessons']) {
  return (lessons ?? [])
    .slice(0, 3)
    .map(
      (l, i) =>
        `<article class="guide-row">
          <span>Topic ${String(i + 1).padStart(2, '0')}</span>
          <h3>${escapeHtml(l.title)}</h3>
          <p>${escapeHtml(l.hook || l.intuition)}</p>
        </article>`,
    )
    .join('')
}

function signInViaBackground(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'SIMPLY_SIGN_IN' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: 'Sign-in interrupted.' })
        return
      }
      resolve(response ?? { ok: false, error: 'Sign-in failed.' })
    })
  })
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

type SimplyWindow = Window & { __simplyWidgetMounting?: boolean }

function mountWidget() {
  const win = window as SimplyWindow
  if (win.__simplyWidgetMounting || document.getElementById(widgetId) || !looksLikeResearchPaper()) {
    return
  }
  win.__simplyWidgetMounting = true

  const host = document.createElement('div')
  host.id = widgetId
  const shadow = host.attachShadow({ mode: 'open' })
  let collapsed = sessionStorage.getItem(collapsedKey) !== '0'
  let lastGuideId: string | null = null
  let signedIn = false

  shadow.innerHTML = `
    <link rel="stylesheet" href="${FONT_LINK}" />
    <style>
      :host {
        color-scheme: light;
        display: block;
        height: 0;
        overflow: visible;
        pointer-events: none;
        position: fixed;
        right: 0;
        top: 0;
        width: 0;
        z-index: 2147483647;
      }

      ${shadowUiCss}
      ${contentWidgetCss}
      ${extensionAuthCss}
    </style>
    <button class="simply-tab hidden" id="simply-tab" type="button" aria-label="Open Simply">simply</button>
    <section class="simply-panel" aria-label="Simply">
      <div class="simply-panel-top">
        ${authHeaderHtml()}
        <button class="simply-close" id="simply-close" type="button" aria-label="Close">×</button>
      </div>
      ${panelCardHtml('Analyze this paper')}
    </section>
  `

  document.documentElement.append(host)

  const panel = shadow.querySelector<HTMLElement>('.simply-panel')
  const tab = shadow.querySelector<HTMLButtonElement>('#simply-tab')
  const closeButton = shadow.querySelector<HTMLButtonElement>('#simply-close')
  const analyzeButton = shadow.querySelector<HTMLButtonElement>('#simply-analyze')
  const openButton = shadow.querySelector<HTMLButtonElement>('#simply-open')
  const statusEl = shadow.querySelector<HTMLElement>('#simply-status')
  const resultsEl = shadow.querySelector<HTMLElement>('#simply-results')
  const authSlot = shadow.querySelector<HTMLElement>('#simply-auth-slot')
  const signInButton = shadow.querySelector<HTMLButtonElement>('#simply-signin')
  const signOutButton = shadow.querySelector<HTMLButtonElement>('#simply-signout')
  const avatarEl = shadow.querySelector<HTMLElement>('#simply-avatar')
  const authLabelEl = shadow.querySelector<HTMLElement>('#simply-auth-label')
  const authHintEl = shadow.querySelector<HTMLElement>('#simply-auth-hint')

  function setCollapsed(next: boolean) {
    collapsed = next
    sessionStorage.setItem(collapsedKey, collapsed ? '1' : '0')
    panel?.classList.toggle('hidden', collapsed)
    tab?.classList.toggle('hidden', !collapsed)
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
    if (lastError && statusEl) statusEl.textContent = lastError
  }

  setCollapsed(collapsed)

  closeButton?.addEventListener('click', () => setCollapsed(true))

  tab?.addEventListener('click', () => setCollapsed(false))

  async function runAnalyze() {
    if (!statusEl || !resultsEl || !analyzeButton || !openButton) return
    if (!signedIn) {
      statusEl.textContent = 'Sign in with Google first.'
      return
    }

    analyzeButton.disabled = true
    openButton.hidden = true
    statusEl.textContent = 'Reading the paper...'
    resultsEl.innerHTML = ''

    try {
      const payload = getPaperText()
      const response = await authedFetch(`${apiBase}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Could not analyze this paper yet.')
      }

      const analysis = (await response.json()) as AnalysisResponse
      lastGuideId = analysis.id ?? null
      const count = (analysis.lessons ?? []).length
      statusEl.textContent = count
        ? `${count} topics mapped. Opening guide…`
        : 'No prerequisites detected for this page.'
      resultsEl.innerHTML = renderLessonTeaser(analysis.lessons)
      openButton.hidden = count === 0
      if (lastGuideId && count > 0) {
        window.open(`${webBase}/guide?id=${encodeURIComponent(lastGuideId)}`, '_blank', 'noopener')
        statusEl.textContent = `${count} topics mapped. Guide opened in a new tab.`
      }
    } catch (error) {
      if (error instanceof NotSignedInError) {
        await refreshAuthUi()
        statusEl.textContent = 'Your session expired. Sign in again.'
      } else {
        statusEl.textContent = error instanceof Error ? error.message : 'Could not reach the Simply API.'
      }
    } finally {
      analyzeButton.disabled = !signedIn
    }
  }

  analyzeButton?.addEventListener('click', () => void runAnalyze())

  signInButton?.addEventListener('click', () => {
    if (!signInButton || signInButton.disabled || !statusEl) return
    signInButton.disabled = true
    statusEl.textContent = 'Choose your Google account in the window that opens…'
    void signInViaBackground().then(async (result) => {
      if (result.ok) {
        await refreshAuthUi()
        statusEl.textContent = 'Signed in. You can analyze this paper now.'
      } else {
        signInButton.disabled = false
        statusEl.textContent = result.error ?? 'Sign-in failed.'
      }
    })
  })

  signOutButton?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'SIMPLY_SIGN_OUT' }, async () => {
      await refreshAuthUi()
      if (resultsEl) resultsEl.innerHTML = ''
      if (statusEl) statusEl.textContent = 'Signed out.'
    })
  })

  openButton?.addEventListener('click', () => {
    if (!statusEl || !openButton) return
    if (!lastGuideId) {
      statusEl.textContent = 'Analyze first.'
      return
    }
    window.open(`${webBase}/guide?id=${encodeURIComponent(lastGuideId)}`, '_blank', 'noopener')
    statusEl.textContent = 'Guide opened in a new tab.'
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes[AUTH_STORAGE_KEY] || changes[LAST_ERROR_KEY]) {
      void refreshAuthUi()
    }
  })

  void refreshAuthUi()
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'SIMPLY_COLLECT_PAPER') {
    return false
  }

  sendResponse(getPaperText())
  return true
})

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountWidget, { once: true })
} else {
  mountWidget()
}
