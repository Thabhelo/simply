import { motion } from 'framer-motion'
import {
  ArrowUpRight,
  BookOpenText,
  Check,
  Download,
  FileText,
  Highlighter,
  Layers3,
  MessageCircle,
  Search,
} from 'lucide-react'
import './App.css'

const ease = [0.22, 1, 0.36, 1] as const
const headline = ['Read', 'hard', 'papers', 'with', 'a', 'calmer', 'mind.']

const guideRows = [
  {
    label: 'Before you read',
    title: 'Variational inference',
    copy: 'Why the paper turns uncertainty into an optimization problem.',
  },
  {
    label: 'Notation to know',
    title: 'KL divergence',
    copy: 'A gentle way to compare two probability distributions.',
  },
  {
    label: 'First-pass focus',
    title: 'The loss function',
    copy: 'What to understand before getting lost in the appendix.',
  },
]

const steps = [
  {
    icon: Search,
    label: 'Notice',
    title: 'Simply reads the paper you are already on.',
    copy: 'Open arXiv, select a confusing section if you want, and ask for a calm reading guide.',
  },
  {
    icon: Highlighter,
    label: 'Soften',
    title: 'Dense terms become plain language.',
    copy: 'No fake certainty. Just the math, notation, and ideas most likely to slow you down.',
  },
  {
    icon: Download,
    label: 'Keep',
    title: 'Export a small PDF beside the paper.',
    copy: 'A study sheet for your first pass, with definitions, analogies, and what to ignore at first.',
  },
]

const paperTerms = ['Bayesian neural nets', 'Dropout', 'KL divergence', 'Gradients', 'Sampling']

