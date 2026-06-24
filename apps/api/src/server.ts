import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { PDFParse } from 'pdf-parse'
import PDFDocument from 'pdfkit'
import { z } from 'zod'
import { GoogleGenAI, Type } from '@google/genai'
import { AREAS, maxLessons } from './types.js'
import type { Prerequisite, Lesson, Guide } from './types.js'
import { buildDetectInput, detectBasic, lessonsFromBasic, lessonFromPrereq, projectConcepts, nextSteps, cacheKey, filterBuildsOn } from './analysis.js'

const app = express()
const port = Number(process.env.PORT ?? 8787)
const maxTextLength = 120_000
const maxPdfBytes = 25 * 1024 * 1024

// gemini-2.5-flash is the README-documented stable Flash id; gemini-3.5-flash may be current — flip here if your key has access
const DETECT_MODEL = 'gemini-2.5-flash'
const TEACH_MODEL = 'gemini-2.5-flash'
const maxDetectChars = maxTextLength // feed the full ingested paper (bounded to 120k) — Gemini's large context is the reason for switching

const apiKey = process.env.GEMINI_API_KEY
const genai = apiKey ? new GoogleGenAI({ apiKey }) : null
console.log(
  genai
    ? `Simply: AI mode enabled (${DETECT_MODEL})`
    : 'Simply: GEMINI_API_KEY not set — running in basic mode',
)

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

async function resolvePaperInput(input: PaperRequest): Promise<ResolvedPaper> {
  const providedText = normalizeWhitespace(input.text ?? '')

  if (providedText) {
    return {
      title: input.title?.trim() || 'Untitled research paper',
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
      title: input.title?.trim() || page.title,
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
    title: input.title?.trim() || title || source.arxivId || 'Untitled research paper',
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
    if (oldest !== undefined && oldest !== id) guideCache.delete(oldest) // FIFO evict; guard satisfies strict types
  }
  guideCache.set(id, guide) // store last guide (ai or basic) so GET /api/guide/:id can serve it
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
  // JSON.parse can throw on a malformed response — analyzePaper try/catches the whole call, so a throw -> basic mode
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
  return settled.map((res, i) => (res.status === 'fulfilled' ? res.value : lessonFromPrereq(prereqs[i])))
}

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'simply-api' })
})

app.post('/api/ingest', async (request, response) => {
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

app.post('/api/analyze', async (request, response) => {
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

app.get('/api/guide/:id', (request, response) => {
  const guide = guideCache.get(request.params.id)
  if (!guide) {
    response.status(404).json({ error: 'Guide not found — re-analyze the paper.' })
    return
  }
  response.json(guide)
})

app.post('/api/report.pdf', async (request, response) => {
  const parsed = paperRequestSchema.safeParse(request.body)

  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid report request', details: parsed.error.flatten() })
    return
  }

  try {
    const paper = await resolvePaperInput(parsed.data)
    const report = await analyzePaper(paper)
    const document = new PDFDocument({ margin: 48 })
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', 'attachment; filename="simply-guide.pdf"')
    document.pipe(response)

    document.fontSize(26).fillColor('#101827').text(`Simply Guide: ${report.title}`, { lineGap: 8 })
    document.moveDown()
    document.fontSize(12).fillColor('#667085').text(report.overview || report.summary)
    if (report.mode === 'basic') {
      document.moveDown(0.5).fontSize(10).fillColor('#c24a1a').text('Basic mode — set GEMINI_API_KEY for full AI lessons.')
    }
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
  } catch (error) {
    if (response.headersSent) {
      response.end() // streaming already started; cannot send a 422 body
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
