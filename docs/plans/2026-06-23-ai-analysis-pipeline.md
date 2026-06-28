# AI Analysis Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the deterministic 7-regex concept detector in `apps/api/src/server.ts` with a two-stage AI pipeline (Haiku 4.5 detect → Haiku 4.5 teach) that produces prerequisite *refresher lessons*, with a regex fallback, content-hash caching, an additive non-breaking API contract, and matching extension UI.

**Architecture:** All backend changes live in `apps/api/src/server.ts`. `resolvePaperInput` (ingestion) is untouched. `analyzePaper` becomes async and orchestrates: detect prerequisites (one Haiku call, structured) → teach one lesson per prerequisite (parallel Haiku calls, structured) → assemble. If no `ANTHROPIC_API_KEY` or any LLM failure, fall back to the existing regex logic (`basicMode`). Successful AI results are cached in-memory by `sha256(title+url+text)`. The `/api/analyze` response gains `lessons[]` + `mode`, keeping a derived `concepts[]` for back-compat with Thabhelo's frontend and the current extension. Extension popup + content widget render lessons using the existing Simply design tokens.

**Tech Stack:** TypeScript, Express 5, `@anthropic-ai/sdk` (new), `zod` (already present) + `zodOutputFormat` for structured outputs, `vitest` (new, dev) for unit tests, `pdfkit` (existing) for the PDF, Node `crypto` for hashing.

**Design tokens (extension UI must match the website — non-negotiable):**
- Background cream `#f7f3ea`; ink `#101827`; muted `#667085`.
- Area/eyebrow micro-label: indigo `#5b4bff`, uppercase, weight 900, letter-spacing `0.16em`.
- Accent (badges/status): terracotta `#c24a1a` border `rgba(232,100,42,0.28)`.
- Cards: white, 1px `rgba(16,24,39,0.12)` border, `border-radius:16px`.
- Buttons: pill `border-radius:999px`, dark `#101827` primary / white secondary.
- Content-script widget keeps its glass look (`backdrop-filter: blur`, `rgba(255,255,255,0.88)`, pills).
- Font: Inter / system. Tone: calm.

---

## Task 0: Dependencies & test runner

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Add the SDK and vitest**

Run:
```bash
cd /Users/adityakhalkar/simply && npm install --workspace apps/api @anthropic-ai/sdk && npm install --workspace apps/api -D vitest
```
Expected: both install; `apps/api/package.json` gains `@anthropic-ai/sdk` in `dependencies` and `vitest` in `devDependencies`.

**Step 2: Add a test script**

In `apps/api/package.json`, add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Verify vitest runs (no tests yet)**

Run: `npm run test --workspace apps/api`
Expected: vitest reports "No test files found" (exit 0 or a clear no-tests message). This confirms the runner works.

**Step 4: Commit**

```bash
git add apps/api/package.json package-lock.json
git commit -m "Add @anthropic-ai/sdk and vitest to api workspace"
```

---

## Task 1: Shared types & constants

**Files:**
- Modify: `apps/api/src/server.ts` (top of file, after imports)

**Step 1: Add types and constants**

Add near the top (after the existing `maxTextLength`/`maxPdfBytes` constants):

```ts
import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'

const DETECT_MODEL = 'claude-haiku-4-5'
const TEACH_MODEL = 'claude-haiku-4-5'
const maxDetectChars = 14_000
const maxLessons = 6

const apiKey = process.env.ANTHROPIC_API_KEY
const anthropic = apiKey ? new Anthropic({ apiKey }) : null

type Area = 'Probability' | 'Statistics' | 'Linear algebra' | 'Calculus' | 'Optimization' | 'ML'
const AREAS: Area[] = ['Probability', 'Statistics', 'Linear algebra', 'Calculus', 'Optimization', 'ML']

type Prerequisite = {
  area: Area
  concept: string
  evidenceQuote: string
  whyAssumed: string
}

type Lesson = {
  area: Area
  concept: string
  title: string
  intuition: string
  formula?: string
  example: string
  inThisPaper: string
}

type ConceptCard = {
  area: Area
  term: string
  plainEnglish: string
  whyItMatters: string
}

type AnalysisResult = {
  title: string
  url?: string
  summary: string
  mode: 'ai' | 'basic'
  lessons: Lesson[]
  concepts: ConceptCard[]
  nextSteps: string[]
}
```

