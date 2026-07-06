import { ArrowLeft } from 'lucide-react'
import type { LegalDoc } from './legal/content'
import './LegalPage.css'

type LegalPageProps = {
  doc: LegalDoc
}

export default function LegalPage({ doc }: LegalPageProps) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <a className="legal-back" href="/">
          <ArrowLeft size={16} />
          Simply
        </a>
        <nav className="legal-nav" aria-label="Legal">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/security">Security</a>
        </nav>
      </header>

      <article className="legal-article">
        <p className="legal-updated">Last updated {doc.updated}</p>
        <h1>{doc.title}</h1>
        <p className="legal-summary">{doc.summary}</p>

        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 48)}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>

      <footer className="legal-footer">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/security">Security</a>
        <a href="/">Home</a>
      </footer>
    </main>
  )
}