function App() {
  return (
    <main className="page-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <nav className="glass-nav" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="Simply home">
          simply
        </a>
        <div className="nav-links">
          <a className="active" href="#reader">
            Reader
          </a>
          <a href="#guide">Guide</a>
          <a href="#weekend">Build</a>
          <a href="#early">Early access</a>
        </div>
        <a className="nav-button" href="#early">
          Join
          <ArrowUpRight size={14} />
        </a>
      </nav>

      <section className="hero">
        <motion.p
          className="tiny-pill"
          initial={{ opacity: 0, y: 14, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, ease }}
        >
          A gentle reader for research papers
        </motion.p>

        <h1 aria-label="Read hard papers with a calmer mind.">
          {headline.map((word, index) => (
            <motion.span
              key={word}
              initial={{ opacity: 0, y: 20, filter: 'blur(12px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.72, delay: index * 0.052, ease }}
            >
              {word}
            </motion.span>
          ))}
        </h1>

        <motion.p
          className="hero-copy"
          initial={{ opacity: 0, y: 18, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, delay: 0.32, ease }}
        >
          Simply turns intimidating machine learning papers into a small prerequisite guide:
          the terms to know, the math to refresh, and the parts worth reading first.
        </motion.p>

        <motion.div
          className="hero-actions"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.42, ease }}
        >
          <a className="button primary" href="#early">
            Get early access
            <ArrowUpRight size={15} />
          </a>
          <a className="button secondary" href="/simply-chrome-extension.zip" download>
            Download Chrome extension
            <Download size={15} />
          </a>
          <a className="button secondary" href="https://arxiv.org/pdf/1606.08415v3" target="_blank">
            Try the demo paper
          </a>
        </motion.div>

        <motion.div
          className="hero-product"
          initial={{ opacity: 0, y: 28, filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: 0.52, ease }}
        >
          <MockReaderPanel />
          <aside className="soft-note">
            <span className="status-pill">Calm mode</span>
            <h2>Start with what the paper assumes.</h2>
            <p>
              Instead of scoring your knowledge, Simply gives you a quiet place to begin.
            </p>
          </aside>
        </motion.div>
      </section>

      <section className="reader-section" id="reader">
        <div className="section-heading">
          <p className="tiny-pill">What changes</p>
          <h2>The paper stays technical. The first pass gets kinder.</h2>
          <p>
            Simply does not dumb the work down. It gives the missing context around it so
            more people can stay in the room.
          </p>
        </div>

        <div className="steps-grid">
          {steps.map((step, index) => {
            const Icon = step.icon

            return (
              <motion.article
                className="step-card"
                key={step.title}
                initial={{ opacity: 0, y: 28, filter: 'blur(10px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, margin: '-120px' }}
                transition={{ duration: 0.65, delay: index * 0.08, ease }}
              >
                <span className={`glyph glyph-${index + 1}`}>
                  <Icon size={22} />
                </span>
                <p className="micro-label">{step.label}</p>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </motion.article>
            )
          })}
        </div>
      </section>

      <section className="guide-section" id="guide">
        <div className="guide-card">
          <div className="guide-copy">
            <p className="tiny-pill">The guide</p>
            <h2>A soft map before the notation gets loud.</h2>
            <p>
              A generated PDF that feels like notes from a patient tutor: compact, careful,
              and focused on what helps the next page make sense.
            </p>
            <div className="term-marquee" aria-label="Example paper concepts">
              <div>
                {[...paperTerms, ...paperTerms].map((term, index) => (
                  <span key={`${term}-${index}`}>{term}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="guide-preview" aria-label="Guide preview">
            <div className="window-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="guide-title-row">
              <FileText size={18} />
              <div>
                <strong>Simply guide</strong>
                <p>Concrete Dropout</p>
              </div>
            </div>
            {guideRows.map((row) => (
              <article className="guide-row" key={row.title}>
                <span>{row.label}</span>
                <h3>{row.title}</h3>
                <p>{row.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="weekend-section" id="weekend">
        <div className="section-heading narrow">
          <p className="tiny-pill">Weekend build</p>
          <h2>Small enough to ship. Useful enough to charge for.</h2>
        </div>
        <div className="weekend-grid">
          <article>
            <span>01</span>
            <h3>Chrome reader</h3>
            <p>Capture the active paper, selected text, title, and source URL.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Prerequisite guide</h3>
            <p>Explain the background math and terms without turning it into another paper.</p>
          </article>
          <article>
            <span>03</span>
            <h3>PDF export</h3>
            <p>Save a quiet guide to read next to arXiv, textbooks, or class notes.</p>
          </article>
        </div>
      </section>

      <section className="early-section" id="early">
        <div className="early-card">
          <div className="early-icons" aria-hidden="true">
            <BookOpenText size={22} />
            <MessageCircle size={22} />
            <Layers3 size={22} />
          </div>
          <h2>Read the next paper with Simply.</h2>
          <p>
            Be first to try the Chrome extension while we turn the starter into a real
            reading companion.
          </p>
          <form>
            <input type="email" placeholder="you@example.com" aria-label="Email address" />
            <button type="submit">
              Get access
              <Check size={15} />
            </button>
          </form>
          <a className="button secondary download-link" href="/simply-chrome-extension.zip" download>
            Download Chrome extension
            <Download size={15} />
          </a>
        </div>
      </section>
    </main>
  )
}

function MockReaderPanel() {
  return (
    <div className="mock-window" aria-label="Simply reader mockup">
      <div className="window-bar">
        <span />
        <span />
        <span />
      </div>
      <div className="mock-header">
        <div>
          <p>arXiv paper</p>
          <h2>Concrete Dropout</h2>
        </div>
        <span className="status-pill">Ready</span>
      </div>
      <div className="paper-strip">
        <p>Dropout variational inference KL divergence uncertainty gradients...</p>
      </div>
      <div className="reader-output">
        <div className="output-head">
          <Highlighter size={15} />
          <span>Before you continue</span>
        </div>
        <h3>Refresh the idea of an expectation.</h3>
        <p>
          In this paper, the expectation is a way to average possible neural network
          weights. You do not need measure theory for the first pass.
        </p>
      </div>
      <div className="mini-list">
        <span>Define KL divergence</span>
        <span>Explain dropout as uncertainty</span>
        <span>Skim appendix later</span>
      </div>
    </div>
  )
}

export default App
