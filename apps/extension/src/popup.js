import './style.css';
const apiBase = 'http://localhost:8787';
const analyzeButton = document.querySelector('#analyze');
const downloadButton = document.querySelector('#download');
const statusEl = document.querySelector('#status');
const resultsEl = document.querySelector('#results');
let latestPayload = null;
function setStatus(message) {
    if (statusEl) {
        statusEl.textContent = message;
    }
}
async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
        throw new Error('No active tab found.');
    }
    return { ...tab, id: tab.id };
}
async function collectPaper() {
    const tab = await getActiveTab();
    try {
        const response = (await chrome.tabs.sendMessage(tab.id, {
            type: 'UNFOG_COLLECT_PAPER',
        }));
        if (response?.text) {
            return response;
        }
    }
    catch {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
        });
    }
    const response = (await chrome.tabs.sendMessage(tab.id, {
        type: 'UNFOG_COLLECT_PAPER',
    }));
    if (!response?.text) {
        throw new Error('Could not read this page. Try selecting text in the paper first.');
    }
    return response;
}
function renderAnalysis(analysis) {
    if (!resultsEl) {
        return;
    }
    resultsEl.innerHTML = `
    <h2>${analysis.title}</h2>
    <p>${analysis.summary}</p>
    <div class="concepts">
      ${analysis.concepts
        .map((concept) => `
            <article>
              <span>${concept.area}</span>
              <h3>${concept.term}</h3>
              <p>${concept.plainEnglish}</p>
              <small>${concept.whyItMatters}</small>
            </article>
          `)
        .join('')}
    </div>
  `;
}
async function analyzeCurrentPage() {
    setStatus('Reading the page...');
    latestPayload = await collectPaper();
    setStatus('Asking the local API...');
    const response = await fetch(`${apiBase}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(latestPayload),
    });
    if (!response.ok) {
        throw new Error('The local API rejected the paper payload.');
    }
    const analysis = (await response.json());
    renderAnalysis(analysis);
    setStatus('Guide preview ready.');
}
async function downloadGuide() {
    if (!latestPayload) {
        latestPayload = await collectPaper();
    }
    setStatus('Generating PDF...');
    const response = await fetch(`${apiBase}/api/report.pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(latestPayload),
    });
    if (!response.ok) {
        throw new Error('Could not generate the PDF guide.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    chrome.tabs.create({ url });
    setStatus('PDF opened in a new tab.');
}
analyzeButton?.addEventListener('click', () => {
    analyzeCurrentPage().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Something went wrong.');
    });
});
downloadButton?.addEventListener('click', () => {
    downloadGuide().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Something went wrong.');
    });
});
