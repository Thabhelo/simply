import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { User } from 'firebase/auth'
import 'katex/dist/katex.min.css'
import { signInWithGoogle, watchAuth } from './auth'
import { awaitGuideRenderReady, downloadGuidePdf } from './guidePdf'
import HighlightAsk from './HighlightAsk'
import { imageQueryForPaper, recordPaperVisit } from './paperHistory'
import RichProse from './RichProse'
import VisualSteps from './VisualSteps'
import type { ExcalidrawElementSkeleton } from './LessonSketch'
import './GuidePage.css'

const LessonSketch = lazy(() => import('./LessonSketch'))

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787'

// Fetches the server-rendered (headless Chromium) PDF. Returns null on any
// failure so the caller can fall back to the browser print dialog.
async function fetchServerPdf(id: string): Promise<Blob | null> {
  try {
    const response = await fetch(`${apiBase}/api/guide/${encodeURIComponent(id)}/guide.pdf`)
    if (!response.ok) return null
    const blob = await response.blob()
    return blob.type === 'application/pdf' ? blob : null
  } catch {
    return null
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

type Theme = 'light' | 'dark'

function toneForArea(area: string): string {
  const key = area.trim().toLowerCase()
  const map: Record<string, string> = {
    probability: 'peach',
    statistics: 'lilac',
    'linear algebra': 'sky',
    calculus: 'sage',
    optimization: 'sand',
    ml: 'peach',
  }
  return map[key] ?? 'sand'
}

function hasText(value?: string): boolean {
  return Boolean(value?.trim())
}

function lessonFeelsIncomplete(lesson: Lesson): boolean {
  const len = (s?: string) => (s ?? '').trim().length
  return len(lesson.definition) < 40 || len(lesson.example) < 60 || len(lesson.hook) < 12
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
  diagram?: string
  excalidrawElements?: ExcalidrawElementSkeleton[]
  illustration?: string
  visualSteps?: { label: string; narration: string }[]
}

type Guide = {
  id: string
  title: string
  url?: string
  summary: string
  mode: 'ai' | 'basic'
  overview: string
  lessons: Lesson[]
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; guide: Guide }

function initialTheme(): Theme {
  const saved = localStorage.getItem('simply-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return 'light'
}

function GuidePage() {
  const params = new URLSearchParams(window.location.search)
  const id = params.get('id')
  // Headless-Chromium export mode (server-side PDF): render static, print-styled,
  // and signal readiness via window.__SIMPLY_PDF_READY__ once fully painted.
  const exportMode = params.has('export')
  const [state, setState] = useState<State>(() =>
    !id ? { status: 'error', message: 'No guide id in the URL.' } : { status: 'loading' },
  )
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [user, setUser] = useState<User | null>(null)
  // In export mode the guide is always rendered in its static, print-ready form.
  const [pdfBusy, setPdfBusy] = useState(exportMode)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => watchAuth(setUser), [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('simply-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetch(`${apiBase}/api/guide/${encodeURIComponent(id)}`)
      .then(async (response) => {
        if (response.status === 404) throw new Error('Guide not found. Re-analyze the paper from the extension.')
        if (!response.ok) throw new Error('Could not load the guide.')
        return (await response.json()) as Guide
      })
      .then((guide) => {
        if (!cancelled) setState({ status: 'ready', guide })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Could not load the guide.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (state.status !== 'ready' || !user) return
    recordPaperVisit(user.uid, {
      id: state.guide.id,
      title: state.guide.title,
      url: state.guide.url,
      lessonCount: state.guide.lessons.length,
      imageQuery: imageQueryForPaper(state.guide.title),
    })
  }, [state, user])

  // Export mode: once the guide is ready and fully painted, flip the flag the
  // headless renderer waits on before calling page.pdf().
  useEffect(() => {
    if (!exportMode || state.status !== 'ready') return
    let cancelled = false
    ;(async () => {
      if (contentRef.current) await awaitGuideRenderReady(contentRef.current)
      if (!cancelled) (window as unknown as { __SIMPLY_PDF_READY__?: boolean }).__SIMPLY_PDF_READY__ = true
    })()
    return () => {
      cancelled = true
    }
  }, [exportMode, state])

  async function handleDownloadPdf(guide: Guide) {
    try {
      if (!user) await signInWithGoogle()
      if (!contentRef.current) throw new Error('Guide content is not ready.')
      flushSync(() => setPdfBusy(true))
      // Prefer the server-rendered PDF (embedded fonts → renders in every
      // viewer, including Discord's in-app preview). Fall back to the browser
      // print dialog if the render service is unavailable.
      const rendered = await fetchServerPdf(guide.id)
      if (rendered) {
        triggerDownload(rendered, `${guide.title || 'simply-guide'}.pdf`)
      } else {
        await downloadGuidePdf(contentRef.current, guide.title)
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not export PDF.')
    } finally {
      setPdfBusy(false)
    }
  }

  const navActions = (guide?: Guide) => (
    <div className="guide-nav-actions">
      {guide && (
        <button
          type="button"
          className="guide-pdf-nav"
          disabled={pdfBusy}
          onClick={() => void handleDownloadPdf(guide)}
        >
          {pdfBusy ? 'Preparing…' : 'Download PDF'}
        </button>
      )}
      <button
        type="button"
        className="guide-toggle"
        aria-label="Toggle theme"
        onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      >
        {theme === 'dark' ? 'Light' : 'Dark'}
      </button>
    </div>
  )

  if (state.status === 'loading') {
    return (
      <div className="guide-page">
        <header className="guide-nav">
          <div className="guide-nav-inner">
            <a className="guide-brand" href="/">simply</a>
            {navActions()}
          </div>
        </header>
        <p className="guide-status">Loading guide…</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="guide-page">
        <header className="guide-nav">
          <div className="guide-nav-inner">
            <a className="guide-brand" href="/">simply</a>
            {navActions()}
          </div>
        </header>
        <p className="guide-status">{state.message}</p>
      </div>
    )
  }

  const { guide } = state

  return (
    <div className="guide-page">
      <header className="guide-nav">
        <div className="guide-nav-inner">
          <a className="guide-brand" href="/">simply</a>
          <div className="guide-nav-links">
            {user && <a className="guide-nav-link" href="/library">Your papers</a>}
          </div>
          {navActions(guide)}
        </div>
      </header>

      <article className={pdfBusy ? 'guide-body guide-print-mode' : 'guide-body'} ref={contentRef}>
        <header className="guide-hero">
          <p className="guide-kicker">Prerequisite guide</p>
          <h1 className="guide-title">{guide.title}</h1>
          {guide.url && (
            <a className="guide-source" href={guide.url} target="_blank" rel="noopener noreferrer">
              View paper
            </a>
          )}
          <div className="guide-overview-card">
            <RichProse>{guide.overview || guide.summary}</RichProse>
          </div>
        </header>

        {guide.lessons.length > 0 && (
          <nav className="guide-toc" aria-label="Lessons">
            <h2 className="guide-toc-title">In this guide</h2>
            <ol className="guide-toc-list">
              {guide.lessons.map((lesson, index) => (
                <li key={`toc-${lesson.concept}-${index}`}>
                  <a href={`#lesson-${index + 1}`}>
                    <span className="guide-toc-num">{String(index + 1).padStart(2, '0')}</span>
                    <span className="guide-toc-label">{lesson.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <ol className="guide-lessons">
          {guide.lessons.map((lesson, index) => (
              <li
                className={`guide-lesson tone-${toneForArea(lesson.area)}`}
                id={`lesson-${index + 1}`}
                key={`${lesson.concept}-${index}`}
              >
                <header className="guide-lesson-head">
                  <span className="guide-lesson-num">{String(index + 1).padStart(2, '0')}</span>
                  <div className="guide-lesson-heading">
                    <span className="guide-area">{lesson.area}</span>
                    <h2 className="guide-lesson-title">{lesson.title}</h2>
                  </div>
                </header>

                {hasText(lesson.hook) && (
                  <div className="guide-hook-card">
                    <RichProse>{lesson.hook}</RichProse>
                  </div>
                )}

                {lesson.illustration && (
                  <figure className="guide-illustration">
                    <img
                      src={lesson.illustration}
                      alt={`Illustration for ${lesson.title}`}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.closest('figure')?.remove()
                      }}
                    />
                  </figure>
                )}

                {lesson.visualSteps && lesson.visualSteps.length > 0 && (
                  <VisualSteps steps={lesson.visualSteps} title={lesson.title} staticForExport={pdfBusy} />
                )}

                {lessonFeelsIncomplete(lesson) && (
                  <p className="guide-incomplete-note">
                    This lesson looks thin — re-analyze the paper from the extension for a fuller guide.
                  </p>
                )}

                <div className="guide-lesson-sections">
                  {hasText(lesson.definition) && (
                    <section className="guide-section">
                      <h3 className="guide-section-label">Definition</h3>
                      <RichProse>{lesson.definition}</RichProse>
                    </section>
                  )}

                  {hasText(lesson.intuition) && (
                    <section className="guide-section">
                      <h3 className="guide-section-label">Intuition</h3>
                      <RichProse>{lesson.intuition}</RichProse>
                    </section>
                  )}

                  {hasText(lesson.example) && (
                    <section className="guide-section guide-section-example">
                      <h3 className="guide-section-label">Worked example</h3>
                      <div className="guide-example-card">
                        <RichProse>{lesson.example}</RichProse>
                      </div>
                    </section>
                  )}

                  {(lesson.excalidrawElements?.length || hasText(lesson.diagram)) && (
                    <Suspense fallback={null}>
                      <LessonSketch elements={lesson.excalidrawElements} mermaid={lesson.diagram} />
                    </Suspense>
                  )}

                  {hasText(lesson.inThisPaper) && (
                    <section className="guide-section guide-section-inpaper">
                      <h3 className="guide-section-label">In this paper</h3>
                      <RichProse>{lesson.inThisPaper}</RichProse>
                    </section>
                  )}
                </div>

                {lesson.buildsOn.length > 0 && (
                  <p className="guide-builds">Builds on {lesson.buildsOn.join(', ')}</p>
                )}
              </li>
            ))}
        </ol>
      </article>

      <HighlightAsk containerRef={contentRef} guideTitle={guide.title} />
    </div>
  )
}

export default GuidePage
