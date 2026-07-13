# Simply

Simply is a Chrome extension and web app for turning dense research papers into
beginner-friendly prerequisite guides. It starts with arXiv papers and produces a
compact guide to the probability, statistics, linear algebra, calculus, optimization,
and ML jargon needed to read the paper.

## Apps

- `src/`: Vite React landing page.
- `apps/api`: Express API for text analysis and generated guides.
- `apps/extension`: Manifest V3 Chrome extension popup and content script.

## Local development

```bash
npm install
npm run dev
```

The landing page runs at `http://localhost:5173`.
The API runs at `http://localhost:8787`.

## Extension development

```bash
npm run build --workspace apps/extension
```

Then open Chrome:

1. Go to `chrome://extensions`.
2. Enable Developer Mode.
3. Click “Load unpacked”.
4. Select `apps/extension/dist`.
5. Open an arXiv paper and click the Simply extension.

The extension runs on research-looking webpages and shows a small Simply widget when it
detects paper metadata, a known research host, an abstract, or a PDF-like page. If Chrome
blocks direct text access, the extension can fall back to URL-based backend ingestion.

## Chrome Web Store

```bash
npm run package:extension
```

Output: `public/simply-chrome-extension-<version>.zip`

## API demo

Ingest an arXiv URL, direct PDF URL, or research-paper webpage:

```bash
curl -X POST http://localhost:8787/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://aclanthology.org/2020.acl-main.447/"
  }'
```

Analyze by URL only:

```bash
curl -X POST http://localhost:8787/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://arxiv.org/pdf/1606.08415v3"
  }'
```

Analyze selected or pasted text:

```bash
curl -X POST http://localhost:8787/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Concrete Dropout",
    "url": "https://arxiv.org/pdf/1606.08415v3",
    "text": "dropout variational inference KL divergence gradient sampling"
  }'
```

## AI analysis

Set a Google Gemini API key to get the full prerequisite guide:

```bash
echo "GEMINI_API_KEY=..." > apps/api/.env
```

With a key, the API produces a **rich, pedagogical guide**. Each lesson is built
to teach, not just define: a one-line **hook**, a precise **definition**, an
**intuition**, a **worked example**, and an **"in this paper"** note that ties
the concept back to the source. Math is rendered as **LaTeX**. The guide also
carries a guide-level **overview**, an ordered **reading path** through the
lessons, and `buildsOn` cross-links so each lesson points at the prerequisites
it depends on.

The full guide is viewed as an **HTML page**, opened from the extension or via a
shareable `/guide?id=…` URL. The backend serves the rendered guide from
`GET /api/guide/:id`.

Without a key, the API runs in **basic mode** (deterministic regex concept
detection) so the demo still works offline. Each analysis is cached in memory
per paper, so repeat requests for the same paper are instant.

## Production (GCP)

| Service | URL |
|---------|-----|
| Web (Firebase Hosting) | https://usesimply.us |
| API (Cloud Run) | https://simply-api-k7ux27sa4q-uc.a.run.app |

Redeploy everything:

```bash
./scripts/deploy-all-gcp.sh
```

**Auto-deploy on merge to `main`:** GitHub Actions runs `.github/workflows/deploy.yml`.
See `apps/api/.env.example` for required secrets and env vars.
