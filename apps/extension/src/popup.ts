import './style.css'

type PaperPayload = {
  title: string
  url: string
  text?: string
}

type Lesson = {
  area: string
  concept: string
  title: string
  intuition: string
  formula?: string
  example: string
  inThisPaper: string
}

type AnalysisResponse = {
  title: string
  summary: string
  mode?: 'ai' | 'basic'
  lessons?: Lesson[]
  concepts: { area: string; term: string; whyItMatters: string; plainEnglish: string }[]
  nextSteps: string[]
}

const apiBase = 'http://localhost:8787'
const analyzeButton = document.querySelector<HTMLButtonElement>('#analyze')
const downloadButton = document.querySelector<HTMLButtonElement>('#download')
const statusEl = document.querySelector<HTMLElement>('#status')
const resultsEl = document.querySelector<HTMLElement>('#results')

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
    <div class="result-head"><h2>${analysis.title}</h2>${badge}</div>
    <p>${analysis.summary}</p>
    <div class="lessons">
      ${lessons
        .map(
          (l) => `
            <article class="lesson">
              <span>${l.area}</span>
              <h3>${l.title}</h3>
              <p>${l.intuition}</p>
              ${l.formula ? `<code class="formula">${l.formula}</code>` : ''}
              ${l.example ? `<p class="example">${l.example}</p>` : ''}
              <small>${l.inThisPaper}</small>
            </article>`,
        )
        .join('')}
    </div>`
}

async function analyzeCurrentPage() {
  setStatus('Reading the page...')
  latestPayload = await collectPaper()
  setStatus('Asking the local API...')

  const response = await fetch(`${apiBase}/api/analyze`, {
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
  const response = await fetch(`${apiBase}/api/report.pdf`, {
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

analyzeButton?.addEventListener('click', () => {
  analyzeCurrentPage().catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : 'Something went wrong.')
  })
})

downloadButton?.addEventListener('click', () => {
  downloadGuide().catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : 'Something went wrong.')
  })
})