**Step 2: Typecheck**

Run: `npm run build --workspace apps/api`
Expected: compiles (existing `analyzePaper` still returns the old shape — that's fine for now; we touch it in later tasks). If `Area` is unused-warning only, ignore. If it fails on an actual type error, fix before proceeding.

**Step 3: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Add pipeline types, model constants, and Anthropic client"
```

---

## Task 2: Extract `basicMode` (regex fallback) + `projectConcepts` — TDD

The existing `concepts[]` array and `analyzePaper` regex logic become the fallback. We refactor them into pure, testable functions.

**Files:**
- Create: `apps/api/src/analysis.ts`
- Create: `apps/api/src/analysis.test.ts`
- Modify: `apps/api/src/server.ts`

**Step 1: Write the failing test**

Create `apps/api/src/analysis.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { detectBasic, projectConcepts, nextSteps } from './analysis'

describe('detectBasic', () => {
  it('matches concepts present in the text', () => {
    const prereqs = detectBasic('We use KL divergence and a gradient step.')
    const concepts = prereqs.map((p) => p.concept)
    expect(concepts).toContain('KL divergence')
    expect(concepts).toContain('Gradient')
  })

  it('falls back to the first concepts when nothing matches', () => {
    const prereqs = detectBasic('lorem ipsum unrelated text')
    expect(prereqs.length).toBeGreaterThan(0)
    expect(prereqs.length).toBeLessThanOrEqual(4)
  })

  it('returns the fixed Area vocabulary only', () => {
    const areas = new Set(detectBasic('matrix vector bayes dropout').map((p) => p.area))
    for (const a of areas) {
      expect(['Probability', 'Statistics', 'Linear algebra', 'Calculus', 'Optimization', 'ML']).toContain(a)
    }
  })
})

describe('projectConcepts', () => {
  it('maps a Lesson to the legacy ConceptCard shape', () => {
    const cards = projectConcepts([
      { area: 'ML', concept: 'Dropout', title: 'Dropout', intuition: 'Hide units.', example: 'x', inThisPaper: 'used as regularizer' },
    ])
    expect(cards[0]).toEqual({ area: 'ML', term: 'Dropout', plainEnglish: 'Hide units.', whyItMatters: 'used as regularizer' })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace apps/api`
Expected: FAIL — `Cannot find module './analysis'`.

**Step 3: Write minimal implementation**

Create `apps/api/src/analysis.ts`. Move the existing `Concept` type + `concepts` array verbatim from `server.ts` (the 7 entries with `triggers`), then add:

```ts
// ...existing Concept type and concepts[] array moved here from server.ts...

import type { Area, Prerequisite, Lesson, ConceptCard } from './types'
// (Or co-locate the types here; keep one source. If co-locating, export them.)

export function detectBasic(text: string): Prerequisite[] {
  const matched = concepts.filter((c) => c.triggers.some((t) => t.test(text)))
  const chosen = matched.length > 0 ? matched : concepts.slice(0, 4)
  return chosen.slice(0, 6).map((c) => ({
    area: c.area,
    concept: c.term,
    evidenceQuote: '',
    whyAssumed: c.whyItMatters,
  }))
}

export function projectConcepts(lessons: Lesson[]): ConceptCard[] {
  return lessons.map((l) => ({
    area: l.area,
    term: l.concept,
    plainEnglish: l.intuition,
    whyItMatters: l.inThisPaper,
  }))
}

export const nextSteps = [
  'Read the abstract and introduction once without stopping.',
  'Review the prerequisite concepts below for 20 minutes.',
  'Return to the methods section and annotate every symbol that repeats.',
  'Export this guide as a PDF and keep it beside the paper.',
]

// Build a basic-mode Lesson[] from regex prerequisites (used when LLM is unavailable).
export function lessonsFromBasic(prereqs: Prerequisite[]): Lesson[] {
  return prereqs.map((p) => ({
    area: p.area,
    concept: p.concept,
    title: p.concept,
    intuition: p.whyAssumed,
    example: '',
    inThisPaper: p.whyAssumed,
  }))
}
```

> Decision: put the shared `Area/Prerequisite/Lesson/ConceptCard` types in a small `apps/api/src/types.ts` and import them in both `server.ts` and `analysis.ts` (avoids a circular import). Move the type block from Task 1 into `types.ts` and `export` each; import them in `server.ts`.

**Step 4: Run test to verify it passes**

Run: `npm run test --workspace apps/api`
Expected: PASS (5 assertions).

**Step 5: Wire `basicMode` into server.ts**

In `server.ts`, add (it builds the full `AnalysisResult` in basic mode):
```ts
import { detectBasic, lessonsFromBasic, projectConcepts, nextSteps } from './analysis'

function basicMode(paper: ResolvedPaper): AnalysisResult {
  const haystack = `${paper.title}\n${paper.url ?? ''}\n${paper.text}`
  const lessons = lessonsFromBasic(detectBasic(haystack))
  return {
    title: paper.title?.trim() || 'Untitled research paper',
    url: paper.url,
    summary: 'Simply found the prerequisite math and ML ideas that are likely to block a first pass through this paper.',
    mode: 'basic',
    lessons,
    concepts: projectConcepts(lessons),
    nextSteps,
  }
}
```
Delete the now-duplicated `concepts[]` array and `Concept` type from `server.ts` (they live in `analysis.ts`).

**Step 6: Typecheck**

Run: `npm run build --workspace apps/api`
Expected: compiles. (The old `analyzePaper` may now be unused or partially broken — leave it; Task 6 replaces it. If the build breaks because `analyzePaper` referenced the moved `concepts`, temporarily have `analyzePaper` call `basicMode` to keep it compiling.)

**Step 7: Commit**

```bash
git add apps/api/src/analysis.ts apps/api/src/analysis.test.ts apps/api/src/types.ts apps/api/src/server.ts
git commit -m "Extract regex fallback into basicMode + pure analysis helpers with tests"
```

---

## Task 3: `buildDetectInput` (capping) + cache key — TDD

**Files:**
- Modify: `apps/api/src/analysis.ts`, `apps/api/src/analysis.test.ts`

**Step 1: Write the failing test**

Append to `analysis.test.ts`:
```ts
import { buildDetectInput, cacheKey } from './analysis'

describe('buildDetectInput', () => {
  it('caps long text to maxDetectChars and includes the title', () => {
    const long = 'a'.repeat(50_000)
    const out = buildDetectInput('Cool Paper', long, 14_000)
    expect(out).toContain('Cool Paper')
    expect(out.length).toBeLessThanOrEqual(14_000 + 'Cool Paper'.length + 4)
  })
})

describe('cacheKey', () => {
  it('is stable for the same inputs and differs when text changes', () => {
    const a = cacheKey('T', 'http://x', 'body')
    const b = cacheKey('T', 'http://x', 'body')
    const c = cacheKey('T', 'http://x', 'body2')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace apps/api`
Expected: FAIL — `buildDetectInput`/`cacheKey` not exported.

**Step 3: Implement**

Add to `analysis.ts`:
```ts
import { createHash } from 'node:crypto'

export function buildDetectInput(title: string, text: string, maxChars: number): string {
  return [title, text.slice(0, maxChars)].filter(Boolean).join('\n\n')
}

export function cacheKey(title: string, url: string | undefined, text: string): string {
  return createHash('sha256').update(`${title}\n${url ?? ''}\n${text}`).digest('hex')
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test --workspace apps/api`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/analysis.ts apps/api/src/analysis.test.ts
git commit -m "Add detect-input capping and cache-key hashing with tests"
```

---

## Task 4: `detectPrerequisites` (LLM detect stage)

No unit test (network/LLM). Verified by typecheck + the Task 9 smoke test.

**Files:**
- Modify: `apps/api/src/server.ts`

**Step 1: Add zod schema + detect function**

```ts
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { buildDetectInput } from './analysis'

const prereqSchema = z.object({
  prerequisites: z
    .array(
      z.object({
        area: z.enum(AREAS as [Area, ...Area[]]),
        concept: z.string(),
        evidenceQuote: z.string(),
        whyAssumed: z.string(),
      }),
    )
    .max(maxLessons),
})

const DETECT_SYSTEM =
  'You help a reader who is about to read a research paper. List the prerequisite math and ML concepts the paper assumes the reader already knows. For each, quote the exact span from the provided text that shows the assumption. Only list concepts that actually appear — never invent. Order by how much each blocks a first pass. List at most 6.'

async function detectPrerequisites(paper: ResolvedPaper): Promise<Prerequisite[]> {
  if (!anthropic) return []
  const input = buildDetectInput(paper.title, paper.text, maxDetectChars)
  const response = await anthropic.messages.parse({
    model: DETECT_MODEL,
    max_tokens: 1500,
    system: DETECT_SYSTEM,
    output_config: { format: zodOutputFormat(prereqSchema, 'prerequisites') },
    messages: [{ role: 'user', content: input }],
  })
  const parsed = response.parsed_output
  if (!parsed) return []
  // Defensive: drop any stray area outside the enum (schema should already guarantee this).
  return parsed.prerequisites.filter((p) => AREAS.includes(p.area)).slice(0, maxLessons)
}
```

**Step 2: Typecheck**

Run: `npm run build --workspace apps/api`
Expected: compiles. If `zodOutputFormat`'s import path errors, check the installed SDK: `node -e "require('@anthropic-ai/sdk/helpers/zod')"` and adjust the import to the path the SDK actually exports (the README documents `@anthropic-ai/sdk/helpers/zod`). If `parsed_output` typing differs, log `response` shape once via a scratch run and align.

**Step 3: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Add LLM detect stage (Haiku, structured prerequisites)"
```

---

## Task 5: `generateLesson` + parallel teach stage

**Files:**
- Modify: `apps/api/src/server.ts`

**Step 1: Add lesson schema + teach functions**

```ts
const lessonSchema = z.object({
  area: z.enum(AREAS as [Area, ...Area[]]),
  concept: z.string(),
  title: z.string(),
  intuition: z.string(),
  formula: z.string().optional(),
  example: z.string(),
  inThisPaper: z.string(),
})

async function generateLesson(p: Prerequisite, paperTitle: string): Promise<Lesson> {
  if (!anthropic) throw new Error('no client')
  const response = await anthropic.messages.parse({
    model: TEACH_MODEL,
    max_tokens: 800,
    system:
      'Write a compact refresher lesson for someone about to read a research paper. A few sentences of intuition, one key formula if there is one, one short worked example, and one line on how the concept shows up in this paper. Calm and clear — a refresher, not a textbook chapter.',
    output_config: { format: zodOutputFormat(lessonSchema, 'lesson') },
    messages: [
      {
        role: 'user',
        content: `Concept: ${p.concept}\nArea: ${p.area}\nPaper: ${paperTitle}\nThe paper assumes (evidence): "${p.evidenceQuote}"\nWhy the reader needs it: ${p.whyAssumed}`,
      },
    ],
  })
  const lesson = response.parsed_output
  if (!lesson) throw new Error('empty lesson')
  return lesson
}

async function teachAll(prereqs: Prerequisite[], paperTitle: string): Promise<Lesson[]> {
  const settled = await Promise.allSettled(prereqs.map((p) => generateLesson(p, paperTitle)))
  return settled.map((res, i) => {
    if (res.status === 'fulfilled') return res.value
    const p = prereqs[i]
    // Degrade a failed lesson to a minimal card built from the prerequisite.
    return { area: p.area, concept: p.concept, title: p.concept, intuition: p.whyAssumed, example: '', inThisPaper: p.evidenceQuote || p.whyAssumed }
  })
}
```

**Step 2: Typecheck**

Run: `npm run build --workspace apps/api`
Expected: compiles.

**Step 3: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Add LLM teach stage (parallel Haiku lessons with degraded fallback)"
```

---

## Task 6: `analyzePaper` orchestration + cache

**Files:**
- Modify: `apps/api/src/server.ts`

**Step 1: Replace `analyzePaper` with the async orchestrator**

Delete the old synchronous `analyzePaper`. Add:
```ts
import { cacheKey, projectConcepts, nextSteps } from './analysis'

const analysisCache = new Map<string, AnalysisResult>()
const maxCacheEntries = 200

async function aiMode(paper: ResolvedPaper): Promise<AnalysisResult> {
  const prereqs = await detectPrerequisites(paper)
  if (prereqs.length === 0) return basicMode(paper) // nothing detected → basic
  const lessons = await teachAll(prereqs, paper.title)
  return {
    title: paper.title?.trim() || 'Untitled research paper',
    url: paper.url,
    summary: 'Simply built short refresher lessons for the prerequisite ideas this paper assumes.',
    mode: 'ai',
    lessons,
    concepts: projectConcepts(lessons),
    nextSteps,
  }
}

async function analyzePaper(paper: ResolvedPaper): Promise<AnalysisResult> {
  if (!anthropic) return basicMode(paper)
  const key = cacheKey(paper.title, paper.url, paper.text)
  const cached = analysisCache.get(key)
  if (cached) return cached
  try {
    const result = await aiMode(paper)
    if (result.mode === 'ai') {
      if (analysisCache.size >= maxCacheEntries) {
        analysisCache.delete(analysisCache.keys().next().value) // FIFO evict
      }
      analysisCache.set(key, result) // only cache ai results
    }
    return result
  } catch {
    return basicMode(paper)
  }
}
```

**Step 2: Typecheck**

Run: `npm run build --workspace apps/api`
Expected: compiles. The route handlers still call `analyzePaper(paper)` — now they must `await` it (Task 7).

**Step 3: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Add analyzePaper orchestration with fallback and content-hash cache"
```

---

## Task 7: Wire routes + PDF to the new result shape

**Files:**
- Modify: `apps/api/src/server.ts`

**Step 1: Update `/api/analyze`**

In the `/api/analyze` handler, change to:
```ts
const paper = await resolvePaperInput(parsed.data)
const analysis = await analyzePaper(paper)
response.json({
  ...analysis,
  ingestion: { source: paper.source, textLength: paper.text.length, arxivId: paper.arxivId, pdfUrl: paper.pdfUrl },
})
```

**Step 2: Update `/api/report.pdf`**

Replace the report body so it `await`s analysis and renders lessons grouped by area, keeping the existing pdfkit style (indigo `#5b4bff` area label, ink/grey body):
```ts
const paper = await resolvePaperInput(parsed.data)
const report = await analyzePaper(paper)
const document = new PDFDocument({ margin: 48 })
response.setHeader('Content-Type', 'application/pdf')
response.setHeader('Content-Disposition', 'attachment; filename="simply-guide.pdf"')
document.pipe(response)

document.fontSize(26).fillColor('#101827').text(`Simply Guide: ${report.title}`, { lineGap: 8 })
document.moveDown()
document.fontSize(12).fillColor('#667085').text(report.summary)
if (report.mode === 'basic') {
  document.moveDown(0.5).fontSize(10).fillColor('#c24a1a').text('Basic mode — set ANTHROPIC_API_KEY for full AI lessons.')
}
document.moveDown()

report.lessons.forEach((lesson, index) => {
  document.fillColor('#5b4bff').fontSize(10).text(lesson.area.toUpperCase())
  document.fillColor('#101827').fontSize(16).text(`${index + 1}. ${lesson.title}`)
  document.fillColor('#344054').fontSize(12).text(lesson.intuition)
  if (lesson.formula) document.fillColor('#101827').fontSize(11).text(`Formula: ${lesson.formula}`)
  if (lesson.example) document.fillColor('#344054').fontSize(12).text(`Example: ${lesson.example}`)
  document.fillColor('#667085').fontSize(11).text(`In this paper: ${lesson.inThisPaper}`)
  document.moveDown()
})

document.fillColor('#101827').fontSize(16).text('Reading plan')
report.nextSteps.forEach((step) => document.fillColor('#344054').fontSize(12).text(`- ${step}`))
document.end()
```

**Step 3: Typecheck + run the server once**

Run: `npm run build --workspace apps/api`
Expected: compiles.
Run (no key — exercises basic mode): `npm run dev:api` in one shell, then in another:
```bash
curl -s -X POST http://localhost:8787/api/analyze -H 'Content-Type: application/json' -d '{"title":"T","text":"We use KL divergence and a gradient step."}' | head -c 600
```
Expected: JSON with `"mode":"basic"`, a non-empty `lessons` array, and a `concepts` array. Stop the server.

**Step 4: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Wire analyze + report.pdf to lessons result with back-compat concepts"
```

---

## Task 8: Extension popup renders lessons (design-consistent)

**Files:**
- Modify: `apps/extension/src/popup.ts`, `apps/extension/src/style.css`

**Step 1: Extend the `AnalysisResponse` type and renderer in `popup.ts`**

Update the `Concept`/`AnalysisResponse` types to include lessons + mode, and rewrite `renderAnalysis`:
```ts
type Lesson = { area: string; concept: string; title: string; intuition: string; formula?: string; example: string; inThisPaper: string }
type AnalysisResponse = {
  title: string
  summary: string
  mode?: 'ai' | 'basic'
  lessons?: Lesson[]
  concepts: { area: string; term: string; whyItMatters: string; plainEnglish: string }[]
  nextSteps: string[]
}

function renderAnalysis(analysis: AnalysisResponse) {
  if (!resultsEl) return
  const lessons = analysis.lessons ?? []
  const badge = analysis.mode === 'basic' ? '<span class="mode-badge">Basic mode</span>' : ''
  resultsEl.innerHTML = `
    <div class="result-head"><h2>${analysis.title}</h2>${badge}</div>
    <p>${analysis.summary}</p>
    <div class="lessons">
      ${lessons
        .map(
          (l) => `
            <article class="lesson">
              <span>${l.area}</span>
              <h3>${l.title}</h3>
              <p>${l.intuition}</p>
              ${l.formula ? `<code class="formula">${l.formula}</code>` : ''}
              ${l.example ? `<p class="example">${l.example}</p>` : ''}
              <small>${l.inThisPaper}</small>
            </article>`,
        )
        .join('')}
    </div>`
}
```
> Note: `concept` titles/intuition are model text. The current code already injects API text into `innerHTML`; keep that behavior consistent for now (the existing `renderAnalysis` does the same). Do not add escaping in this task unless the existing code does — note it as a follow-up.

**Step 2: Add styles in `style.css` (match tokens)**

```css
.result-head { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
.mode-badge {
  border: 1px solid rgba(232, 100, 42, 0.28);
  border-radius: 999px;
  color: #c24a1a;
  font-size: 11px;
  padding: 4px 9px;
}
.lessons { display: grid; gap: 10px; margin-top: 12px; }
.lesson { background: white; border: 1px solid rgba(16, 24, 39, 0.12); border-radius: 16px; padding: 12px; }
.lesson span { color: #5b4bff; display: block; font-size: 11px; font-weight: 900; letter-spacing: 0.16em; margin-bottom: 6px; text-transform: uppercase; }
.lesson h3 { font-size: 15px; margin-bottom: 4px; }
.lesson .formula {
  background: rgba(91, 75, 255, 0.06);
  border-radius: 8px;
  color: #101827;
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  margin: 8px 0;
  padding: 8px 10px;
}
.lesson .example { color: #667085; margin-top: 8px; }
```

**Step 3: Build the extension**

Run: `npm run build --workspace apps/extension`
Expected: builds to `apps/extension/dist` with no errors.

**Step 4: Commit**

```bash
git add apps/extension/src/popup.ts apps/extension/src/style.css
git commit -m "Render lessons in popup with Simply design tokens + basic-mode badge"
```

---

## Task 9: Extension content-script widget renders lessons + manual smoke

**Files:**
- Modify: `apps/extension/src/content.ts`

**Step 1: Update the widget's result rendering**

In `content.ts`, update the `AnalysisResponse` type to include `lessons`/`mode`, and replace `renderConceptList` with a lesson renderer that fits the existing shadow-DOM glass panel. Keep the panel's existing `<style>` tokens; add list styling consistent with it (uppercase muted area label, rounded `rgba(0,0,0,0.035)` rows):
```ts
function renderLessonList(lessons: AnalysisResponse['lessons']) {
  return (lessons ?? [])
    .slice(0, 4)
    .map(
      (l) => `<li><span>${l.area}</span><strong>${l.title}</strong><em>${l.intuition}</em></li>`,
    )
    .join('')
}
```
In the analyze click handler, set `statusEl.textContent = \`Found ${(analysis.lessons ?? []).length} prerequisite lessons.\`` and `resultsEl.innerHTML = renderLessonList(analysis.lessons)`. Add to the panel `<style>`:
```css
li strong { display: block; font-size: 13px; }
li em { color: rgba(0, 0, 0, 0.55); display: block; font-size: 12px; font-style: normal; margin-top: 3px; }
```
(The existing `li span` uppercase area label style already matches.)

**Step 2: Build**

Run: `npm run build --workspace apps/extension`
Expected: builds cleanly.

**Step 3: Full smoke test with a real key (AI mode)**

Set the key and run the API + a real paper:
```bash
export ANTHROPIC_API_KEY=sk-ant-...   # user provides
npm run dev:api &     # in apps/api context
sleep 2
curl -s -X POST http://localhost:8787/api/analyze -H 'Content-Type: application/json' \
  -d '{"url":"https://arxiv.org/pdf/1606.08415v3"}' | python3 -m json.tool | head -40
```
Expected: `"mode": "ai"`, `lessons` with `title`/`intuition`/`inThisPaper` populated, `concepts` mirrored. A second identical call returns instantly (cache hit). Kill the server.

> If no key is available in this environment, document that Step 3 is a manual check the user runs, and rely on the Task 7 basic-mode smoke as the automated-path proof.

**Step 4: Commit**

```bash
git add apps/extension/src/content.ts
git commit -m "Render lessons in content-script widget; verify AI + basic smoke paths"
```

---

## Task 10: Docs — README key note + run instructions

**Files:**
- Modify: `README.md`

**Step 1: Add an env + AI note**

Under the API section, add:
```md
## AI analysis

Set an Anthropic API key for full prerequisite lessons:

\`\`\`bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > apps/api/.env
\`\`\`

Without a key, the API runs in **basic mode** (regex concept detection) so the
demo still works offline. Analysis is cached per paper in memory.
```

**Step 2: Verify the full test + build suite**

Run:
```bash
npm run test --workspace apps/api && npm run build --workspace apps/api && npm run build --workspace apps/extension
```
Expected: tests pass, both builds succeed.

**Step 3: Commit**

```bash
git add README.md
git commit -m "Document ANTHROPIC_API_KEY and basic-mode fallback"
```

---

## Out of scope (do not implement here)

- Mocking the Anthropic client for full-pipeline tests (follow-up).
- HTML-escaping model text in the extension (pre-existing behavior; track separately).
- Persistent/Redis cache, equation glossary, saved library, deploy wiring.
- Updating `index.cuntext` / `fragments/*.cuntext` to describe the new pipeline — do as a final housekeeping commit if time allows.

## Verification checklist (definition of done)

- [ ] `npm run test --workspace apps/api` passes (Tasks 2–3 unit tests).
- [ ] `npm run build` succeeds for both `apps/api` and `apps/extension`.
- [ ] Basic-mode curl (no key) returns `mode:"basic"` + non-empty `lessons` + `concepts`.
- [ ] AI-mode curl (with key) returns `mode:"ai"` + populated lessons; repeat call is cached.
- [ ] Popup and content widget render lessons using the Simply tokens (indigo area label, cream bg, pill buttons, terracotta basic-mode badge).
- [ ] `concepts[]` still present in every response (Thabhelo's frontend unbroken).
