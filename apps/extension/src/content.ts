type PaperPayload = {
  title: string
  url: string
  text: string
}

function getPaperText(): PaperPayload {
  const selection = window.getSelection()?.toString().trim()
  const pageText = document.body.innerText.trim()
  const text = selection || pageText || document.title

  return {
    title: document.title.replace(/\s+-\s+Google Chrome$/, ''),
    url: window.location.href,
    text,
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'SIMPLY_COLLECT_PAPER') {
    return false
  }

  sendResponse(getPaperText())
  return true
})
