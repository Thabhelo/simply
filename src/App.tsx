import './App.css'

function App() {
  return (
    <main className="page">
      <nav className="nav" aria-label="Main navigation">
        <a className="brand" href="/">
          unfog
        </a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#build">Weekend build</a>
          <a className="pill" href="https://arxiv.org/pdf/1606.08415v3" target="_blank">
            Try paper
          </a>
        </div>
      </nav>

      <section className="hero">
        <p className="eyebrow">Chrome extension for research papers</p>
        <h1>Unfog the math hiding inside scary papers.</h1>
        <p className="hero-copy">
          Press one button on an arXiv paper and get a compact guide to the statistics,
          probability, linear algebra, and calculus you need before the notation starts
          fighting back.
        </p>
        <div className="hero-actions">
          <a className="primary" href="#waitlist">
            Join the early list
          </a>
          <a className="secondary" href="#demo">
            See the sample output
          </a>
        </div>
      </section>

      <section className="proof-grid" id="demo">
        <article>
          <span>1</span>
          <h2>Extract the paper</h2>
          <p>
            The extension reads the current PDF page, arXiv URL, selected text, or pasted
            abstract and sends it to the local analysis API.
          </p>
        </article>
        <article>
          <span>2</span>
          <h2>Map the prerequisites</h2>
          <p>
            The backend identifies concepts like KL divergence, entropy, gradients,
            eigenvectors, sampling, Bayesian inference, and optimization.
          </p>
        </article>
        <article>
          <span>3</span>
          <h2>Export a guide</h2>
          <p>
            Unfog produces a beginner-friendly PDF study sheet with key terms, plain
            English summaries, and learning links.
          </p>
        </article>
      </section>

      <section className="sample">
        <div>
          <p className="eyebrow">Sample for “Concrete Dropout”</p>
          <h2>Before reading, learn these first.</h2>
          <p>
            The starter backend ships with deterministic concept detection so the demo is
            usable immediately. Next we add paper ingestion, equation extraction, and model
            generated explanations.
          </p>
        </div>
        <div className="report-card">
          <h3>Guide Preview</h3>
          <ul>
            <li>Bayesian neural networks: uncertainty over model weights.</li>
            <li>Dropout: randomly masking activations to regularize learning.</li>
            <li>KL divergence: distance-like measure between probability distributions.</li>
            <li>Variational inference: turning inference into optimization.</li>
          </ul>
        </div>
      </section>

      <section className="build" id="build">
        <p className="eyebrow">Three-day sprint</p>
        <h2>Weekend scope</h2>
        <div className="timeline">
          <p>
            <strong>Day 1:</strong> extension, landing page, local API, concept taxonomy.
          </p>
          <p>
            <strong>Day 2:</strong> arXiv ingestion, LLM explanations, generated PDF guide.
          </p>
          <p>
            <strong>Day 3:</strong> payments waitlist, polish, deploy, Chrome package.
          </p>
        </div>
      </section>

      <section className="waitlist" id="waitlist">
        <h2>Want the first build?</h2>
        <form>
          <input type="email" placeholder="you@example.com" aria-label="Email address" />
          <button type="submit">Get access</button>
        </form>
        <p>Local starter today. Real paper unfogging next.</p>
      </section>
    </main>
  )
}

export default App
