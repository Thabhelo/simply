import './load-env.js'
import cors from 'cors'
import express from 'express'
import { PDFParse } from 'pdf-parse'
import PDFDocument from 'pdfkit'
import { z } from 'zod'
import { Type } from '@google/genai'
import { formatGeminiError, getGeminiApiKeys, hasGemini, textModelChain, withGeminiModelRetry, withGeminiRetry } from './gemini.js'
import { AREAS, maxLessons } from './types.js'
import type { Prerequisite, Lesson, Guide, VisualStep, ExcalidrawElementSkeleton } from './types.js'
import { buildDetectInput, detectBasic, lessonsFromBasic, lessonFromPrereq, projectConcepts, nextSteps, cacheKey, filterBuildsOn, cleanDiagram, isSparseLesson } from './analysis.js'
import { cleanExcalidrawElements } from './sketch.js'
import { requireAuth } from './auth.js'
import { getCachedAiGuide, getGuide, guideStoreMode, saveGuide } from './guideStore.js'
import { guideExportUrl, renderGuidePdf, renderGuidePdfFlattened } from './pdfRender.js'

const app = express()
const port = Number(process.env.PORT ?? 8787)
const maxTextLength = 120_000
const maxPdfBytes = 25 * 1024 * 1024

// Default: largest stable text model. Falls back to flash automatically on free-tier quota.
const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-2.5-pro'
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_TEXT_MODEL
const DETECT_MODEL = process.env.GEMINI_DETECT_MODEL?.trim() || GEMINI_MODEL
const TEACH_MODEL = process.env.GEMINI_TEACH_MODEL?.trim() || GEMINI_MODEL
const maxDetectChars = maxTextLength // feed the full ingested paper (bounded to 120k). Gemini's large context is the reason for switching.

console.log(
  hasGemini()
    ? `Simply: AI mode enabled (${DETECT_MODEL} / ${TEACH_MODEL}, ${getGeminiApiKeys().length} key(s))`
    : 'Simply: GEMINI_API_KEY not set. Running in basic mode.',
)
console.log(`Simply: guide store (${guideStoreMode()})`)

// CORS stays open by design: the extension content script calls the API from whatever
// paper page the user is reading (arxiv.org, etc.), so the Origin is unpredictable. The
// security boundary is the Firebase Bearer token (see requireAuth), not CORS. Because
// we use tokens rather than cookies, there are no ambient credentials for a cross-origin
// site to abuse.
app.use(cors())
app.use(express.json({ limit: '5mb' }))

const paperRequestSchema = z
  .object({
    title: z.string().optional(),
    url: z.string().url().optional(),
    text: z.string().max(maxTextLength).optional(),
  })
  .superRefine((value, context) => {
    if (!value.url && !value.text?.trim()) {
      context.addIssue({
        code: 'custom',
        message: 'Provide either paper text or a URL to ingest.',
        path: ['text'],
      })
    }
  })

type PaperRequest = z.infer<typeof paperRequestSchema>

type ResolvedPaper = {
  title: string
  url?: string
  text: string
  source: 'provided-text' | 'pdf-ingestion' | 'html-ingestion'
  arxivId?: string
  pdfUrl?: string
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxTextLength)
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function getMetaContent(html: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapedKey}["'][^>]*>`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)

    if (match?.[1]) {
      return decodeHtmlEntities(match[1]).trim()
    }
  }

  return undefined
}

function extractTitle(html: string) {
  return (
    getMetaContent(html, 'citation_title') ||
    getMetaContent(html, 'dc.title') ||
    getMetaContent(html, 'og:title') ||
    html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
  )
}

function extractAbstract(html: string) {
  const metaAbstract =
    getMetaContent(html, 'citation_abstract') ||
    getMetaContent(html, 'description') ||
    getMetaContent(html, 'og:description')

  if (metaAbstract) {
    return metaAbstract
  }

  const abstractMatch = html.match(
    /<(?:section|div|p)[^>]+(?:id|class)=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]{80,5000}?)<\/(?:section|div|p)>/i,
  )

  return abstractMatch?.[1] ? decodeHtmlEntities(stripTags(abstractMatch[1])).trim() : undefined
}

