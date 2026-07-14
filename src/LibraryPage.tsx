import { useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import { BookOpen, Home, Library, Search } from 'lucide-react'
import { signInWithGoogle, watchAuth, userInitial } from './auth'
import { fetchPexelsImage } from './pexels'
import { imageQueryForPaper, loadPaperHistory, type PaperHistoryEntry } from './paperHistory'
import { chromeStoreUrl } from './site'
import './LibraryPage.css'

type ImageMap = Record<string, string>

function formatWhen(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function PaperThumb({ entry, images }: { entry: PaperHistoryEntry; images: ImageMap }) {
  const query = entry.imageQuery ?? imageQueryForPaper(entry.title)
  const src = images[query]
  return (
    <div className="library-thumb">
      {src ? <img src={src} alt="" loading="lazy" /> : <div className="library-thumb-fallback" />}
    </div>
  )
}

export default function LibraryPage() {
  const [user, setUser] = useState<User | null>(null)
  const [images, setImages] = useState<ImageMap>({})
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [historyTick, setHistoryTick] = useState(0)

  useEffect(() => watchAuth(setUser), [])

  useEffect(() => {
    const refresh = () => setHistoryTick((tick) => tick + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  const papers = useMemo(() => {
    void historyTick
    return user ? loadPaperHistory(user.uid) : []
  }, [user, historyTick])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return papers
    return papers.filter((paper) => paper.title.toLowerCase().includes(q))
  }, [papers, query])

  const featured = filtered[0]
  const rest = filtered.slice(1)

  useEffect(() => {
    if (filtered.length === 0) return
    let cancelled = false
    const queries = [...new Set(filtered.map((paper) => paper.imageQuery ?? imageQueryForPaper(paper.title)))]
    void (async () => {
      for (const q of queries) {
        const url = await fetchPexelsImage(q)
        if (cancelled || !url) continue
        setImages((prev) => (prev[q] ? prev : { ...prev, [q]: url }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filtered])

  async function handleSignIn() {
    setBusy(true)
    try {
      await signInWithGoogle()
    } finally {
      setBusy(false)
    }
  }

  if (!user) {
    return (
      <div className="library-shell">
        <div className="library-signin-panel">
          <p className="library-kicker">Your papers</p>
          <h1>Track the guides you have opened.</h1>
          <p>Sign in to keep a calm history of prerequisite guides across research papers.</p>
          <button type="button" className="library-primary-btn" disabled={busy} onClick={() => void handleSignIn()}>
            Sign in with Google
          </button>
          <a className="library-back" href="/">Back to home</a>
        </div>
      </div>
    )
  }

  const featuredQuery = featured ? (featured.imageQuery ?? imageQueryForPaper(featured.title)) : ''
  const featuredImage = featuredQuery ? images[featuredQuery] : undefined

  return (
    <div className="library-shell">
      <aside className="library-sidebar" aria-label="Account navigation">
        <a className="library-logo" href="/">simply</a>
        <nav className="library-side-nav">
          <a href="/"><Home size={18} /> Home</a>
          <a className="active" href="/library"><Library size={18} /> Papers</a>
          {papers[0] && (
            <a href={`/guide?id=${encodeURIComponent(papers[0].id)}`}>
              <BookOpen size={18} /> Latest guide
            </a>
          )}
        </nav>
      </aside>

      <div className="library-main">
        <header className="library-topbar">
          <div className="library-breadcrumbs">
            <span>Account</span>
            <span>/</span>
            <span>Papers</span>
          </div>
          <label className="library-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search your papers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="library-profile">
            <span className="library-profile-text">
              <strong>{user.displayName ?? 'Reader'}</strong>
              <small>{user.email}</small>
            </span>
            <span className="library-avatar" aria-hidden="true">
              {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : userInitial(user)}
            </span>
          </div>
        </header>

        <div className="library-grid">
          <section className="library-content">
            {featured ? (
              <>
                <article className="library-feature">
                  <div className="library-feature-media">
                    {featuredImage ? (
                      <img src={featuredImage} alt="" loading="lazy" />
                    ) : (
                      <div className="library-feature-fallback" />
                    )}
                  </div>
                  <div className="library-feature-copy">
                    <p className="library-kicker">Most recent</p>
                    <h1>{featured.title}</h1>
                    <p className="library-meta">
                      {featured.lessonCount} lessons · Opened {formatWhen(featured.openedAt)}
                    </p>
                    <a className="library-primary-btn" href={`/guide?id=${encodeURIComponent(featured.id)}`}>
                      Continue guide
                    </a>
                  </div>
                </article>

                {rest.length > 0 && (
                  <section className="library-list-section">
                    <h2>Previous papers</h2>
                    <ul className="library-list">
                      {rest.map((paper) => (
                        <li key={paper.id}>
                          <PaperThumb entry={paper} images={images} />
                          <div className="library-list-copy">
                            <a href={`/guide?id=${encodeURIComponent(paper.id)}`}>{paper.title}</a>
                            <p>
                              {paper.lessonCount} lessons · {formatWhen(paper.openedAt)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            ) : (
              <div className="library-empty">
                <h1>No papers yet</h1>
                <p>Analyze a paper with the Simply extension and your guides will appear here.</p>
                <a className="library-primary-btn" href={chromeStoreUrl} target="_blank" rel="noopener noreferrer">Install the extension</a>
              </div>
            )}
          </section>

          <aside className="library-rail">
            <div className="library-stat-card">
              <p className="library-kicker">This month</p>
              <h3>{papers.length}</h3>
              <p>Guides opened</p>
            </div>
            <div className="library-promo-card">
              <p className="library-kicker">Keep reading</p>
              <h3>Open a paper on arXiv and let Simply map what you need first.</h3>
              <a className="library-promo-btn" href="https://arxiv.org/list/cs.AI/recent" target="_blank" rel="noopener noreferrer">
                Browse papers
              </a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
