# Lesson Generation (rich guide) — Design

**Date:** 2026-06-25
**Scope:** `apps/api` (generation + contract) + `apps/extension` (open-full-guide wiring). The beautiful HTML `/guide` page itself is **Thabhelo's frontend lane** — this design covers the backend that feeds it.
**Goal:** Turn the current flat list of plain lessons into a rich, render-ready **Guide** (pedagogical lessons + overview + ordered path + cross-links, math as LaTeX) that a beautiful HTML page renders — the "what customers pay for" artifact.

## Decisions (locked via brainstorm)

1. **Surface:** an HTML guide page opened in a new tab (KaTeX math + real design), built in Thabhelo's frontend. Backend emits render-ready content + a read-by-id endpoint. pdfkit PDF becomes secondary.
2. **Lesson content (pedagogical):** `{ title, area, concept, hook, definition (LaTeX), intuition, example (LaTeX, with steps), inThisPaper, buildsOn[] }`.
3. **Guide structure:** `overview` + lessons **ordered** into a learning sequence + **cross-links** (`buildsOn`).
4. **Math:** Gemini emits KaTeX-compatible LaTeX; the page renders it (`throwOnError:false`). Not validated server-side.
5. **Provider:** unchanged — Google Gemini Flash (`@google/genai`), with the regex `basicMode` fallback.

## Architecture / data flow

All backend changes in `apps/api/src/server.ts` (+ `analysis.ts` for pure helpers). Ingestion unchanged.

```
analyzePaper(paper)                       ← cached by content-hash (= the guide id)
  ├─ detectGuide(paper)   → Gemini, ONE call over the whole paper:
  │     { overview, prerequisites: [{ area, concept, evidenceQuote, whyAssumed, buildsOn[] }] }
  │     (array order = reading sequence; buildsOn = cross-links among the listed concepts)
  ├─ teach each prereq IN PARALLEL → Gemini:
  │     Lesson { title, hook, definition, intuition, example, inThisPaper }   (math = LaTeX)
  └─ assemble Guide { id, paperTitle, summary, mode, overview, lessons[], concepts[] }
        lessons[i] = { ...teachLesson, area, concept, buildsOn }   // area/concept/buildsOn carried from prereq
```

Detect produces overview + ordering + buildsOn because that one call sees all prerequisites at once. Teach fills pedagogical content per prereq (parallel fan-out, unchanged).

## Stage 1 — detectGuide (Gemini structured output)

`responseSchema` (Gemini `Type`-typed):
```
overview: STRING
prerequisites: ARRAY of {
  area: STRING (enum AREAS), concept: STRING, evidenceQuote: STRING,
  whyAssumed: STRING, buildsOn: ARRAY of STRING
}   // cap ~6
```
Prompt: list assumed prereqs, quote the exact span, **order by what to learn first**, set `buildsOn` only to other concepts in the list, write a 2-4 sentence `overview` of what the paper assumes and how to prepare. Never invent.

## Stage 2 — teach (parallel, Gemini structured output per prereq)

`responseSchema`: `{ title, hook, definition, intuition, example, inThisPaper }` (all STRING; math as LaTeX).
Prompt: compact pedagogical refresher — one plain-language hook/analogy, a precise definition (LaTeX), 2-3 sentences of intuition, one worked mini-example with steps (LaTeX), one line tying it to the paper (the `evidenceQuote`). KaTeX-compatible LaTeX only: inline `$ … $` / `\( … \)`, display `$$ … $$`. Calm, not a textbook chapter.

`area`, `concept`, `buildsOn` are **carried from the prereq**, merged into the final lesson (consistent graph; no wasted tokens).

## Contract & caching

`/api/analyze` response (additive — current `concepts[]` readers keep working):
```ts
{
  id,                         // content-hash; used to fetch the guide page
  paperTitle, summary, mode,  // 'ai' | 'basic'
  overview,
  lessons: [{ title, area, concept, hook, definition, intuition, example, inThisPaper, buildsOn[] }],
  concepts: ConceptCard[],    // projected: {area, term:concept, plainEnglish:intuition, whyItMatters:inThisPaper}
  ingestion: {...}
}
```

New **`GET /api/guide/:id`** → cached `Guide` or `404`.

**Cache:** one `guideCache: Map<id, Guide>` storing the last guide per id (ai or basic), but **skip recompute only when the stored entry is `ai`**. → ai reused (cost saving); basic always recomputed (so adding a key overwrites basic with ai on next analyze); page can always fetch what analyze just produced; no stale-basic-after-key. In-memory → ids expire on restart (persistence = follow-up).

## Extension wiring

- `apps/extension/src/content.ts` (and popup): "Analyze" already calls `/api/analyze` and now receives `id`.
- "Open full guide" changes from POSTing pdfkit to **`window.open(`${webBase}/guide?id=${id}`)`**. Add a `webBase` constant (dev `http://localhost:5173`) next to `apiBase` — same hardcoded-for-now caveat as the deploy notes; must be configurable for prod.
- pdfkit `/api/report.pdf` stays (secondary; a "print the HTML page" export is the future replacement).

## Error handling

- No key / detect throws / empty detect → `basicMode` Guide (startup + per-request logs say why).
- One teach call fails → `Promise.allSettled` degrades just that lesson (from the prereq; `buildsOn` preserved); guide stays `ai`.
- `GET /api/guide/:id` miss → `404`; page shows "guide expired — re-analyze".
- Hallucinated `buildsOn` (concept not in list) → backend **filters** to present concepts only (pure, testable) so links never dangle.
- Malformed LaTeX → not server-validated; prompt for strict KaTeX subset; page renders with `throwOnError:false`. Flag for Thabhelo.

## basic-mode Guide

`overview` = generic line; lessons from the regex detector (`hook`/`definition`/`example` empty, `intuition`=`inThisPaper`=`whyAssumed`, `buildsOn:[]`); `concepts` projected; `mode:'basic'`. Page still renders, plainer.

## Testing

Pure functions (vitest):
- `concepts` projection from enriched lessons (back-compat shape).
- `basicMode` Guide shape (overview present, lesson fields, `buildsOn:[]`, `mode:'basic'`).
- `buildsOn` filter — drops references to concepts not in the set.
- Guide assembly — merges teach lesson + prereq `{area, concept, buildsOn}` in detect order.

LLM paths: manual smoke with a real key (`mode:'ai'`, non-empty overview, lessons carry hook/definition/example, valid buildsOn, LaTeX present). Mocking Gemini out of scope.

Endpoint: smoke `analyze → id → GET /api/guide/:id` returns same guide; bad id → 404.

## Out of scope / follow-ups

- The `/guide` HTML page design + KaTeX rendering (Thabhelo's frontend).
- Persistent cache (ids survive restart); HTML→PDF export to replace pdfkit.
- Gemini-native PDF ingestion (feed the PDF, not pdf-parse text) — separate cheap upgrade.
- innerHTML XSS escaping in the extension; cuntext index update.
