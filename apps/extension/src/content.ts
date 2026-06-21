type PaperPayload = {
  title: string
  url: string
  text?: string
}

type AnalysisResponse = {
  title: string
  concepts: Array<{ term: string; area: string }>
  ingestion?: { source: string; textLength: number }
}

const apiBase = 'http://localhost:8787'
const widgetId = 'simply-research-widget'

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

function renderConceptList(concepts: AnalysisResponse['concepts']) {
  return concepts
    .slice(0, 4)
    .map((concept) => `<li><span>${concept.area}</span>${concept.term}</li>`)
    .join('')
}

function mountWidget() {
  if (document.getElementById(widgetId) || !looksLikeResearchPaper()) {
    return
  }

  const host = document.createElement('div')
  host.id = widgetId
  const shadow = host.attachShadow({ mode: 'open' })

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .panel {
        animation: slide-in 420ms cubic-bezier(0.22, 1, 0.36, 1);
        background: rgba(255, 255, 255, 0.88);
        backdrop-filter: blur(22px) saturate(180%);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 22px;
        bottom: 24px;
        box-shadow: 0 24px 64px rgba(15, 23, 42, 0.14);
        box-sizing: border-box;
        color: #111;
        padding: 16px;
        position: fixed;
        right: 24px;
        width: 320px;
        z-index: 2147483647;
      }

      .top {
        align-items: center;
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }

      .brand {
        font-size: 13px;
        font-weight: 650;
        letter-spacing: -0.02em;
      }

      .pill {
        border: 1px solid rgba(232, 100, 42, 0.28);
        border-radius: 999px;
        color: #c24a1a;
        font-size: 11px;
        padding: 5px 8px;
      }

      h3 {
        font-size: 18px;
        font-weight: 520;
        letter-spacing: -0.03em;
        line-height: 1.12;
        margin: 14px 0 8px;
      }

      p, .status {
        color: rgba(0, 0, 0, 0.58);
        font-size: 13px;
        line-height: 1.45;
        margin: 0;
      }

      .actions {
        display: flex;
        gap: 8px;
        margin-top: 14px;
      }

      button {
        border: 0;
        border-radius: 999px;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        min-height: 36px;
        padding: 0 13px;
      }

      .primary {
        background: #111;
        color: #fff;
      }

      .secondary {
        background: rgba(0, 0, 0, 0.05);
        color: rgba(0, 0, 0, 0.68);
      }

      ul {
        display: grid;
        gap: 8px;
        list-style: none;
        margin: 14px 0 0;
        padding: 0;
      }

      li {
        background: rgba(0, 0, 0, 0.035);
        border-radius: 12px;
        color: #111;
        font-size: 13px;
        padding: 9px 10px;
      }

      li span {
        color: rgba(0, 0, 0, 0.48);
        display: block;
        font-size: 10px;
        margin-bottom: 3px;
        text-transform: uppercase;
      }

      @keyframes slide-in {
        from {
          opacity: 0;
          transform: translateY(12px) translateX(18px);
        }

        to {
          opacity: 1;
          transform: translateY(0) translateX(0);
        }
      }
    </style>
    <section class="panel" aria-label="Simply research paper helper">
      <div class="top">
        <span class="brand">Simply</span>
        <span class="pill">Paper detected</span>
      </div>
      <h3>This looks like a research paper.</h3>
      <p>Simply can build a calm prerequisite canvas for the page you are reading.</p>
      <div class="actions">
        <button class="primary" id="simply-analyze" type="button">Analyze</button>
        <button class="secondary" id="simply-dismiss" type="button">Dismiss</button>
      </div>
      <div class="status" id="simply-status"></div>
      <ul id="simply-results"></ul>
    </section>
  `

  document.documentElement.append(host)

  const analyzeButton = shadow.querySelector<HTMLButtonElement>('#simply-analyze')
  const dismissButton = shadow.querySelector<HTMLButtonElement>('#simply-dismiss')
  const statusEl = shadow.querySelector<HTMLElement>('#simply-status')
  const resultsEl = shadow.querySelector<HTMLElement>('#simply-results')

  dismissButton?.addEventListener('click', () => host.remove())
  analyzeButton?.addEventListener('click', async () => {
    if (!statusEl || !resultsEl || !analyzeButton) {
      return
    }

    analyzeButton.disabled = true
    statusEl.textContent = 'Reading the paper...'
    resultsEl.innerHTML = ''

    try {
      const response = await fetch(`${apiBase}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getPaperText()),
      })

      if (!response.ok) {
        throw new Error('Could not analyze this paper yet.')
      }

      const analysis = (await response.json()) as AnalysisResponse
      statusEl.textContent = `Found ${analysis.concepts.length} prerequisite ideas.`
      resultsEl.innerHTML = renderConceptList(analysis.concepts)
    } catch (error) {
      statusEl.textContent =
        error instanceof Error ? error.message : 'Could not reach the Simply API.'
    } finally {
      analyzeButton.disabled = false
    }
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
