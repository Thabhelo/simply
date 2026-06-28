# Per-Lesson Diagrams (Mermaid) — Design

**Date:** 2026-06-26
**Scope:** `apps/api` (one optional field + prompt + filter) + the `/guide` viewer rendering (`src/`). Thabhelo's real `/guide` page renders the same field with the same lib.
**Goal:** Let each generated lesson optionally carry a small diagram so the guide can *show* a concept (a process/pipeline/relationship), not just describe it. The LLM emits **Mermaid flowchart** text; the page renders it with mermaid.js.

## Decisions (locked via brainstorm)
1. **Per-lesson, AI-generated** diagrams (not the deterministic buildsOn map).
2. **Format = Mermaid text** (`flowchart`/`graph`); LLMs are strong at it, minimal code, expressive.
3. **Optional** — the model includes a diagram only when it genuinely clarifies; omits otherwise. basic/degraded lessons never carry one.
4. **Constrained to `flowchart`** (LR/TD), 3–7 nodes, plain labels (no LaTeX in labels).
5. **Safe rendering** — mermaid `securityLevel:'strict'`, render in try/catch, invalid → render nothing (no broken box), like KaTeX `throwOnError:false`.

## Architecture / data flow
```
teach (per prereq, Gemini) → Lesson also emits OPTIONAL `diagram` (Mermaid text)
   → cleanDiagram() server-side filter (keep only flowchart/graph; else undefined)
   → Lesson { …existing…, diagram?: string }  (carried through assembly unchanged)
   → Guide cached by id
   → /guide page renders lesson.diagram with mermaid.js (below the example), safely
```
Fully additive: `diagram?` is optional, so the extension teaser, `concepts[]` back-compat, and Thabhelo's page are unaffected; clients that don't render it ignore it.

## Backend — `apps/api`
**`types.ts`:** `Lesson` gains `diagram?: string` (optional; append after `buildsOn`).

**Teach `responseSchema` (server.ts):** add `diagram: { type: Type.STRING }` to `properties`, and **leave it OUT of `required`** (Gemini treats non-required as optional → model emits it only when it has one).

**`TEACH_SYSTEM` prompt addition:**
> "If — and only if — a small diagram genuinely clarifies the concept (a process, pipeline, or relationship), include a `diagram` field containing a Mermaid **flowchart** (`flowchart LR` or `flowchart TD`), 3–7 nodes, short plain-text labels (no LaTeX or `$` in labels). Omit `diagram` entirely when it wouldn't add real value."

**`cleanDiagram` filter (analysis.ts, pure, TDD):**
```ts
export function cleanDiagram(d?: string): string | undefined {
  const t = (d ?? '').trim()
  return /^(flowchart|graph)\b/.test(t) ? t : undefined
}
```
Applied in `generateLesson` before returning: `return { ...t, area: p.area, concept: p.concept, buildsOn: p.buildsOn, diagram: cleanDiagram(t.diagram) }`. `TeachLesson` type gains `diagram?: string`. `lessonFromPrereq` never sets `diagram` (basic/degraded → none).

## Frontend — `/guide` viewer (`src/GuidePage.tsx`)
- Add `mermaid` dependency (landing app, like `katex`).
- Init once: `mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' })`. Strict mode sanitizes (DOMPurify) and disables click/HTML — required since the text is model output.
- `<MermaidDiagram code={lesson.diagram} />`: on mount (useEffect keyed on `code`), `mermaid.parse(code, { suppressErrors: true })`; if ok, `await mermaid.render(uniqueId, code)` and inject the returned sanitized SVG into the container; on any throw/false → render nothing. Clear the container first to survive React StrictMode double-invoke; unique render id per attempt.
- Place below the worked example in each lesson card, only when `diagram` is present.

## Error handling
- Model omits `diagram` → nothing rendered (common case).
- Non-flowchart content → `cleanDiagram` drops it.
- Invalid-but-flowchart-shaped Mermaid → `parse`/`render` fails → caught → render nothing (no error graphic).
- basic/degraded lessons → no diagram.
- XSS → `securityLevel:'strict'`.
- Size/latency → prompt caps at 3–7 nodes.

## Testing
- **Unit (vitest, TDD):** `cleanDiagram` — keeps `flowchart …`/`graph …` (trimmed), drops empty/prose/non-flowchart → `undefined`.
- **Rendering:** verify `MermaidDiagram` in the live `/guide` viewer via Playwright — a known-good flowchart renders to SVG; deliberately-broken Mermaid renders nothing. (To exercise without depending on AI/quota, the verification can seed a guide and is best done with a sample diagram; a true model-generated capture needs Gemini quota — deferred, same caveat as the rest of AI mode.)
- LLM passthrough (`generateLesson` emitting `diagram`) — not unit-tested (network); manual smoke.

## Out of scope / follow-ups
- The deterministic `buildsOn` dependency-map diagram (could add later).
- Wider Mermaid types (sequence/state); the polished `/guide` page styling (Thabhelo).
- Diagrams in the pdfkit PDF (pdfkit can't render Mermaid; PDF stays text — HTML→PDF export is the future path).
