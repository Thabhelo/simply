import { motion } from 'framer-motion'
import {
  ArrowUpRight,
  Download,
  FileText,
  Highlighter,
  Search,
} from 'lucide-react'
import AuthButton from './AuthButton'
import MagneticButton from './MagneticButton'
import { chromeStoreUrl } from './site'
import './App.css'

const ease = [0.22, 1, 0.36, 1] as const
const titleLines = ['Read hard papers', 'with a calmer mind.']

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

const paperTerms = [
  'Bayesian neural nets',
  'Dropout',
  'KL divergence',
  'Gradients',
  'Sampling',
  'Expectation',
  'Variational bounds',
]

function App() {
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Main navigation">
        <div className="landing-nav-start">
          <a className="landing-brand" href="/" aria-label="Simply home">
            simply
          </a>
          <span className="landing-nav-divider" aria-hidden="true" />
          <div className="landing-nav-links">
            <a className="active" href="#reader">
              Reader
            </a>
            <a href="/library">Your papers</a>
            <a href="#guide">Guide</a>
          </div>
        </div>
        <div className="landing-nav-end">
          <MagneticButton
            circleColor="rgba(255,255,255,0.15)"
            href={chromeStoreUrl}
            className="landing-nav-cta"
          >
            Get the extension
            <ArrowUpRight size={14} />
          </MagneticButton>
          <AuthButton />
        </div>
      </nav>

      <section className="landing-hero">
        <motion.div
          className="landing-ambient landing-ambient-left"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.2, ease: 'easeOut' }}
        />
        <motion.div
          className="landing-ambient landing-ambient-right"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.3, ease: 'easeOut' }}
        />
        <motion.div
          className="landing-ambient landing-ambient-bottom"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.35, ease: 'easeOut' }}
        />
        <div className="landing-hero-fade" aria-hidden />

        <div className="landing-hero-inner">
          <motion.div
            className="landing-eyebrow"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          >
            <span className="landing-eyebrow-dot" />
            a gentle reader for research papers
          </motion.div>

          <h1 className="landing-headline" aria-label="Read hard papers with a calmer mind.">
            {titleLines.map((line, lineIdx) => (
              <span key={line} className="landing-headline-line">
                {line.split(' ').map((word, i) => {
                  const delay = (lineIdx * 4 + i) * 0.055
                  return (
                    <motion.span
                      key={`${lineIdx}-${word}-${i}`}
                      initial={{ opacity: 0, filter: 'blur(12px)', y: 20 }}
                      animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                      transition={{ duration: 0.55, delay, ease: 'easeOut' }}
                    >
                      {word}
                    </motion.span>
                  )
                })}
              </span>
            ))}
          </h1>

          <motion.p
            className="landing-lede"
            initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.6, delay: 0.55, ease: 'easeOut' }}
          >
            <span className="landing-brand-mark">Simply</span> analyzes the research paper you are
            reading, then builds a calm guide to the calculus, linear algebra, statistics, notation,
            and background knowledge you need to navigate it.
          </motion.p>

          <motion.div
            className="landing-actions"
            initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.6, delay: 0.7, ease: 'easeOut' }}
          >
            <MagneticButton
              circleColor="rgba(255,255,255,0.15)"
              href={chromeStoreUrl}
              className="landing-btn landing-btn-primary landing-cta-pulse"
            >
              Get the extension
              <ArrowUpRight size={15} />
            </MagneticButton>
            <MagneticButton
              circleColor="rgba(0,0,0,0.05)"
              href="https://arxiv.org/pdf/1606.08415v3"
              className="landing-btn landing-btn-secondary landing-cta-pulse"
            >
              Try the demo paper
            </MagneticButton>
          </motion.div>

          <motion.div
            className="landing-shot"
            initial={{ opacity: 0, y: 60, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, delay: 0.85, ease }}
          >
            <MockReaderPanel />
          </motion.div>
        </div>
      </section>

      <section className="landing-marquee" aria-label="Example paper concepts">
        <p>The paper stays technical. The first pass gets kinder.</p>
        <div className="landing-marquee-track">
          <div>
            {[...paperTerms, ...paperTerms].map((term, index) => (
              <span key={`${term}-${index}`}>{term}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="reader">
        <div className="landing-section-head">
          <p className="landing-section-eyebrow">How Simply works</p>
          <h2>Real papers, quieter first passes.</h2>
          <p>
            Simply does not dumb the work down. It gives the missing context around it so more
            people can stay in the room.
          </p>
        </div>

        <div className="landing-steps">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <motion.article
                className="landing-step"
                key={step.title}
                initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.75, delay: index * 0.1, ease }}
              >
                <div className={`landing-step-icon landing-step-icon-${index + 1}`}>
                  <Icon size={20} />
                </div>
                <p className="landing-step-label">{step.label}</p>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </motion.article>
            )
          })}
        </div>
      </section>

      <section className="landing-section landing-guide-section" id="guide">
        <div className="landing-guide-grid">
          <div className="landing-guide-copy">
            <p className="landing-section-eyebrow">The guide</p>
            <h2>A soft map before the notation gets loud.</h2>
            <p>
              A generated PDF that feels like notes from a patient tutor: compact, careful, and
              focused on what helps the next page make sense.
            </p>
          </div>

          <div className="landing-guide-preview" aria-label="Guide preview">
            <div className="landing-window-bar">
              <span />
              <span />
              <span />
              <span className="landing-window-title">simply · guide export</span>
            </div>
            <div className="landing-guide-title-row">
              <FileText size={18} />
              <div>
                <strong>Simply guide</strong>
                <p>Concrete Dropout</p>
              </div>
            </div>
            {guideRows.map((row) => (
              <article className="landing-guide-row" key={row.title}>
                <span>{row.label}</span>
                <h3>{row.title}</h3>
                <p>{row.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-launch" id="launch">
        <motion.div
          className="landing-launch-card"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease }}
        >
          <h2>Start reading with Simply.</h2>
          <p>
            Install the Chrome extension, open a research paper on arXiv, and get a calm
            prerequisite guide in minutes.
          </p>
          <MagneticButton
            href={chromeStoreUrl}
            className="landing-btn landing-btn-primary landing-launch-cta"
          >
            Get the Chrome extension
            <ArrowUpRight size={15} />
          </MagneticButton>
        </motion.div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-glow" aria-hidden />
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <span className="landing-footer-logo">simply</span>
            <p>
              A calm reader for dense research papers. Open arXiv, ask for a guide, and keep the
              math without losing the thread.
            </p>
            <p className="landing-footer-meta">© {new Date().getFullYear()} Simply</p>
          </div>
          <div className="landing-footer-links">
            <div>
              <span>Explore</span>
              <a href="#reader">Reader</a>
              <a href="#guide">Guide</a>
              <a href="/library">Your papers</a>
            </div>
            <div>
              <span>Legal</span>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="/security">Security</a>
              <a href="/contact">Contact</a>
            </div>
          </div>
        </div>
        <motion.svg
          className="landing-footer-wordmark"
          initial={{ opacity: 0, y: 60 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          viewBox="0 0 1000 230"
          preserveAspectRatio="none"
          aria-hidden
        >
          <text
            x="0"
            y="225"
            textLength="1000"
            lengthAdjust="spacingAndGlyphs"
            fill="rgba(232,100,42,0.16)"
          >
            simply
          </text>
        </motion.svg>
      </footer>
    </main>
  )
}

function MockReaderPanel() {
  return (
    <div className="landing-mock" aria-label="Simply reader mockup">
      <div className="landing-window-bar">
        <span />
        <span />
        <span />
        <span className="landing-window-title">simply · reader</span>
        <span className="landing-window-badge">
          <span className="landing-eyebrow-dot" />
          Ready
        </span>
      </div>
      <div className="landing-mock-body">
        <div className="landing-mock-sidebar">
          <p className="landing-mock-label">Paper</p>
          <h2>Concrete Dropout</h2>
          <div className="landing-mock-strip">
            Dropout variational inference KL divergence uncertainty gradients...
          </div>
          <div className="landing-mock-tags">
            <span>Define KL divergence</span>
            <span>Explain dropout</span>
            <span>Skim appendix later</span>
          </div>
        </div>
        <div className="landing-mock-main">
          <div className="landing-mock-output">
            <div className="landing-mock-output-head">
              <Highlighter size={15} />
              <span>Before you continue</span>
            </div>
            <h3>Refresh the idea of an expectation.</h3>
            <p>
              In this paper, the expectation is a way to average possible neural network weights.
              You do not need measure theory for the first pass.
            </p>
          </div>
          <aside className="landing-mock-note">
            <span className="landing-window-badge landing-window-badge-green">Calm mode</span>
            <h4>Start with what the paper assumes.</h4>
            <p>Instead of scoring your knowledge, Simply gives you a quiet place to begin.</p>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default App