function isLikelyResearchHtml(url: string, html: string) {
  const hostname = new URL(url).hostname.toLowerCase()
  const knownHosts = [
    'arxiv.org',
    'openreview.net',
    'biorxiv.org',
    'medrxiv.org',
    'ssrn.com',
    'aclanthology.org',
    'proceedings.mlr.press',
    'papers.nips.cc',
    'neurips.cc',
    'ieee.org',
    'springer.com',
    'sciencedirect.com',
    'nature.com',
    'science.org',
    'frontiersin.org',
    'plos.org',
  ]
  const lowered = html.toLowerCase()

  return (
    knownHosts.some((host) => hostname.endsWith(host)) ||
    /<meta[^>]+name=["']citation_title["']/i.test(html) ||
    /<meta[^>]+name=["']citation_pdf_url["']/i.test(html) ||
    /\bdoi:\s*10\.\d{4,9}\//i.test(html) ||
    /\babstract\b/.test(lowered) && /\b(references|introduction|methodology|results)\b/.test(lowered)
  )
}

function getArxivSource(inputUrl: string) {
  const url = new URL(inputUrl)
  const hostname = url.hostname.toLowerCase()

  if (!hostname.endsWith('arxiv.org')) {
    return url.pathname.toLowerCase().endsWith('.pdf')
      ? { pdfUrl: url.toString() }
      : { pdfUrl: undefined }
  }

  const match = url.pathname.match(/^\/(?:abs|pdf)\/(.+)$/)

  if (!match?.[1]) {
    return { pdfUrl: undefined }
  }

  const arxivId = decodeURIComponent(match[1]).replace(/\.pdf$/i, '')
  const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`
  const absUrl = `https://arxiv.org/abs/${arxivId}`

  return { arxivId, absUrl, pdfUrl }
}

function extractArxivTitle(html: string) {
  const titleMatch = html.match(/<h1[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)
  const rawTitle = titleMatch?.[1] ?? html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]

  if (!rawTitle) {
    return undefined
  }

  return decodeHtmlEntities(stripTags(rawTitle).trim().replace(/^Title:\s*/i, '')).trim()
}

async function fetchArxivTitle(absUrl?: string) {
  if (!absUrl) {
    return undefined
  }

  try {
    const response = await fetch(absUrl, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Simply/0.1 (paper ingestion; https://github.com/Thabhelo/simply)',
      },
    })

    if (!response.ok) {
      return undefined
    }

    return extractArxivTitle(await response.text())
  } catch {
    return undefined
  }
}

async function extractPdfText(pdfUrl: string) {
  const response = await fetch(pdfUrl, {
    headers: {
      Accept: 'application/pdf',
      'User-Agent': 'Simply/0.1 (paper ingestion; https://github.com/Thabhelo/simply)',
    },
  })

  if (!response.ok) {
    throw new Error(`Could not fetch PDF (${response.status}).`)
  }

  const contentLength = Number(response.headers.get('content-length'))

  if (Number.isFinite(contentLength) && contentLength > maxPdfBytes) {
    throw new Error('PDF is too large to ingest right now.')
  }

  const arrayBuffer = await response.arrayBuffer()

  if (arrayBuffer.byteLength > maxPdfBytes) {
    throw new Error('PDF is too large to ingest right now.')
  }

  const parser = new PDFParse({ data: Buffer.from(arrayBuffer) })

  try {
    const result = await parser.getText()
    const text = normalizeWhitespace(result.text)

    if (!text) {
      throw new Error('PDF text extraction returned no readable text.')
    }

    return text
  } finally {
    await parser.destroy()
  }
}

async function ingestHtmlPaper(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Simply/0.1 (paper ingestion; https://github.com/Thabhelo/simply)',
    },
  })

  if (!response.ok) {
    throw new Error(`Could not fetch research page (${response.status}).`)
  }

  const html = await response.text()

  if (!isLikelyResearchHtml(url, html)) {
    throw new Error('This page does not look like a research paper yet.')
  }

  const title = normalizeWhitespace(decodeHtmlEntities(stripTags(extractTitle(html) ?? 'Untitled research paper')))
  const abstract = extractAbstract(html)
  const bodyText = normalizeWhitespace(decodeHtmlEntities(stripTags(html)))
  const text = normalizeWhitespace([abstract, bodyText].filter(Boolean).join('\n\n'))
  const pdfUrl = getMetaContent(html, 'citation_pdf_url')

  if (!text || text.length < 500) {
    throw new Error('Could not extract enough readable text from this research page.')
  }

  return { title, text, pdfUrl }
}

