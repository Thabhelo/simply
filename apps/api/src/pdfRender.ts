import chromium from '@sparticuz/chromium'
import * as mupdf from 'mupdf'
import PDFDocument from 'pdfkit'
import puppeteer, { type Browser } from 'puppeteer-core'

/*
 * Server-side PDF rendering via headless Chromium.
 *
 * We navigate real Chromium to the deployed guide page in `?export=1` mode and
 * call page.pdf(). This reuses the exact on-screen rendering (KaTeX math,
 * Excalidraw diagrams, print-pagination CSS) and produces a self-contained PDF
 * with fully embedded fonts — unlike the browser's own "Save as PDF", whose
 * subsetted fonts render blank in lightweight viewers (e.g. Discord's in-app
 * preview). See docs discussion for background.
 */

// Where the guide SPA is hosted. The headless browser loads pages from here.
const WEB_APP_URL = process.env.WEB_APP_URL ?? 'http://localhost:5173'

// Local dev override: point CHROMIUM_PATH at an installed browser (e.g. Chrome).
// When unset (production), we use the serverless-tuned @sparticuz/chromium build.
const LOCAL_EXECUTABLE = process.env.CHROMIUM_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH ?? ''

// Max time to wait for the page to signal it has finished rendering.
const RENDER_READY_TIMEOUT_MS = 45_000

let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  // Reuse a single browser across requests; relaunch if it crashed/disconnected.
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null)
    if (existing && existing.connected) return existing
    browserPromise = null
  }

  // Local: use the installed browser with minimal container-safe flags.
  // Production: @sparticuz/chromium supplies a serverless-ready binary + args
  // (handles sandbox, writable dirs, and Cloud Run's read-only filesystem).
  const launchOptions = LOCAL_EXECUTABLE
    ? {
        executablePath: LOCAL_EXECUTABLE,
        headless: true as const,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      }
    : {
        executablePath: await chromium.executablePath(),
        headless: true as const,
        args: chromium.args,
      }

  browserPromise = puppeteer.launch(launchOptions)

  const browser = await browserPromise
  browser.on('disconnected', () => {
    browserPromise = null
  })
  return browser
}

export function guideExportUrl(id: string): string {
  const base = WEB_APP_URL.replace(/\/$/, '')
  return `${base}/guide?id=${encodeURIComponent(id)}&export=1`
}

/**
 * Renders the guide page at `url` to a PDF buffer. Waits for the page to set
 * window.__SIMPLY_PDF_READY__ (fonts, images, and diagrams settled) before
 * printing, so nothing is captured half-rendered.
 */
export async function renderGuidePdf(url: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: RENDER_READY_TIMEOUT_MS })
    // The page flips this flag once fonts/images/sketches are done (see GuidePage).
    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (window as any).__SIMPLY_PDF_READY__ === true,
      { timeout: RENDER_READY_TIMEOUT_MS },
    )
    const pdf = await page.pdf({
      printBackground: true,
      // Honor the guide's @page size/margins from print CSS.
      preferCSSPageSize: true,
      format: 'A4',
    })
    return Buffer.from(pdf)
  } finally {
    await page.close().catch(() => {})
  }
}

// Rasterization DPI for the flattened fallback: crisp enough for text, small enough
// to keep file size and memory reasonable.
const FLATTEN_DPI = 150

/**
 * Guaranteed-compatible fallback: renders the guide PDF, then rasterizes every
 * page to an image and rebuilds an image-only PDF. The result has zero fonts,
 * so it renders identically in any viewer (including ones that mishandle the
 * Type3 glyphs headless Chromium emits). Trade-off: text is no longer
 * selectable and the file is larger. Chromium's pagination is preserved (one
 * source page -> one image page at the same dimensions).
 */
export async function renderGuidePdfFlattened(url: string): Promise<Buffer> {
  const vector = await renderGuidePdf(url)

  const doc = mupdf.Document.openDocument(vector, 'application/pdf')
  const scale = FLATTEN_DPI / 72
  try {
    const pageCount = doc.countPages()
    return await new Promise<Buffer>((resolve, reject) => {
      const out = new PDFDocument({ autoFirstPage: false })
      const chunks: Buffer[] = []
      out.on('data', (c: Buffer) => chunks.push(c))
      out.on('end', () => resolve(Buffer.concat(chunks)))
      out.on('error', reject)
      try {
        // Rasterize and embed one page at a time so peak memory holds a single
        // page image rather than every page's bitmap at once. Free each mupdf
        // pixmap/page immediately to release the WASM heap.
        for (let i = 0; i < pageCount; i++) {
          const page = doc.loadPage(i)
          const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false)
          const png = Buffer.from(pixmap.asPNG())
          const wPt = (pixmap.getWidth() * 72) / FLATTEN_DPI
          const hPt = (pixmap.getHeight() * 72) / FLATTEN_DPI
          pixmap.destroy()
          page.destroy()
          out.addPage({ size: [wPt, hPt], margin: 0 })
          out.image(png, 0, 0, { width: wPt, height: hPt })
        }
        out.end()
      } catch (error) {
        reject(error)
      }
    })
  } finally {
    doc.destroy()
  }
}
