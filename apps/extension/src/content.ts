import { authedFetch, NotSignedInError } from './auth.js'
import { apiBase, webBase } from './config.js'
import simplyUiCss from '../../../shared/simply-ui.css?inline'
import contentWidgetCss from '../../../shared/simply-content-widget.css?inline'

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

function mountWidget() {
  if (document.getElementById(widgetId) || !looksLikeResearchPaper()) {
    return
  }

  const host = document.createElement('div')
  host.id = widgetId
  const shadow = host.attachShadow({ mode: 'open' })
  let collapsed = sessionStorage.getItem(collapsedKey) === '1'
  let lastGuideId: string | null = null

  shadow.innerHTML = `
    <link rel="stylesheet" href="${FONT_LINK}" />
    <style>
      :host {
        all: initial;
        color-scheme: light;
      }

      ${simplyUiCss}
      ${contentWidgetCss}
    </style>
    <button class="simply-tab hidden" id="simply-tab" type="button" aria-label="Open Simply">simply</button>
    <section class="simply-panel" aria-label="Simply">
      <div class="simply-panel-head">
        <span class="brand">simply</span>
        <button class="simply-close" id="simply-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="window-bar" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span class="tiny-pill">Prerequisite guide</span>
      <h2 class="simply-title">Build a calm reading guide for this paper.</h2>
      <p class="simply-copy">Simply reads what you have open and maps the background you need for a first pass.</p>
      <div class="simply-actions">
        <button class="button primary" id="simply-analyze" type="button">Analyze</button>
      </div>
      <p class="simply-status" id="simply-status" role="status"></p>
      <div class="simply-results" id="simply-results"></div>
      <button class="button primary simply-open-btn" id="simply-open" type="button" hidden>Reopen guide</button>
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

  function setCollapsed(next: boolean) {
    collapsed = next
    sessionStorage.setItem(collapsedKey, collapsed ? '1' : '0')
    panel?.classList.toggle('hidden', collapsed)
    tab?.classList.toggle('hidden', !collapsed)
  }

  setCollapsed(collapsed)

  tab?.addEventListener('click', () => setCollapsed(false))
  closeButton?.addEventListener('click', () => setCollapsed(true))

  async function runAnalyze() {
    if (!statusEl || !resultsEl || !analyzeButton || !openButton) return

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
        statusEl.textContent = 'Opening sign-in...'
        const signIn = await signInViaBackground()
        if (signIn.ok) {
          statusEl.textContent = 'Signed in. Analyzing...'
          await runAnalyze()
          return
        }
        statusEl.textContent = signIn.error ?? 'Sign-in failed.'
      } else {
        statusEl.textContent = error instanceof Error ? error.message : 'Could not reach the Simply API.'
      }
    } finally {
      analyzeButton.disabled = false
    }
  }

  analyzeButton?.addEventListener('click', () => void runAnalyze())

  openButton?.addEventListener('click', () => {
    if (!statusEl || !openButton) return
    if (!lastGuideId) {
      statusEl.textContent = 'Analyze first.'
      return
    }
    window.open(`${webBase}/guide?id=${encodeURIComponent(lastGuideId)}`, '_blank', 'noopener')
    statusEl.textContent = 'Guide opened in a new tab.'
  })
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