const FALLBACK_TITLE = 'Untitled research paper'

// A title is "usable" only if the caller supplied a real one. The extension defaults
// its title to FALLBACK_TITLE and always sends page text, so a missing-or-generic title
// means we should still try to recover the real title from the URL.
function usableTitle(title?: string) {
  const trimmed = title?.trim()
  return trimmed && trimmed !== FALLBACK_TITLE ? trimmed : undefined
}

// Best-effort title extraction from a paper URL without downloading the PDF/full body.
// Used when text is provided (so we skip ingestion) but no real title came with it.
async function resolveTitleFromUrl(url: string): Promise<string | undefined> {
  try {
    const source = getArxivSource(url)

    if (source.absUrl) {
      return await fetchArxivTitle(source.absUrl)
    }

    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Simply/0.1 (paper ingestion; https://github.com/Thabhelo/simply)',
      },
    })

    if (!response.ok) {
      return undefined
    }

    const html = await response.text()
    const title = normalizeWhitespace(decodeHtmlEntities(stripTags(extractTitle(html) ?? '')))

    return title || undefined
  } catch {
    return undefined
  }
}

async function resolvePaperInput(input: PaperRequest): Promise<ResolvedPaper> {
  const providedText = normalizeWhitespace(input.text ?? '')

  if (providedText) {
    const title =
      usableTitle(input.title) ??
      (input.url ? await resolveTitleFromUrl(input.url) : undefined) ??
      FALLBACK_TITLE

    return {
      title,
      url: input.url,
      text: providedText,
      source: 'provided-text',
    }
  }

  if (!input.url) {
    throw new Error('A URL is required when no paper text is provided.')
  }

  const source = getArxivSource(input.url)

  if (!source.pdfUrl) {
    const page = await ingestHtmlPaper(input.url)

    return {
      title: usableTitle(input.title) ?? page.title,
      url: input.url,
      text: page.text,
      source: 'html-ingestion',
      pdfUrl: page.pdfUrl,
    }
  }

  const [title, text] = await Promise.all([
    fetchArxivTitle(source.absUrl),
    extractPdfText(source.pdfUrl),
  ])

  return {
    title: usableTitle(input.title) ?? title ?? source.arxivId ?? FALLBACK_TITLE,
    url: input.url,
    text,
    source: 'pdf-ingestion',
    arxivId: source.arxivId,
    pdfUrl: source.pdfUrl,
  }
}

function basicMode(paper: ResolvedPaper, id: string): Guide {
  const haystack = `${paper.title}\n${paper.url ?? ''}\n${paper.text}`
  const lessons = lessonsFromBasic(detectBasic(haystack))
  return {
    id,
    title: paper.title?.trim() || 'Untitled research paper',
    url: paper.url,
    summary: 'Simply found the prerequisite math and ML ideas that are likely to block a first pass through this paper.',
    mode: 'basic',
    overview: hasGemini()
      ? 'AI lessons are temporarily unavailable (the model hit a rate or quota limit). These are the prerequisite areas this paper leans on.'
      : 'Set GEMINI_API_KEY for full AI lessons. These are the prerequisite areas this paper leans on.',
    lessons, concepts: projectConcepts(lessons), nextSteps,
  }
}

