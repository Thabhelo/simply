# AI Analysis Pipeline — Design

**Date:** 2026-06-23
**Scope:** `apps/api` (backend) + `apps/extension`. Frontend is owned by Thabhelo.
**Goal:** Replace the deterministic 7-regex concept detector with a real AI pipeline that
turns a research paper into beginner-friendly *prerequisite refresher lessons*.

## Decisions (locked)

1. **Two-stage pipeline:** detect prerequisites → teach one lesson per prerequisite.
2. **Lesson model (refresher):** `{ area, concept, title, intuition, formula?, example, inThisPaper }`.
3. **Models (cost-minimal):** Haiku 4.5 for **both** detect and teach, as named constants so
   detect can be bumped to Opus 4.8 with a one-line change if quality needs it.
4. **Fallback:** keep the existing regex detector as `basicMode`; never hard-fail.
5. **Caching:** in-memory, keyed by `sha256(title+url+text)`; cache `ai` results only.

## Cost levers (minimal cost was an explicit requirement)

- Haiku for both stages (5× cheaper than Opus on the one expensive call).
- **Cap detect input** to `~14k` chars (`maxDetectChars`): title + abstract + leading slice.
  Prerequisites surface in the abstract/intro; no need to send the full 120k chars.
- Teach calls receive only `{ area, concept, evidenceQuote, whyAssumed, paperTitle }` —
  never the paper text — so they stay cheap regardless of paper length.
- Content-hash cache makes repeat runs of the same paper (e.g. every demo of Concrete
  Dropout) cost zero.
- Parallel per-concept teach is kept (batching would save ~$0.001/paper and lose streaming).

## Architecture / data flow

All changes live in `apps/api/src/server.ts`. Ingestion is untouched.

```
resolvePaperInput(input)              ← UNCHANGED → ResolvedPaper{title,text,...}
        ▼
analyzePaper(paper)                   ← becomes async; orchestrates
        ├─ if (!client) → basicMode(paper)
        ├─ try:
        │    1. detectPrerequisites(paper)   → Haiku, structured → Prerequisite[]
        │       (empty result → basicMode)
        │    2. Promise.allSettled(prereqs.map(generateLesson)) → Lesson[] (Haiku, parallel)
        │       (a rejected lesson degrades to a minimal card)
        │    3. assemble → AnalysisResult
        │  catch → basicMode(paper)
        ▼
/api/analyze  &  /api/report.pdf  &  fallback all consume AnalysisResult
```

## Stage 1 — detect (`detectPrerequisites`)

- One Haiku call, structured output.
- Input: `[title, abstract, paper.text.slice(0, maxDetectChars)].join("\n\n")`.
- Schema: `{ prerequisites: [{ area(enum6), concept, evidenceQuote, whyAssumed }] }`,
  `additionalProperties:false`, all four required.
- Prompt: list the prereq math/ML concepts the paper *assumes*; quote the exact span that
  assumes each; never invent; cap ~6, ordered by how much they block a first pass.
- `area` enum = the fixed 6 (`Probability, Statistics, Linear algebra, Calculus,
  Optimization, ML`) — shared with PDF grouping and the regex fallback.
- `evidenceQuote` is the anti-hallucination anchor and feeds `inThisPaper`.

## Stage 2 — teach (`generateLesson`)

- One Haiku call per prerequisite, fired with `Promise.allSettled`.
- Input: `{ area, concept, evidenceQuote, whyAssumed, paperTitle }` (no paper text).
- Schema = the Lesson model; `formula` optional, the rest required.
- Prompt: compact refresher — a few sentences of intuition, one key formula if any, one
  worked mini-example, one line tying it to the paper (`evidenceQuote`). Calm, not a textbook.
- Failure of one call → minimal card from the prerequisite (`area`, `concept`, `whyAssumed`).

## API contract (additive, non-breaking)

`/api/analyze` response:

```ts
{
  title, url, summary,
  mode: "ai" | "basic",        // NEW
  lessons: Lesson[],           // NEW — the real product
  concepts: ConceptCard[],     // KEPT — projected from lessons for back-compat
  nextSteps: string[],
  ingestion: { source, textLength, arxivId?, pdfUrl? }   // unchanged
}
```

`concepts` projection (keeps Thabhelo's frontend + current extension working):
```ts
concepts = lessons.map(l => ({
  area: l.area, term: l.concept,
  plainEnglish: l.intuition, whyItMatters: l.inThisPaper,
}))
```

- **`report.pdf`**: extend the existing pdfkit loop to render each lesson as a section
  (title, intuition, formula if present, example, "in this paper"), grouped by `area`.
- **Extension (our lane):** update `popup.ts` `renderAnalysis()` and `content.ts`
  `renderConceptList()` to render `lessons`; `AnalysisResponse` type gains `lessons` + `mode`.

## Fallback, caching & config

```ts
const apiKey = process.env.ANTHROPIC_API_KEY
const client = apiKey ? new Anthropic({ apiKey }) : null
const DETECT_MODEL = "claude-haiku-4-5"
const TEACH_MODEL  = "claude-haiku-4-5"
const cache = new Map<string, AnalysisResult>()   // key = sha256(title+url+text)
```

- Add `@anthropic-ai/sdk` to `apps/api/package.json`. `.env` (gitignored) holds the key;
  README gets a one-line note.
- `basicMode(paper)` reuses the existing regex `concepts[]` + matching logic, returns the
  same response shape with `mode:"basic"` and `lessons` built from the regex concepts.
- Cache check before detect; populate after a successful `ai` result. **Never cache
  `basic`** (so an outage fallback isn't served after the key is fixed). Optional FIFO cap.
  Comment flags "swap for Redis if multi-instance" (matches plan.md day-2 caching).

## Error handling

- No key → basic. Detect failure → basic. Empty prerequisites → basic.
- Single teach failure → degraded card (`allSettled`). Stray `area` → defensive filter.
- Use typed SDK errors (`Anthropic.RateLimitError`, `Anthropic.APIError`); **no in-request
  retries** (would add latency to a live extension click).

## Testing (pragmatic — no test setup exists yet)

- Unit: `detectPrerequisitesBasic` regex (no network) — protects the fallback.
- Unit: `concepts` projection — guarantees back-compat shape for Thabhelo.
- Manual smoke (curl in README) on Concrete Dropout with a real key → assert `mode:"ai"`
  and `lessons.length > 0`.
- Full-pipeline test with a mocked Anthropic client: **follow-up, not this PR**.

## Out of scope

- Equation/notation glossary extraction, saved library, guided reading (later plan.md items).
- Persistent cache, mocked-client integration tests, deploy wiring (see fragments/deploy.cuntext).
