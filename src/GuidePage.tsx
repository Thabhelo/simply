import { useEffect, useRef, useState } from 'react'
import renderMathInElement from 'katex/contrib/auto-render'
import 'katex/dist/katex.min.css'
import './GuidePage.css'

// TEMPORARY dev/reference viewer for the rich guide. Thabhelo's frontend replaces this
// with the designed /guide page. Renders the Guide from GET /api/guide/:id with KaTeX math.

const apiBase = 'http://localhost:8787'

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

function GuidePage() {
  const id = new URLSearchParams(window.location.search).get('id')
  const [state, setState] = useState<State>({ status: 'loading' })
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) {
      setState({ status: 'error', message: 'No guide id in the URL.' })
      return
    }
    let cancelled = false
    fetch(`${apiBase}/api/guide/${encodeURIComponent(id)}`)
      .then(async (response) => {
        if (response.status === 404) throw new Error('This guide expired — re-analyze the paper from the extension.')
        if (!response.ok) throw new Error('Could not load the guide.')
        return (await response.json()) as Guide
      })
      .then((guide) => {
        if (!cancelled) setState({ status: 'ready', guide })
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not load the guide.' })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // Render LaTeX once the guide content is in the DOM.
  useEffect(() => {
    if (state.status === 'ready' && contentRef.current) {
      renderMathInElement(contentRef.current, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
      })
    }
  }, [state])

  if (state.status === 'loading') return <main className="guide-shell"><p className="guide-status">Loading guide…</p></main>
  if (state.status === 'error') return <main className="guide-shell"><p className="guide-status">{state.message}</p></main>

  const { guide } = state
  return (
    <main className="guide-shell" ref={contentRef}>
      <header className="guide-head">
        <a className="guide-brand" href="/">simply</a>
        <span className={`guide-badge ${guide.mode}`}>{guide.mode === 'ai' ? 'AI guide' : 'Basic mode'}</span>
      </header>
      <h1 className="guide-title">{guide.title}</h1>
      <p className="guide-overview">{guide.overview || guide.summary}</p>

      <ol className="guide-lessons">
        {guide.lessons.map((lesson, index) => (
          <li className="guide-lesson" key={`${lesson.concept}-${index}`}>
            <span className="guide-area">{lesson.area}</span>
            <h2 className="guide-lesson-title">{index + 1}. {lesson.title}</h2>
            {lesson.hook && <p className="guide-hook">{lesson.hook}</p>}
            {lesson.definition && (
              <div className="guide-block"><span className="guide-label">Definition</span><p>{lesson.definition}</p></div>
            )}
            {lesson.intuition && <p className="guide-intuition">{lesson.intuition}</p>}
            {lesson.example && (
              <div className="guide-block"><span className="guide-label">Example</span><p>{lesson.example}</p></div>
            )}
            {lesson.inThisPaper && (
              <p className="guide-inpaper"><span className="guide-label">In this paper</span> {lesson.inThisPaper}</p>
            )}
            {lesson.buildsOn.length > 0 && (
              <p className="guide-builds">Builds on: {lesson.buildsOn.join(' · ')}</p>
            )}
          </li>
        ))}
      </ol>
    </main>
  )
}

export default GuidePage
