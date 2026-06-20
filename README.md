# unfog

Unfog is a Chrome extension and web app for turning dense research papers into
beginner-friendly prerequisite guides. It starts with arXiv papers and produces a
compact guide to the probability, statistics, linear algebra, calculus, optimization,
and ML jargon needed to read the paper.

## Apps

- `src/`: Vite React landing page.
- `apps/api`: Express API for text analysis and generated PDF reports.
- `apps/extension`: Manifest V3 Chrome extension popup and content script.
- `plan.md`: weekend product and technical plan.

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
5. Open an arXiv paper and click the Unfog extension.

For the first starter, selected text works best on PDF pages. Backend PDF ingestion is
planned next so direct arXiv PDF URLs can be parsed reliably.

## API demo

```bash
curl -X POST http://localhost:8787/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Concrete Dropout",
    "url": "https://arxiv.org/pdf/1606.08415v3",
    "text": "dropout variational inference KL divergence gradient sampling"
  }'
```