async function aiMode(paper: ResolvedPaper, id: string): Promise<Guide> {
  const { overview, prerequisites } = await detectGuide(paper)
  if (prerequisites.length === 0) {
    console.warn('Simply: detect returned no prerequisites. Using basic mode.')
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

async function analyzePaper(paper: ResolvedPaper): Promise<Guide> {
  const id = cacheKey(paper.title, paper.url, paper.text)
  const cached = await getCachedAiGuide(id)
  if (cached) return cached // reuse ai; always recompute basic
  let guide: Guide
  if (!hasGemini()) {
    guide = basicMode(paper, id)
  } else {
    try {
      guide = await aiMode(paper, id)
    } catch (error) {
      console.error('Simply: AI analysis failed. Using basic mode:', formatGeminiError(error))
      guide = basicMode(paper, id)
    }
  }
  await saveGuide(guide)
  return guide
}

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
  'You help a reader who is about to read a research paper. Identify the prerequisite math and ML concepts the paper assumes the reader already knows. Order them by what to learn first. For each: quote the exact span from the text that shows the assumption (evidenceQuote), say why the reader needs it (whyAssumed), and set buildsOn to the concepts IN THIS LIST that it depends on (use the exact concept strings; empty if none). Also write a 2-4 sentence overview of what the paper assumes and how to prepare. Only list concepts that actually appear. Never invent. List at most 6 prerequisites.'

type DetectResult = { overview: string; prerequisites: Prerequisite[] }

async function detectGuide(paper: ResolvedPaper): Promise<DetectResult> {
  if (!hasGemini()) return { overview: '', prerequisites: [] }
  const input = buildDetectInput(paper.title, paper.text, maxDetectChars)
  const response = await withGeminiModelRetry(textModelChain(DETECT_MODEL), (client, model) =>
    client.models.generateContent({
      model,
      contents: input,
      config: { systemInstruction: DETECT_SYSTEM, responseMimeType: 'application/json', responseSchema: detectResponseSchema },
    }),
  )
  const text = response.text
  if (!text) {
    console.warn('Simply: detect returned no structured output')
    return { overview: '', prerequisites: [] }
  }
  // JSON.parse can throw on a malformed response. analyzePaper try/catches the whole call, so a throw falls back to basic mode.
  const parsed = JSON.parse(text) as { overview?: string; prerequisites?: Prerequisite[] }
  const prerequisites = filterBuildsOn(
    (parsed.prerequisites ?? []).filter((p) => AREAS.includes(p.area)).slice(0, maxLessons),
  )
  return { overview: parsed.overview ?? '', prerequisites }
}

const lessonResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    hook: { type: Type.STRING },
    definition: { type: Type.STRING },
    intuition: { type: Type.STRING },
    example: { type: Type.STRING },
    inThisPaper: { type: Type.STRING },
    diagram: { type: Type.STRING },
    excalidrawElements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          width: { type: Type.NUMBER },
          height: { type: Type.NUMBER },
          label: {
            type: Type.OBJECT,
            properties: { text: { type: Type.STRING } },
          },
        },
        required: ['type', 'x', 'y', 'width', 'height'],
      },
    },
    illustrationPrompt: { type: Type.STRING },
    visualSteps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          narration: { type: Type.STRING },
        },
        required: ['label', 'narration'],
      },
    },
  },
  required: ['title', 'hook', 'definition', 'intuition', 'example', 'inThisPaper'],
}

