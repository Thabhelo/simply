# Simply plan

## Product bet

Research papers are intimidating because they compress years of math into symbols,
jargon, and assumed background. Simply is a Chrome extension that turns the paper you
are reading into a short prerequisite guide: key terms, plain-English explanations,
math concepts to review, and a generated PDF you can keep beside the paper.

## Name

**Simply** is short, calm, and easy to remember. It points at the job users want done:
make the first pass through a dense research paper feel simpler.

## Target user

- Undergraduate and self-taught AI learners reading arXiv papers.
- Engineers moving into AI who forgot probability, calculus, or linear algebra.
- Researchers crossing fields who need quick notation refreshers.

## MVP user flow

1. User opens an arXiv PDF or abstract page.
2. User clicks the Simply Chrome extension.
3. Extension extracts page text, selected text, title, and URL.
4. Backend identifies prerequisite concepts across probability, statistics, linear
   algebra, calculus, optimization, and ML jargon.
5. User sees a guide preview in the extension.
6. User downloads a PDF guide with the prerequisite map and reading plan.

## Three-day weekend build

### Day 1: Starter and demo loop

- Build landing page explaining the value proposition.
- Build Manifest V3 extension popup.
- Add content script for selected text and page text extraction.
- Add local API with deterministic concept detection.
- Add PDF report generation endpoint.
- Use `https://arxiv.org/pdf/1606.08415v3` as the first demo paper.

### Day 2: Real paper intelligence

- Add arXiv URL normalization from `/pdf/` to metadata and source identifiers.
- Add PDF text extraction in the backend.
- Add LLM-generated explanations grouped by prerequisite area.
- Add equation and notation glossary extraction.
- Add caching by paper URL and content hash.

### Day 3: Product polish and launch prep

- Package extension for manual Chrome install.
- Deploy landing page and API.
- Record a short demo on the Concrete Dropout paper.

## Architecture

- `src/`: Vite React landing page.
- `apps/extension`: Chrome extension popup and content script.
- `apps/api`: Express API for analysis and PDF guide generation.

## API contract

`POST /api/analyze`

```json
{
  "title": "Concrete Dropout",
  "url": "https://arxiv.org/pdf/1606.08415v3",
  "text": "paper text or selected passage"
}
```

Returns a title, summary, prerequisite concepts, and next reading steps.

`POST /api/report.pdf`

Accepts the same payload and streams a generated PDF guide.

## Near-term technical risks

- Chrome's built-in PDF viewer can limit direct content-script access, so the first
  extension build supports selected text and arXiv pages while the backend PDF parser
  becomes the reliable path.
- LLM output must cite the source paper and avoid hallucinating prerequisites.
- Generated guides should be compact enough to help reading, not become another paper.

## Monetization

- Free: one-page prerequisite preview.
- Pro: full PDF guide, equation glossary, saved paper library, and guided reading mode.
- Initial price test: $8/month for students, $15/month for engineers.
