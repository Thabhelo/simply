import { Resend } from 'resend'
import { z } from 'zod'

export const contactRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  topic: z.enum(['general', 'bug', 'security', 'feedback']).default('general'),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(0).optional(),
})

export type ContactRequest = z.infer<typeof contactRequestSchema>

export class ContactUnavailableError extends Error {
  constructor(message = 'Contact email is not configured.') {
    super(message)
    this.name = 'ContactUnavailableError'
  }
}

export class ContactRateLimitError extends Error {
  constructor(message = 'Too many messages. Try again later.') {
    super(message)
    this.name = 'ContactRateLimitError'
  }
}

const TOPIC_LABELS: Record<ContactRequest['topic'], string> = {
  general: 'General',
  bug: 'Bug report',
  security: 'Security',
  feedback: 'Feedback',
}

const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_MAX = 5
const hits = new Map<string, number[]>()

function clientIp(forwardedFor: string | undefined, remoteAddress: string | undefined) {
  const first = forwardedFor?.split(',')[0]?.trim()
  return first || remoteAddress || 'unknown'
}

export function checkContactRateLimit(ip: string, now = Date.now()) {
  const windowStart = now - RATE_WINDOW_MS
  const recent = (hits.get(ip) ?? []).filter((t) => t > windowStart)
  if (recent.length >= RATE_MAX) {
    throw new ContactRateLimitError()
  }
  recent.push(now)
  hits.set(ip, recent)
}

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildContactEmailHtml(payload: ContactRequest) {
  const topic = TOPIC_LABELS[payload.topic]
  return `
    <h2>New Simply contact message</h2>
    <p><strong>Topic:</strong> ${escapeHtml(topic)}</p>
    <p><strong>Name:</strong> ${escapeHtml(payload.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
    <p><strong>Message:</strong></p>
    <pre style="white-space:pre-wrap;font-family:ui-sans-serif,sans-serif;">${escapeHtml(payload.message)}</pre>
  `.trim()
}

export type ContactMailer = {
  send: (input: {
    from: string
    to: string
    replyTo: string
    subject: string
    html: string
  }) => Promise<{ error?: { message: string } | null }>
}

export function createResendMailer(apiKey: string): ContactMailer {
  const resend = new Resend(apiKey)
  return {
    send: (input) => resend.emails.send(input),
  }
}

export async function sendContactEmail(
  payload: ContactRequest,
  options?: {
    mailer?: ContactMailer
    apiKey?: string
    toEmail?: string
    fromEmail?: string
  },
) {
  const apiKey = options?.apiKey ?? process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    throw new ContactUnavailableError()
  }

  const to = options?.toEmail ?? process.env.CONTACT_TO_EMAIL?.trim() ?? 'thabhelo.duve@talladega.edu'
  const from =
    options?.fromEmail ??
    process.env.CONTACT_FROM_EMAIL?.trim() ??
    'Simply <onboarding@resend.dev>'

  const mailer = options?.mailer ?? createResendMailer(apiKey)
  const topic = TOPIC_LABELS[payload.topic]
  const result = await mailer.send({
    from,
    to,
    replyTo: payload.email,
    subject: `[Simply] ${topic} — ${payload.name}`,
    html: buildContactEmailHtml(payload),
  })

  if (result.error) {
    throw new Error(result.error.message || 'Could not send email.')
  }
}