const TEACH_SYSTEM =
  'Write a substantive pedagogical refresher for someone about to read a research paper. Every section below is mandatory — never leave one empty or merge two into one sentence.\n\n' +
  'Required sections (markdown inside each string field):\n' +
  '- hook: one engaging sentence that names why this concept blocks reading the paper.\n' +
  '- definition: 2-4 sentences with a precise definition; bold key terms.\n' +
  '- intuition: 3-5 sentences explaining the idea in plain language with a concrete analogy.\n' +
  '- example: a numbered worked mini-example (at least 3 steps: Input, Operation, Output) using simple numbers or symbols from the paper.\n' +
  '- inThisPaper: 2-3 sentences quoting or paraphrasing how this exact paper uses the concept, with the main formula in $...$ or $$...$$ if relevant.\n\n' +
  'Use markdown: **bold** for key terms, numbered lists for worked examples. Write ALL math as KaTeX inside $ ... $ (inline) or $$ ... $$ (display). Never leave LaTeX bare outside dollar delimiters. Calm and clear: a refresher, not a textbook chapter.\n\n' +
  'Be visually educative:\n' +
  '- illustrationPrompt: NotebookLM-style metaphor sketch only (watercolor analogy scene, NO flowcharts). Use for intuitive comparisons, not technical layout.\n' +
  '- visualSteps: 3-5 Manim-like beats for processes that unfold over time.\n' +
  '- diagram: Mermaid flowchart ONLY for simple pipelines/processes (flowchart LR or TD, 3-7 nodes, plain labels, no LaTeX). Omit if a custom layout is needed.\n' +
  '- excalidrawElements: use ONLY when diagram is not enough — custom teaching layouts such as Q/K/V panels, matrix grids, split panels, or grouped regions. Array of { type, x, y, width, height, label: { text } } with type one of rectangle, ellipse, diamond, text, arrow. Place related boxes side by side; keep 4-12 elements; plain labels only (no LaTeX). Do not include both diagram and excalidrawElements for the same idea — pick one.'

const clarifyRequestSchema = z.object({
  selection: z.string().min(1).max(2000),
  question: z.string().min(1).max(500),
  guideTitle: z.string().optional(),
})

const CLARIFY_SYSTEM =
  'You help a reader understand a dense research-paper prerequisite guide. Answer in 2-4 short sentences. Plain language, calm tone. Use LaTeX inline $ ... $ only when a symbol is essential. No preamble.'

type TeachLesson = {
  title: string
  hook: string
  definition: string
  intuition: string
  example: string
  inThisPaper: string
  diagram?: string
  excalidrawElements?: ExcalidrawElementSkeleton[]
  illustrationPrompt?: string
  visualSteps?: VisualStep[]
}

type DraftLesson = Lesson & { illustrationPrompt?: string }

const IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']

