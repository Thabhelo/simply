function sanitizeFilename(title: string): string {
  return title.replace(/[^\w\s-]/g, '').trim() || 'simply-guide'
}

async function waitForImages(root: HTMLElement, timeoutMs = 8000): Promise<void> {
  const images = [...root.querySelectorAll('img')]

  for (const img of images) {
    if (img.complete) continue
    // Lazy images below the fold never start loading until scrolled into view.
    // Promote to eager and re-assign src so the fetch actually begins.
    if (img.loading === 'lazy') {
      img.loading = 'eager'
      const src = img.currentSrc || img.src
      if (src) img.src = src
    }
  }

  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve()
      return new Promise<void>((resolve) => {
        const done = () => resolve()
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
        window.setTimeout(done, timeoutMs)
      })
    }),
  )
}

async function waitForSketches(root: HTMLElement, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const sketches = [...root.querySelectorAll('.guide-sketch')]
    if (sketches.length === 0) return
    const ready = sketches.every((sketch) => sketch.querySelector('canvas'))
    if (ready) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

async function waitForPaint(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

/**
 * Waits until the guide is fully rendered: fonts loaded, images fetched,
 * diagrams drawn, and a couple of frames painted. Shared by the browser-print
 * path and the server-side headless export (which reads a readiness flag).
 */
export async function awaitGuideRenderReady(root: HTMLElement): Promise<void> {
  await document.fonts.ready
  await waitForImages(root)
  await waitForSketches(root)
  await waitForPaint()
}

/**
 * Opens the browser print dialog so the guide can be saved as PDF with full styling.
 * This matches the on-screen layout and avoids html2canvas hangs on long guides.
 */
export async function downloadGuidePdf(root: HTMLElement, title: string): Promise<void> {
  if (!root) throw new Error('Guide content is not ready.')

  await awaitGuideRenderReady(root)

  const previousTitle = document.title
  document.title = `${sanitizeFilename(title)} · simply`
  root.classList.add('guide-print-mode')

  await new Promise<void>((resolve) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      root.classList.remove('guide-print-mode')
      document.title = previousTitle
      resolve()
    }

    window.addEventListener('afterprint', finish, { once: true })

    const media = window.matchMedia('print')
    const onPrintChange = (event: MediaQueryListEvent) => {
      if (!event.matches) finish()
    }
    media.addEventListener('change', onPrintChange)

    window.print()

    // Fallback when afterprint / matchMedia never fire (rare).
    window.setTimeout(() => {
      media.removeEventListener('change', onPrintChange)
      finish()
    }, 120_000)
  })
}
