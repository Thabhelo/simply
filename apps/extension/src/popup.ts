import './style.css'

type PaperPayload = {
  title: string
  url: string
  text: string
}

type Concept = {
  area: string
  term: string
  whyItMatters: string
  plainEnglish: string
}

type AnalysisResponse = {
  title: string
  summary: string
  concepts: Concept[]
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
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    })
  }

  const response = (await chrome.tabs.sendMessage(tab.id, {
    type: 'SIMPLY_COLLECT_PAPER',
  })) as PaperPayload | undefined

  if (!response?.text) {
    throw new Error('Could not read this page. Try selecting text in the paper first.')
  }

  return response
}

function renderAnalysis(analysis: AnalysisResponse) {
  if (!resultsEl) {
    return
  }

  resultsEl.innerHTML = `
    <h2>${analysis.title}</h2>
    <p>${analysis.summary}</p>
    <div class="concepts">
      ${analysis.concepts
        .map(
          (concept) => `
            <article>
              <span>${concept.area}</span>
              <h3>${concept.term}</h3>
              <p>${concept.plainEnglish}</p>
              <small>${concept.whyItMatters}</small>
            </article>
          `,
        )
        .join('')}
    </div>
  `
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
