import emailjs from '@emailjs/browser'

const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID ?? ''
const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID ?? ''
const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY ?? ''

const TOPICS: Record<string, string> = {
  general: 'General question',
  feedback: 'Product feedback',
  bug: 'Bug report',
  security: 'Security concern',
}

export function isContactFormReady() {
  return Boolean(serviceId && templateId && publicKey)
}

export async function sendContactMessage(payload: {
  name: string
  email: string
  topic: string
  message: string
}) {
  if (!isContactFormReady()) {
    throw new Error('Contact form is not configured.')
  }

  const topic = TOPICS[payload.topic] ?? payload.topic

  await emailjs.send(
    serviceId,
    templateId,
    {
      subject: `[Simply] ${topic} — ${payload.name}`,
      reply_to: payload.email,
      from_name: payload.name,
      topic,
      message: payload.message,
    },
    { publicKey },
  )
}