/** Pexels is for UI decoration (/api/pexels/search). Never used in lesson content. */
async function fetchPexelsImageUrl(query: string): Promise<string | undefined> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return undefined
  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?${new URLSearchParams({ query, per_page: '1', orientation: 'landscape' })}`,
      { headers: { Authorization: key } },
    )
    if (!response.ok) return undefined
    const data = (await response.json()) as { photos?: { src?: { large?: string; medium?: string } }[] }
    return data.photos?.[0]?.src?.large ?? data.photos?.[0]?.src?.medium
  } catch {
    return undefined
  }
}

async function generateIllustration(
  prompt: string,
  ctx: { paperTitle: string; concept: string; area: string },
): Promise<string | undefined> {
  if (!hasGemini()) return undefined

  const contents = [
    'Create a single NotebookLM-style educational illustration for a research-paper primer.',
    'Style: soft watercolor on cream paper, muted pastels, friendly hand-drawn lines, split composition.',
    'Left: intuitive analogy scene. Right: simple labeled technical sketch tied to the concept.',
    'Rules: no photorealism, no stock photo look, no 3D render, no watermarks, minimal text labels.',
    `Paper: ${ctx.paperTitle}`,
    `Area: ${ctx.area}`,
    `Concept: ${ctx.concept}`,
    `Scene: ${prompt}`,
  ].join('\n')

  for (const model of IMAGE_MODELS) {
    try {
      const response = await withGeminiRetry((client) =>
        client.models.generateContent({
          model,
          contents,
          config: { responseModalities: ['IMAGE', 'TEXT'] } as Record<string, unknown>,
        }),
      )
      const parts = response.candidates?.[0]?.content?.parts ?? []
      for (const part of parts) {
        const inline = (part as { inlineData?: { mimeType?: string; data?: string } }).inlineData
        if (inline?.data && inline.mimeType) {
          return `data:${inline.mimeType};base64,${inline.data}`
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const quota = message.includes('429') || message.includes('quota')
      const missing = message.includes('404') || message.includes('NOT_FOUND')
      if (quota) {
        console.warn(`Simply: illustration quota reached on ${model}.`)
        return undefined
      }
      if (!missing) {
        console.warn(`Simply: illustration failed on ${model}:`, message.slice(0, 120))
      }
    }
  }
  return undefined
}

async function attachIllustrations(drafts: DraftLesson[], paperTitle: string): Promise<Lesson[]> {
  const lessons: Lesson[] = []
  for (let index = 0; index < drafts.length; index++) {
    const draft = drafts[index]
    let illustration: string | undefined
    if (draft.illustrationPrompt) {
      illustration = await generateIllustration(draft.illustrationPrompt, {
        paperTitle,
        concept: draft.concept,
        area: draft.area,
      })
      if (index < drafts.length - 1) await sleep(1500)
    }
    const { illustrationPrompt, ...lesson } = draft
    void illustrationPrompt
    lessons.push({ ...lesson, illustration })
  }
  return lessons
}

function stripLatexForPdf(text: string): string {
  return text
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => math.replace(/\\[a-zA-Z]+(\{[^{}]*\})?/g, ' ').replace(/[{}_^\\]/g, ' ').replace(/\s+/g, ' ').trim())
    .replace(/\$([^$]+)\$/g, (_, math) => math.replace(/\\[a-zA-Z]+(\{[^{}]*\})?/g, ' ').replace(/[{}_^\\]/g, ' ').replace(/\s+/g, ' ').trim())
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizePdfFilename(title: string): string {
  return title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').trim() || 'simply-guide'
}

function writeGuidePdf(report: Guide, response: express.Response) {
  const document = new PDFDocument({ margin: 48 })
  response.setHeader('Content-Type', 'application/pdf')
  response.setHeader('Content-Disposition', 'attachment; filename="simply-guide.pdf"')
  document.pipe(response)

  document.fontSize(22).fillColor('#101827').text(report.title, { lineGap: 8 })
  document.moveDown()
  document.fontSize(11).fillColor('#667085').text('Plain-text export. For rendered math and diagrams, open the guide in your browser.', { lineGap: 4 })
  document.moveDown()
  document.fontSize(12).fillColor('#667085').text(stripLatexForPdf(report.overview || report.summary))
  if (report.mode === 'basic') {
    document.moveDown(0.5).fontSize(10).fillColor('#c24a1a').text(hasGemini() ? 'Basic mode. AI lessons hit a rate or quota limit; showing prerequisite areas only.' : 'Basic mode. Set GEMINI_API_KEY for full AI lessons.')
  }
  document.moveDown()

  report.lessons.forEach((lesson, index) => {
    document.moveDown(0.5)
    document.fillColor('#e8642a').fontSize(10).text(lesson.area.toUpperCase())
    document.fillColor('#101827').fontSize(15).text(`${index + 1}. ${lesson.title}`)
    if (lesson.hook) document.fillColor('#344054').fontSize(11).text(stripLatexForPdf(lesson.hook), { lineGap: 4 })
    if (lesson.definition) document.fillColor('#101827').fontSize(11).text(`Definition: ${stripLatexForPdf(lesson.definition)}`, { lineGap: 4 })
    if (lesson.intuition) document.fillColor('#344054').fontSize(11).text(stripLatexForPdf(lesson.intuition), { lineGap: 4 })
    if (lesson.example) document.fillColor('#344054').fontSize(11).text(`Example: ${stripLatexForPdf(lesson.example)}`, { lineGap: 4 })
    if (lesson.inThisPaper) document.fillColor('#667085').fontSize(11).text(`In this paper: ${stripLatexForPdf(lesson.inThisPaper)}`, { lineGap: 4 })
  })

  document.fillColor('#101827').fontSize(16).text('Reading plan')
  report.nextSteps.forEach((step) => document.fillColor('#344054').fontSize(12).text(`- ${step}`))
  document.end()
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Gemini Flash returns transient 503/UNAVAILABLE/429 under load; these are worth a quick retry.
function isTransient(error: unknown): boolean {
  const m = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return m.includes('503') || m.includes('unavailable') || m.includes('429') || m.includes('resource_exhausted') || m.includes('overloaded')
}

async function generateLesson(p: Prerequisite, paperTitle: string): Promise<DraftLesson> {
  if (!hasGemini()) throw new Error('no client')
  const baseContents = `Concept: ${p.concept}\nArea: ${p.area}\nPaper: ${paperTitle}\nThe paper assumes (evidence): "${p.evidenceQuote}"\nWhy the reader needs it: ${p.whyAssumed}`
  const config = { systemInstruction: TEACH_SYSTEM, responseMimeType: 'application/json', responseSchema: lessonResponseSchema }
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(attempt * 400 + Math.floor(Math.random() * 200))
    const contents =
      attempt === 0
        ? baseContents
        : `${baseContents}\n\nYour previous draft was too thin. Fill every required field with the minimum depth: hook (1 sentence), definition (2-4 sentences), intuition (3-5 sentences), example (3+ numbered steps), inThisPaper (2-3 sentences plus formula if relevant). Do not skip any section.`
    try {
      const response = await withGeminiModelRetry(textModelChain(TEACH_MODEL), (client, model) =>
        client.models.generateContent({ model, contents, config }),
      )
      const text = response.text
      if (!text) throw new Error('empty lesson')
      const t = JSON.parse(text) as TeachLesson
      const draft: DraftLesson = {
        area: p.area,
        concept: p.concept,
        title: t.title,
        hook: t.hook?.trim() ?? '',
        definition: t.definition?.trim() ?? '',
        intuition: t.intuition?.trim() ?? '',
        example: t.example?.trim() ?? '',
        inThisPaper: t.inThisPaper?.trim() ?? '',
        buildsOn: p.buildsOn,
        diagram: cleanDiagram(t.diagram),
        excalidrawElements: cleanExcalidrawElements(t.excalidrawElements),
        visualSteps: t.visualSteps?.slice(0, 5),
        illustrationPrompt: t.illustrationPrompt,
      }
      if (isSparseLesson(draft) && attempt < 2) continue
      return draft
    } catch (error) {
      lastError = error
      if (!isTransient(error) || attempt === 2) throw error
    }
  }
  throw lastError
}

async function teachAll(prereqs: Prerequisite[], paperTitle: string): Promise<Lesson[]> {
  const settled = await Promise.allSettled(prereqs.map((p) => generateLesson(p, paperTitle)))
  const drafts = settled.map((res, i) =>
    res.status === 'fulfilled' ? res.value : ({ ...lessonFromPrereq(prereqs[i]) } as DraftLesson),
  )
  return attachIllustrations(drafts, paperTitle)
}

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'simply-api' })
})

app.get('/api/pexels/search', async (request, response) => {
  const q = typeof request.query.q === 'string' ? request.query.q.trim() : 'research study'
  const url = await fetchPexelsImageUrl(q || 'research study')
  if (!url) {
    response.status(503).json({ error: 'Could not fetch a Pexels image.' })
    return
  }
  response.json({ url })
})

app.post('/api/ingest', requireAuth, async (request, response) => {
  const parsed = paperRequestSchema.safeParse(request.body)

  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid ingestion request', details: parsed.error.flatten() })
    return
  }

  try {
    const paper = await resolvePaperInput(parsed.data)

    response.json({
      title: paper.title,
      url: paper.url,
      text: paper.text,
      textLength: paper.text.length,
      source: paper.source,
      arxivId: paper.arxivId,
      pdfUrl: paper.pdfUrl,
    })
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : 'Could not ingest this paper.',
    })
  }
})

app.post('/api/analyze', requireAuth, async (request, response) => {
  const parsed = paperRequestSchema.safeParse(request.body)

  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid analysis request', details: parsed.error.flatten() })
    return
  }

  try {
    const paper = await resolvePaperInput(parsed.data)
    const guide = await analyzePaper(paper)

    response.json({
      ...guide,
      ingestion: {
        source: paper.source,
        textLength: paper.text.length,
        arxivId: paper.arxivId,
        pdfUrl: paper.pdfUrl,
      },
    })
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : 'Could not analyze this paper.',
    })
  }
})

app.get('/api/guide/:id', async (request, response) => {
  const id = request.params.id
  if (Array.isArray(id)) {
    response.status(400).json({ error: 'Invalid guide id.' })
    return
  }
  const guide = await getGuide(id)
  if (!guide) {
    response.status(404).json({ error: 'Guide not found. Re-analyze the paper.' })
    return
  }
  response.json(guide)
})

app.post('/api/clarify', requireAuth, async (request, response) => {
  const parsed = clarifyRequestSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid clarify request', details: parsed.error.flatten() })
    return
  }
  if (!hasGemini()) {
    response.status(503).json({ error: 'AI clarify is unavailable right now.' })
    return
  }
  const { selection, question, guideTitle } = parsed.data
  try {
    const contents = `Guide: ${guideTitle ?? 'Research paper prerequisites'}\nHighlighted text: "${selection}"\nQuestion: ${question}`
    const result = await withGeminiModelRetry(textModelChain(TEACH_MODEL), (client, model) =>
      client.models.generateContent({
        model,
        contents,
        config: { systemInstruction: CLARIFY_SYSTEM },
      }),
    )
    const answer = result.text?.trim()
    if (!answer) {
      response.status(502).json({ error: 'No answer returned.' })
      return
    }
    response.json({ answer })
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'Could not clarify this selection.',
    })
  }
})

// Rich PDF: headless Chromium renders the actual guide page (math, diagrams,
// pagination) with embedded fonts, so it renders in every viewer. Public to
// match GET /api/guide/:id — guide data is already reachable by id.
app.get('/api/guide/:id/guide.pdf', async (request, response) => {
  const id = request.params.id
  if (Array.isArray(id)) {
    response.status(400).json({ error: 'Invalid guide id.' })
    return
  }
  const guide = await getGuide(id)
  if (!guide) {
    response.status(404).json({ error: 'Guide not found. Re-analyze the paper.' })
    return
  }
  // ?flatten=1 → image-only PDF (zero fonts) that renders in any viewer, for
  // clients where the vector Type3 glyphs don't display (e.g. some in-app previews).
  const flatten = request.query.flatten === '1' || request.query.flatten === 'true'
  try {
    const url = guideExportUrl(id)
    const pdf = flatten ? await renderGuidePdfFlattened(url) : await renderGuidePdf(url)
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', `inline; filename="${sanitizePdfFilename(guide.title)}.pdf"`)
    response.send(pdf)
  } catch (error) {
    console.error('guide.pdf render failed:', error)
    response.status(503).json({
      error: 'Could not render the PDF right now. Try the in-browser download instead.',
    })
  }
})

app.get('/api/guide/:id/report.pdf', requireAuth, async (request, response) => {
  const id = request.params.id
  if (Array.isArray(id)) {
    response.status(400).json({ error: 'Invalid guide id.' })
    return
  }
  const guide = await getGuide(id)
  if (!guide) {
    response.status(404).json({ error: 'Guide not found. Re-analyze the paper.' })
    return
  }
  writeGuidePdf(guide, response)
})

app.post('/api/report.pdf', requireAuth, async (request, response) => {
  const parsed = paperRequestSchema.safeParse(request.body)

  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid report request', details: parsed.error.flatten() })
    return
  }

  try {
    const paper = await resolvePaperInput(parsed.data)
    const report = await analyzePaper(paper)
    writeGuidePdf(report, response)
  } catch (error) {
    if (response.headersSent) {
      response.end()
      return
    }
    response.status(422).json({
      error: error instanceof Error ? error.message : 'Could not generate a report for this paper.',
    })
  }
})

app.listen(port, () => {
  console.log(`Simply API listening on http://localhost:${port}`)
})
