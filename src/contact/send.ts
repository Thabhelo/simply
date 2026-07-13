import emailjs from '@emailjs/browser'
import {
  emailJsPublicKey,
  emailJsServiceId,
  emailJsTemplateId,
  isContactFormConfigured,
} from './config'

export type ContactPayload = {
  name: string
  email: string
  topic: string
  message: string
}

const TOPIC_LABELS: Record<string, string> = {
  general: 'General question',
  feedback: 'Product feedback',
  bug: 'Bug report',
  security: 'Security concern',
}

export class ContactNotConfiguredError extends Error {
  constructor() {
    super('Contact form is not configured yet.')
    this.name = 'ContactNotConfiguredError'
  }
}

export async function sendContactMessage(payload: ContactPayload) {
  if (!isContactFormConfigured()) {
    throw new ContactNotConfiguredError()
  }

  const topicLabel = TOPIC_LABELS[payload.topic] ?? payload.topic

  await emailjs.send(
    emailJsServiceId,
    emailJsTemplateId,
    {
      from_name: payload.name,
      reply_to: payload.email,
      topic: topicLabel,
      message: payload.message,
      subject: `[Simply] ${topicLabel} — ${payload.name}`,
    },
    { publicKey: emailJsPublicKey },
  )
}
