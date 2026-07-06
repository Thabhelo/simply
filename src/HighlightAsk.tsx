import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { authedFetch, signInWithGoogle, watchAuth } from './auth'

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787'

type Props = {
  containerRef: React.RefObject<HTMLElement | null>
  guideTitle: string
}

type Bubble = {
  x: number
  y: number
  selection: string
  question: string
  answer: string
  loading: boolean
}

export default function HighlightAsk({ containerRef, guideTitle }: Props) {
  const [user, setUser] = useState<User | null>(null)
  const [bubble, setBubble] = useState<Bubble | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => watchAuth(setUser), [])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return

    function onMouseUp() {
      if (!root) return
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      if (!text || text.length < 2) return
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      if (!root.contains(range.commonAncestorContainer)) return

      const rect = range.getBoundingClientRect()
      setBubble({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        selection: text.slice(0, 600),
        question: '',
        answer: '',
        loading: false,
      })
    }

    root.addEventListener('mouseup', onMouseUp)
    return () => root.removeEventListener('mouseup', onMouseUp)
  }, [containerRef])

  useEffect(() => {
    if (bubble && !bubble.loading && !bubble.answer) {
      inputRef.current?.focus()
    }
  }, [bubble])

  if (!bubble) return null

  async function ask() {
    if (!bubble || !bubble.question.trim()) return
    if (!user) {
      await signInWithGoogle()
      return
    }
    setBubble({ ...bubble, loading: true })
    try {
      const response = await authedFetch(`${apiBase}/api/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selection: bubble.selection,
          question: bubble.question.trim(),
          guideTitle,
        }),
      })
      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error ?? 'Could not get an answer.')
      }
      const data = (await response.json()) as { answer: string }
      setBubble({ ...bubble, loading: false, answer: data.answer })
    } catch (error) {
      setBubble({
        ...bubble,
        loading: false,
        answer: error instanceof Error ? error.message : 'Something went wrong.',
      })
    }
  }

  return (
    <div
      className="highlight-ask"
      style={{ left: bubble.x, top: bubble.y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" className="highlight-ask-close" aria-label="Close" onClick={() => setBubble(null)}>
        ×
      </button>
      <p className="highlight-ask-quote">
        "{bubble.selection.slice(0, 120)}
        {bubble.selection.length > 120 ? '…' : ''}"
      </p>
      {!bubble.answer ? (
        <>
          {!user && <p className="highlight-ask-signin">Sign in to ask about this passage.</p>}
          <div className="highlight-ask-row">
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask about this…"
              value={bubble.question}
              disabled={bubble.loading}
              onChange={(event) => setBubble({ ...bubble, question: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void ask()
                if (event.key === 'Escape') setBubble(null)
              }}
            />
            <button type="button" disabled={bubble.loading || !bubble.question.trim()} onClick={() => void ask()}>
              {bubble.loading ? '…' : 'Ask'}
            </button>
          </div>
        </>
      ) : (
        <p className="highlight-ask-answer">{bubble.answer}</p>
      )}
    </div>
  )
}
