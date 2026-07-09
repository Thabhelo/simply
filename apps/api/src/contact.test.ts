import { describe, expect, it, vi } from 'vitest'
import {
  buildContactEmailHtml,
  checkContactRateLimit,
  ContactRateLimitError,
  ContactUnavailableError,
  contactRequestSchema,
  sendContactEmail,
} from './contact.js'

describe('contactRequestSchema', () => {
  it('accepts a valid payload', () => {
    const parsed = contactRequestSchema.safeParse({
      name: 'Ada',
      email: 'ada@example.com',
      topic: 'feedback',
      message: 'This guide helped me read the paper.',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects honeypot input', () => {
    const parsed = contactRequestSchema.safeParse({
      name: 'Bot',
      email: 'bot@example.com',
      message: 'spam spam spam spam',
      website: 'https://spam.test',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('checkContactRateLimit', () => {
  it('blocks after five submissions in the window', () => {
    const ip = 'test-ip'
    for (let i = 0; i < 5; i++) {
      checkContactRateLimit(ip, 1_000 + i)
    }
    expect(() => checkContactRateLimit(ip, 2_000)).toThrow(ContactRateLimitError)
  })
})

describe('sendContactEmail', () => {
  it('throws when Resend is not configured', async () => {
    await expect(
      sendContactEmail(
        {
          name: 'Ada',
          email: 'ada@example.com',
          topic: 'general',
          message: 'Hello from the contact form.',
        },
        { apiKey: '' },
      ),
    ).rejects.toBeInstanceOf(ContactUnavailableError)
  })

  it('sends via the mailer with reply-to set to the visitor', async () => {
    const send = vi.fn().mockResolvedValue({ error: null })
    await sendContactEmail(
      {
        name: 'Ada',
        email: 'ada@example.com',
        topic: 'security',
        message: 'I found a concern in the extension.',
      },
      {
        apiKey: 're_test',
        mailer: { send },
        toEmail: 'builder@example.com',
        fromEmail: 'Simply <noreply@example.com>',
      },
    )

    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0]).toMatchObject({
      to: 'builder@example.com',
      from: 'Simply <noreply@example.com>',
      replyTo: 'ada@example.com',
      subject: '[Simply] Security — Ada',
    })
    expect(buildContactEmailHtml({
      name: 'Ada',
      email: 'ada@example.com',
      topic: 'security',
      message: 'I found a concern in the extension.',
    })).toContain('Security')
  })
})
