import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import PDFDocument from 'pdfkit'
import { z } from 'zod'

const app = express()
const port = Number(process.env.PORT ?? 8787)

app.use(cors())
app.use(express.json({ limit: '5mb' }))

const analysisRequestSchema = z.object({
  title: z.string().optional(),
  url: z.string().url().optional(),
  text: z.string().min(1).max(120_000),
})

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

function analyzePaper(input: z.infer<typeof analysisRequestSchema>) {
  const normalizedText = `${input.title ?? ''}\n${input.url ?? ''}\n${input.text}`
  const detected = concepts.filter((concept) =>
    concept.triggers.some((trigger) => trigger.test(normalizedText)),
  )
  const fallback = detected.length > 0 ? detected : concepts.slice(0, 4)

  return {
    title: input.title?.trim() || 'Untitled research paper',
    url: input.url,
    summary:
      'Unfog found the prerequisite math and ML ideas that are likely to block a first pass through this paper.',
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
  response.json({ ok: true, service: 'unfog-api' })
})

app.post('/api/analyze', (request, response) => {
  const parsed = analysisRequestSchema.safeParse(request.body)

  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid analysis request', details: parsed.error.flatten() })
    return
  }

  response.json(analyzePaper(parsed.data))
})

app.post('/api/report.pdf', (request, response) => {
  const parsed = analysisRequestSchema.safeParse(request.body)

  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid report request', details: parsed.error.flatten() })
    return
  }

  const report = analyzePaper(parsed.data)
  const document = new PDFDocument({ margin: 48 })

  response.setHeader('Content-Type', 'application/pdf')
  response.setHeader('Content-Disposition', 'attachment; filename="unfog-guide.pdf"')
  document.pipe(response)

  document.fontSize(26).text(`Unfog Guide: ${report.title}`, { lineGap: 8 })
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
})

app.listen(port, () => {
  console.log(`unfog API listening on http://localhost:${port}`)
})
