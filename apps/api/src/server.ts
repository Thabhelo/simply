import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { PDFParse } from 'pdf-parse'
import PDFDocument from 'pdfkit'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { AREAS } from './types.js'
import type { Area, Prerequisite, Lesson, ConceptCard, AnalysisResult } from './types.js'

const app = express()
const port = Number(process.env.PORT ?? 8787)
const maxTextLength = 120_000
const maxPdfBytes = 25 * 1024 * 1024

const DETECT_MODEL = 'claude-haiku-4-5'
const TEACH_MODEL = 'claude-haiku-4-5'
const maxDetectChars = 14_000
const maxLessons = 6

const apiKey = process.env.ANTHROPIC_API_KEY
const anthropic = apiKey ? new Anthropic({ apiKey }) : null

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

type Concept = {
  area: 'Probability' | 'Statistics' | 'Linear algebra' | 'Calculus' | 'Optimization' | 'ML'
  term: string
  whyItMatters: string
  plainEnglish: string
  triggers: RegExp[]
}

const concepts: Concept[] = [
  {
    area: 'Probability',
    term: 'Bayesian inference',
    whyItMatters: 'Many ML papers model uncertainty by updating beliefs after seeing data.',
    plainEnglish: 'Start with a belief, observe evidence, and revise the belief.',
    triggers: [/bayes/i, /posterior/i, /prior/i],
  },
  {
    area: 'Probability',
    term: 'KL divergence',
    whyItMatters: 'It appears when papers compare an approximate distribution with a target distribution.',
    plainEnglish: 'A one-way penalty for how poorly one probability distribution imitates another.',
    triggers: [/kl divergence/i, /kullback/i, /relative entropy/i],
  },
  {
    area: 'Statistics',
    term: 'Monte Carlo estimation',
    whyItMatters: 'Papers use sampling when exact expectations are too expensive to compute.',
    plainEnglish: 'Estimate a hard average by drawing many random examples and averaging them.',
    triggers: [/monte carlo/i, /sampling/i, /sampled/i],
  },
  {
    area: 'Linear algebra',
    term: 'Vectors and matrices',
    whyItMatters: 'Model inputs, weights, embeddings, and transformations are usually matrix-shaped.',
    plainEnglish: 'Vectors store lists of numbers; matrices transform those lists into new lists.',
    triggers: [/matrix/i, /matrices/i, /vector/i, /linear/i],
  },
  {
    area: 'Calculus',
    term: 'Gradient',
    whyItMatters: 'Gradients tell learning algorithms which direction changes the loss fastest.',
    plainEnglish: 'A gradient is a slope for many variables at once.',
    triggers: [/gradient/i, /derivative/i, /differentiat/i],
  },
  {
    area: 'Optimization',
    term: 'Variational inference',
    whyItMatters: 'It turns an impossible inference problem into a trainable optimization problem.',
    plainEnglish: 'Pick a simpler family of distributions and tune it until it mimics the hard one.',
    triggers: [/variational/i, /evidence lower bound/i, /\belbo\b/i],
  },
  {
    area: 'ML',
    term: 'Dropout',
    whyItMatters: 'Dropout is a regularization method that also connects to uncertainty estimates.',
    plainEnglish: 'Randomly hide parts of a neural network during training so it learns robust patterns.',
    triggers: [/dropout/i, /regulari[sz]ation/i],
  },
]

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

function analyzePaper(input: ResolvedPaper) {
  const normalizedText = `${input.title ?? ''}\n${input.url ?? ''}\n${input.text}`
  const detected = concepts.filter((concept) =>
    concept.triggers.some((trigger) => trigger.test(normalizedText)),
  )
  const fallback = detected.length > 0 ? detected : concepts.slice(0, 4)

  return {
    title: input.title?.trim() || 'Untitled research paper',
    url: input.url,
    summary:
      'Simply found the prerequisite math and ML ideas that are likely to block a first pass through this paper.',
    concepts: fallback.map(({ area, term, whyItMatters, plainEnglish }) => ({
      area,
      term,
      whyItMatters,
      plainEnglish,
    })),
    nextSteps: [
      'Read the abstract and introduction once without stopping.',
      'Review the prerequisite concepts below for 20 minutes.',
      'Return to the methods section and annotate every symbol that repeats.',
      'Export this guide as a PDF and keep it beside the paper.',
    ],
  }
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

    response.json({
      ...analyzePaper(paper),
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

app.post('/api/report.pdf', async (request, response) => {
  const parsed = paperRequestSchema.safeParse(request.body)

  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid report request', details: parsed.error.flatten() })
    return
  }

  try {
    const paper = await resolvePaperInput(parsed.data)
    const report = analyzePaper(paper)
    const document = new PDFDocument({ margin: 48 })

    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', 'attachment; filename="simply-guide.pdf"')
    document.pipe(response)

    document.fontSize(26).text(`Simply Guide: ${report.title}`, { lineGap: 8 })
    document.moveDown()
    document.fontSize(12).fillColor('#475467').text(report.summary)
    document.moveDown()

    report.concepts.forEach((concept, index) => {
      document.fillColor('#101827').fontSize(16).text(`${index + 1}. ${concept.term}`)
      document.fillColor('#5b4bff').fontSize(10).text(concept.area.toUpperCase())
      document.fillColor('#344054').fontSize(12).text(`Why it matters: ${concept.whyItMatters}`)
      document.text(`Plain English: ${concept.plainEnglish}`)
      document.moveDown()
    })

    document.fillColor('#101827').fontSize(16).text('Reading plan')
    report.nextSteps.forEach((step) => document.fillColor('#344054').fontSize(12).text(`- ${step}`))
    document.end()
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : 'Could not generate a report for this paper.',
    })
  }
})

app.listen(port, () => {
  console.log(`Simply API listening on http://localhost:${port}`)
})
