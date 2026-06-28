# Lesson Generation (rich Guide) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this task-by-task.

**Goal:** Replace the flat lesson list with a rich **Guide** — pedagogical lessons (hook/definition/intuition/example/inThisPaper, math as LaTeX), a top-level `overview`, ordered reading path, and `buildsOn` cross-links — exposed for a beautiful HTML `/guide` page (Thabhelo's frontend) to render.

**Architecture:** Backend in `apps/api/src/{types.ts,analysis.ts,server.ts}`. Two-stage Gemini pipeline stays: `detectGuide` (one call → overview + prerequisites with buildsOn, ordered) → parallel `teach` (pedagogical lesson per prereq) → assemble `Guide`. Cached by content-hash (= the guide `id`); new `GET /api/guide/:id`. Regex `basicMode` still the fail-soft fallback. Extension "Open full guide" opens `${webBase}/guide?id=<id>` instead of the pdfkit PDF.

**Tech Stack:** TypeScript ESM (NodeNext, `.js` import extensions), Express 5, `@google/genai` (Gemini Flash, `Type`-typed `responseSchema`), `zod` (request validation only), `vitest`, `pdfkit` (secondary now). Design: `docs/plans/2026-06-25-lesson-generation-design.md`.

**Conventions:** no semicolons, single quotes, 2-space indent. Build: `npm run build --workspace apps/api`. Tests: `npm run test --workspace apps/api`. `apps/api/.env` has `GEMINI_API_KEY` (gitignored) → AI mode is live; smoke it in Task 6.

**Build-state note:** changing the `Lesson`/`Prerequisite` shape ripples across files. **vitest (pure helpers) goes green at Task 1; the full `apps/api` tsc build goes green at Task 4; the extension build at Task 5.** Each task still commits; reviewers verify at the stated checkpoints.

---

### Task 1: Types + pure helpers (Guide, enriched Lesson, buildsOn)

**Files:** Modify `apps/api/src/types.ts`, `apps/api/src/analysis.ts`, `apps/api/src/analysis.test.ts`

**Step 1: Update `types.ts`** — enrich `Prerequisite`/`Lesson`, add `Guide`, alias `AnalysisResult`:
```ts
export type Area = 'Probability' | 'Statistics' | 'Linear algebra' | 'Calculus' | 'Optimization' | 'ML'
export const AREAS: Area[] = ['Probability', 'Statistics', 'Linear algebra', 'Calculus', 'Optimization', 'ML']
export const maxLessons = 6

export type Prerequisite = { area: Area; concept: string; evidenceQuote: string; whyAssumed: string; buildsOn: string[] }
export type Lesson = {
  area: Area; concept: string; title: string
  hook: string; definition: string; intuition: string; example: string; inThisPaper: string
  buildsOn: string[]
}
export type ConceptCard = { area: Area; term: string; plainEnglish: string; whyItMatters: string }
export type Guide = {
  id: string; title: string; url?: string; summary: string; mode: 'ai' | 'basic'
  overview: string; lessons: Lesson[]; concepts: ConceptCard[]; nextSteps: string[]
}
export type AnalysisResult = Guide // back-compat alias
```
(`formula` is gone — `definition` now carries the key formula in LaTeX.)

**Step 2: Write/adjust failing tests** in `analysis.test.ts`. Update the `lessonsFromBasic` and `projectConcepts` fixtures to the new `Lesson` shape, and add tests for a new `filterBuildsOn` helper:
```ts
import { detectBasic, projectConcepts, nextSteps, lessonsFromBasic, buildDetectInput, cacheKey, filterBuildsOn } from './analysis.js'

describe('lessonsFromBasic', () => {
  it('maps prerequisites to the enriched basic Lesson shape', () => {
    const lessons = lessonsFromBasic([
      { area: 'ML', concept: 'Dropout', evidenceQuote: '', whyAssumed: 'regularizes', buildsOn: [] },
    ])
    expect(lessons[0]).toEqual({
      area: 'ML', concept: 'Dropout', title: 'Dropout',
      hook: '', definition: '', intuition: 'regularizes', example: '', inThisPaper: 'regularizes',
      buildsOn: [],
    })
  })
})

describe('projectConcepts', () => {
  it('maps a Lesson to the legacy ConceptCard shape', () => {
    const cards = projectConcepts([
      { area: 'ML', concept: 'Dropout', title: 'Dropout', hook: 'h', definition: 'd', intuition: 'Hide units.', example: 'x', inThisPaper: 'used as regularizer', buildsOn: [] },
    ])
    expect(cards[0]).toEqual({ area: 'ML', term: 'Dropout', plainEnglish: 'Hide units.', whyItMatters: 'used as regularizer' })
  })
})

describe('detectBasic', () => {
  it('sets buildsOn to [] on every prerequisite', () => {
    expect(detectBasic('KL divergence and gradients').every((p) => Array.isArray(p.buildsOn) && p.buildsOn.length === 0)).toBe(true)
  })
})

describe('filterBuildsOn', () => {
  it('drops buildsOn references to concepts not in the set', () => {
    const prereqs = [
      { area: 'Linear algebra', concept: 'Vectors', evidenceQuote: '', whyAssumed: '', buildsOn: [] },
      { area: 'Calculus', concept: 'Gradient', evidenceQuote: '', whyAssumed: '', buildsOn: ['Vectors', 'Ghost concept'] },
    ] as const
    const out = filterBuildsOn(prereqs as never)
    expect(out[1].buildsOn).toEqual(['Vectors'])
  })
})
```
(Keep the existing `buildDetectInput`/`cacheKey` tests as-is.)

**Step 3: Run tests → FAIL** (`filterBuildsOn` not exported; old fixtures mismatch). Run: `npm run test --workspace apps/api`.

**Step 4: Implement in `analysis.ts`.** Update `detectBasic` to include `buildsOn: []`; rewrite `lessonsFromBasic`; add `filterBuildsOn`. `projectConcepts`/`nextSteps`/`buildDetectInput`/`cacheKey` unchanged.
```ts
export function detectBasic(text: string): Prerequisite[] {
  const matched = concepts.filter((c) => c.triggers.some((t) => t.test(text)))
  const chosen = matched.length > 0 ? matched.slice(0, maxLessons) : concepts.slice(0, basicFallbackCount)
  return chosen.map((c) => ({ area: c.area, concept: c.term, evidenceQuote: '', whyAssumed: c.whyItMatters, buildsOn: [] }))
}

export function lessonsFromBasic(prereqs: Prerequisite[]): Lesson[] {
  return prereqs.map((p) => ({
    area: p.area, concept: p.concept, title: p.concept,
    hook: '', definition: '', intuition: p.whyAssumed, example: '', inThisPaper: p.whyAssumed,
    buildsOn: p.buildsOn ?? [],
  }))
}

// Keep buildsOn references pointing only at concepts that are actually in the prerequisite set.
export function filterBuildsOn(prereqs: Prerequisite[]): Prerequisite[] {
  const names = new Set(prereqs.map((p) => p.concept))
  return prereqs.map((p) => ({ ...p, buildsOn: (p.buildsOn ?? []).filter((b) => b !== p.concept && names.has(b)) }))
}
```

**Step 5: Run tests → PASS.** Run: `npm run test --workspace apps/api`. (Full `tsc` build is expected RED here — server.ts still uses the old shapes; fixed in Task 4. Do NOT run the full build as a gate this task.)

**Step 6: Commit**
```bash
git add apps/api/src/types.ts apps/api/src/analysis.ts apps/api/src/analysis.test.ts
git commit -m "Enrich Lesson/Prerequisite, add Guide type + filterBuildsOn (tests)"
```

---

### Task 2: detectGuide (Gemini — overview + ordered prerequisites with buildsOn)

**Files:** Modify `apps/api/src/server.ts` (replace `prereqResponseSchema`/`DETECT_SYSTEM`/`detectPrerequisites`)

**Step 1:** Replace the detect schema + function. Import `filterBuildsOn` from `./analysis.js` (merge into the existing analysis import line). New schema + function:
```ts
const detectResponseSchema = {
  type: Type.OBJECT,
  properties: {
    overview: { type: Type.STRING },
    prerequisites: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          area: { type: Type.STRING, enum: AREAS as unknown as string[] },
          concept: { type: Type.STRING },
          evidenceQuote: { type: Type.STRING },
          whyAssumed: { type: Type.STRING },
          buildsOn: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['area', 'concept', 'evidenceQuote', 'whyAssumed', 'buildsOn'],
      },
    },
  },
  required: ['overview', 'prerequisites'],
}

const DETECT_SYSTEM =
  'You help a reader who is about to read a research paper. Identify the prerequisite math and ML concepts the paper assumes the reader already knows. Order them by what to learn first. For each: quote the exact span from the text that shows the assumption (evidenceQuote), say why the reader needs it (whyAssumed), and set buildsOn to the concepts IN THIS LIST that it depends on (use the exact concept strings; empty if none). Also write a 2-4 sentence overview of what the paper assumes and how to prepare. Only list concepts that actually appear — never invent. List at most 6 prerequisites.'

type DetectResult = { overview: string; prerequisites: Prerequisite[] }

async function detectGuide(paper: ResolvedPaper): Promise<DetectResult> {
  if (!genai) return { overview: '', prerequisites: [] }
  const input = buildDetectInput(paper.title, paper.text, maxDetectChars)
  const response = await genai.models.generateContent({
    model: DETECT_MODEL,
    contents: input,
    config: { systemInstruction: DETECT_SYSTEM, responseMimeType: 'application/json', responseSchema: detectResponseSchema },
  })
  const text = response.text
  if (!text) {
    console.warn('Simply: detect returned no structured output')
    return { overview: '', prerequisites: [] }
  }
  const parsed = JSON.parse(text) as { overview?: string; prerequisites?: Prerequisite[] }
  const prerequisites = filterBuildsOn(
    (parsed.prerequisites ?? []).filter((p) => AREAS.includes(p.area)).slice(0, maxLessons),
  )
  return { overview: parsed.overview ?? '', prerequisites }
}
```
(`buildDetectInput`/`DETECT_MODEL`/`maxDetectChars` already exist. The old `detectPrerequisites` is removed.)

**Step 2: Typecheck note** — `npm run build --workspace apps/api` is still expected RED (teach/assemble not updated yet). Just confirm no NEW syntax errors in the detect block by eye; build goes green in Task 4.

**Step 3: Commit**
```bash
git add apps/api/src/server.ts
git commit -m "detectGuide: Gemini returns overview + ordered prerequisites with buildsOn"
```

---

### Task 3: teach (pedagogical lesson) + assembly merge

**Files:** Modify `apps/api/src/server.ts` (`lessonResponseSchema`, `generateLesson`, `teachAll`)

**Step 1:** Replace the lesson schema + teach functions. The Gemini call returns the *generated* fields only; `area`/`concept`/`buildsOn` are merged from the prereq.
```ts
const lessonResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    hook: { type: Type.STRING },
    definition: { type: Type.STRING },
    intuition: { type: Type.STRING },
    example: { type: Type.STRING },
    inThisPaper: { type: Type.STRING },
  },
  required: ['title', 'hook', 'definition', 'intuition', 'example', 'inThisPaper'],
}

const TEACH_SYSTEM =
  'Write a compact pedagogical refresher lesson for someone about to read a research paper. Include: a one-sentence plain-language hook or analogy; a precise definition; 2-3 sentences of intuition; one short worked example with steps; and one line on how the concept shows up in this paper. Write ALL math as KaTeX-compatible LaTeX — inline as $ ... $ and display as $$ ... $$. Calm and clear — a refresher, not a textbook chapter.'

type TeachLesson = { title: string; hook: string; definition: string; intuition: string; example: string; inThisPaper: string }

async function generateLesson(p: Prerequisite, paperTitle: string): Promise<Lesson> {
  if (!genai) throw new Error('no client')
  const response = await genai.models.generateContent({
    model: TEACH_MODEL,
    contents: `Concept: ${p.concept}\nArea: ${p.area}\nPaper: ${paperTitle}\nThe paper assumes (evidence): "${p.evidenceQuote}"\nWhy the reader needs it: ${p.whyAssumed}`,
    config: { systemInstruction: TEACH_SYSTEM, responseMimeType: 'application/json', responseSchema: lessonResponseSchema },
  })
  const text = response.text
  if (!text) throw new Error('empty lesson')
  const t = JSON.parse(text) as TeachLesson
  return { ...t, area: p.area, concept: p.concept, buildsOn: p.buildsOn }
}

async function teachAll(prereqs: Prerequisite[], paperTitle: string): Promise<Lesson[]> {
  const settled = await Promise.allSettled(prereqs.map((p) => generateLesson(p, paperTitle)))
  return settled.map((res, i) => {
    if (res.status === 'fulfilled') return res.value
    const p = prereqs[i]
    return {
      area: p.area, concept: p.concept, title: p.concept,
      hook: '', definition: '', intuition: p.whyAssumed, example: '', inThisPaper: p.evidenceQuote || p.whyAssumed,
      buildsOn: p.buildsOn,
    }
  })
}
```

**Step 2:** Build still expected RED until Task 4 (analyzePaper/routes). Eyeball the block; no new errors.

**Step 3: Commit**
```bash
git add apps/api/src/server.ts
git commit -m "teach: pedagogical lesson schema/prompt; merge area/concept/buildsOn"
```

---

### Task 4: Assemble Guide + id cache + GET /api/guide/:id + routes + PDF  → BUILD GREEN

**Files:** Modify `apps/api/src/server.ts` (`aiMode`, `basicMode`, `analyzePaper`, cache, `/api/analyze`, new `/api/guide/:id`, `/api/report.pdf`)

**Step 1: basicMode + aiMode now take an `id` and return a `Guide` with `overview`.**
```ts
function basicMode(paper: ResolvedPaper, id: string): Guide {
  const haystack = `${paper.title}\n${paper.url ?? ''}\n${paper.text}`
  const lessons = lessonsFromBasic(detectBasic(haystack))
  return {
    id,
    title: paper.title?.trim() || 'Untitled research paper',
    url: paper.url,
    summary: 'Simply found the prerequisite math and ML ideas that are likely to block a first pass through this paper.',
    mode: 'basic',
    overview: 'Set GEMINI_API_KEY for full AI lessons. These are the prerequisite areas this paper leans on.',
    lessons, concepts: projectConcepts(lessons), nextSteps,
  }
}

async function aiMode(paper: ResolvedPaper, id: string): Promise<Guide> {
  const { overview, prerequisites } = await detectGuide(paper)
  if (prerequisites.length === 0) {
    console.warn('Simply: detect returned no prerequisites — using basic mode')
    return basicMode(paper, id)
  }
  const lessons = await teachAll(prerequisites, paper.title)
  return {
    id,
    title: paper.title?.trim() || 'Untitled research paper',
    url: paper.url,
    summary: 'Simply built short refresher lessons for the prerequisite ideas this paper assumes.',
    mode: 'ai',
    overview,
    lessons, concepts: projectConcepts(lessons), nextSteps,
  }
}
```
Import `Guide` type from `./types.js` (it's aliased to AnalysisResult; either name compiles, prefer `Guide`).

**Step 2: Cache by id; skip recompute only for ai.** Replace the old `analysisCache`/`analyzePaper`:
```ts
const guideCache = new Map<string, Guide>()
const maxCacheEntries = 200

async function analyzePaper(paper: ResolvedPaper): Promise<Guide> {
  const id = cacheKey(paper.title, paper.url, paper.text)
  const cached = guideCache.get(id)
  if (cached && cached.mode === 'ai') return cached // reuse ai; always recompute basic
  let guide: Guide
  if (!genai) {
    guide = basicMode(paper, id)
  } else {
    try {
      guide = await aiMode(paper, id)
    } catch (error) {
      console.error('Simply: AI analysis failed — using basic mode:', error instanceof Error ? error.message : error)
      guide = basicMode(paper, id)
    }
  }
  if (guideCache.size >= maxCacheEntries) {
    const oldest = guideCache.keys().next().value
    if (oldest !== undefined && oldest !== id) guideCache.delete(oldest)
  }
  guideCache.set(id, guide) // store last guide (ai or basic) so GET /api/guide/:id can serve it
  return guide
}
```

**Step 3: `/api/analyze`** — spread the guide (now includes `id`, `overview`) + ingestion. The success branch:
```ts
const paper = await resolvePaperInput(parsed.data)
const guide = await analyzePaper(paper)
response.json({ ...guide, ingestion: { source: paper.source, textLength: paper.text.length, arxivId: paper.arxivId, pdfUrl: paper.pdfUrl } })
```

**Step 4: New `GET /api/guide/:id`** (place near the other routes):
```ts
app.get('/api/guide/:id', (request, response) => {
  const guide = guideCache.get(request.params.id)
  if (!guide) {
    response.status(404).json({ error: 'Guide not found — re-analyze the paper.' })
    return
  }
  response.json(guide)
})
```

**Step 5: `/api/report.pdf`** — update the lesson rendering to the new fields (it must compile; pdfkit is secondary). Replace the per-lesson block to use `definition`/`hook` instead of `formula`, and render `overview`:
```ts
const paper = await resolvePaperInput(parsed.data)
const report = await analyzePaper(paper)
const document = new PDFDocument({ margin: 48 })
response.setHeader('Content-Type', 'application/pdf')
response.setHeader('Content-Disposition', 'attachment; filename="simply-guide.pdf"')
document.pipe(response)
document.fontSize(26).fillColor('#101827').text(`Simply Guide: ${report.title}`, { lineGap: 8 })
document.moveDown()
document.fontSize(12).fillColor('#667085').text(report.overview || report.summary)
if (report.mode === 'basic') document.moveDown(0.5).fontSize(10).fillColor('#c24a1a').text('Basic mode — set GEMINI_API_KEY for full AI lessons.')
document.moveDown()
report.lessons.forEach((lesson, index) => {
  document.fillColor('#5b4bff').fontSize(10).text(lesson.area.toUpperCase())
  document.fillColor('#101827').fontSize(16).text(`${index + 1}. ${lesson.title}`)
  if (lesson.hook) document.fillColor('#344054').fontSize(12).text(lesson.hook)
  if (lesson.definition) document.fillColor('#101827').fontSize(11).text(`Definition: ${lesson.definition}`)
  document.fillColor('#344054').fontSize(12).text(lesson.intuition)
  if (lesson.example) document.fillColor('#344054').fontSize(12).text(`Example: ${lesson.example}`)
  document.fillColor('#667085').fontSize(11).text(`In this paper: ${lesson.inThisPaper}`)
  document.moveDown()
})
document.fillColor('#101827').fontSize(16).text('Reading plan')
report.nextSteps.forEach((step) => document.fillColor('#344054').fontSize(12).text(`- ${step}`))
document.end()
```
Keep the existing `headersSent` guard in the catch.

**Step 6: Build GREEN + tests + basic smoke.**
- `npm run build --workspace apps/api` → **exit 0** (the whole api now compiles).
- `npm run test --workspace apps/api` → 10+/pass.
- Basic-or-AI smoke (key is present, so this exercises AI): start `npm run dev:api`; the startup log should say `AI mode enabled (gemini-2.5-flash)`. Then:
```bash
curl -s -X POST http://localhost:8787/api/analyze -H 'Content-Type: application/json' -d '{"title":"T","text":"We use KL divergence, gradients, and dropout."}' | python3 -m json.tool | head -40
```
Confirm an `id`, `overview`, enriched `lessons` (hook/definition/buildsOn), and `concepts`. Then `curl -s http://localhost:8787/api/guide/<id>` returns the same guide; a bogus id → 404. Stop the server.

**Step 7: Commit**
```bash
git add apps/api/src/server.ts
git commit -m "Assemble Guide with id + overview; guideCache + GET /api/guide/:id; PDF + routes to new shape"
```

---

### Task 5: Extension — open full guide by id; teaser on new lesson shape

**Files:** Modify `apps/extension/src/content.ts`, `apps/extension/src/popup.ts`; repackage zip

**Step 1: `content.ts`** — add `webBase`, update `AnalysisResponse` (Lesson new shape + `id` + `overview`), store `id`, and make "Open full guide" open the page:
- Add near `apiBase`: `const webBase = 'http://localhost:5173' // dev frontend; configurable for prod (see deploy notes)`
- Update the `lessons` item type to `{ area, concept, title, hook, definition, intuition, example, inThisPaper, buildsOn }` and add `id?: string`, `overview?: string` to `AnalysisResponse`.
- In the analyze handler, capture `analysis.id` into a `lastGuideId` variable alongside `lastPayload`.
- Replace the open-guide handler body: instead of POSTing `/api/report.pdf` + blob, do:
```ts
const id = lastGuideId
if (!id) { statusEl.textContent = 'Analyze first.'; return }
window.open(`${webBase}/guide?id=${encodeURIComponent(id)}`, '_blank', 'noopener')
statusEl.textContent = 'Opened the full guide in a new tab.'
```
- The teaser (`renderLessonTeaser`) already shows `area`+`title` — unchanged (no `formula` reference). Confirm nothing references the removed `formula`.

**Step 2: `popup.ts`** — update its local `Lesson` type to the new shape (drop `formula`, add `hook`/`definition`/`buildsOn`), add `id?`/`overview?` to `AnalysisResponse`. In `renderAnalysis`, replace the `${l.formula ? ...}` line with the definition (rendered as plain text; the popup is a teaser, not the KaTeX page):
```ts
${l.definition ? `<code class="formula">${l.definition}</code>` : ''}
```
(Keeps the existing `.formula` CSS for a monospace definition block — fine for a teaser.) Everything else stays.

**Step 3: Build + repackage zip**
```bash
npm run build --workspace apps/extension
rm -f public/simply-chrome-extension.zip && (cd apps/extension/dist && zip -qr ../../../public/simply-chrome-extension.zip .)
```
Expect a clean build and a refreshed zip.

**Step 4: Commit**
```bash
git add apps/extension/src/content.ts apps/extension/src/popup.ts public/simply-chrome-extension.zip
git commit -m "Extension: open full guide page by id; render new lesson shape"
```

---

### Task 6: Docs + full verification + AI-mode smoke

**Files:** Modify `README.md`

**Step 1:** Update the README "AI analysis" section to mention the guide page + that lessons are pedagogical with rendered math on the `/guide` page. Keep the `GEMINI_API_KEY` instruction.

**Step 2: Full suite**
```bash
npm run test --workspace apps/api && npm run build --workspace apps/api && npm run build --workspace apps/extension
```
All green.

**Step 3: AI-mode smoke (key present).** `npm run dev:api`, confirm startup `AI mode enabled`, then:
```bash
curl -s -X POST http://localhost:8787/api/analyze -H 'Content-Type: application/json' -d '{"url":"https://arxiv.org/pdf/1606.08415v3"}' | python3 -m json.tool
```
Assert: `"mode":"ai"`, non-empty `overview`, lessons carry non-empty `hook`/`definition`/`intuition`/`example`, `buildsOn` only references listed concepts, and math appears as LaTeX (`$...$`). Grab the `id`, `curl http://localhost:8787/api/guide/<id>` → same guide; bogus id → 404. A second identical analyze is instant (ai cache hit). Stop the server. **Capture the output for the review.**

**Step 4: Commit**
```bash
git add README.md
git commit -m "Document the rich guide + GEMINI_API_KEY"
```

---

## Out of scope (do not implement here)
- The `/guide` HTML page + KaTeX rendering (Thabhelo's frontend).
- Persistent cache; HTML→PDF export to replace pdfkit; Gemini-native PDF ingestion.
- innerHTML XSS escaping in the extension; cuntext index update.

## Definition of done
- [ ] vitest green (incl. new `filterBuildsOn` + updated fixtures); both builds exit 0.
- [ ] `/api/analyze` returns `id` + `overview` + enriched `lessons` (hook/definition/buildsOn) + back-compat `concepts[]`.
- [ ] `GET /api/guide/:id` returns the cached guide; bogus id → 404.
- [ ] AI-mode smoke shows `mode:"ai"`, real overview/lessons/buildsOn, LaTeX math; ai cache hit on repeat.
- [ ] Extension "Open full guide" opens `${webBase}/guide?id=<id>`; teaser + popup compile on the new shape.
