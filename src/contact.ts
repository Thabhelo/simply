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

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function isContactFormReady() {
  return Boolean(serviceId && templateId && publicKey)
}

export function buildContactEmail(payload: {
  name: string
  email: string
  topic: string
  message: string
}) {
  const topic = TOPICS[payload.topic] ?? payload.topic
  const name = escapeHtml(payload.name)
  const email = escapeHtml(payload.email)
  const message = escapeHtml(payload.message)

  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f3ebe3;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#3d2e24;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr>
      <td style="background:#fffaf5;border:1px solid #dccfc2;border-radius:14px;padding:28px 24px;">
        <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:-0.04em;">simply</p>
        <p style="margin:0 0 20px;height:3px;width:40px;background:#c4511d;border-radius:2px;"></p>
        <p style="margin:0 0 18px;display:inline-block;padding:6px 12px;background:#faefe4;border:1px solid #e8a882;border-radius:999px;font-size:13px;color:#7a6b5c;">${escapeHtml(topic)}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#7a6b5c;"><strong style="color:#3d2e24;">From</strong> ${name}</p>
        <p style="margin:0 0 20px;font-size:14px;color:#7a6b5c;"><strong style="color:#3d2e24;">Email</strong> ${email}</p>
        <div style="background:#f3ebe3;border:1px solid #dccfc2;border-radius:10px;padding:16px 18px;font-size:15px;line-height:1.6;white-space:pre-wrap;">${message}</div>
        <p style="margin:24px 0 0;font-size:13px;color:#7a6b5c;line-height:1.5;">
          Simply · <a href="mailto:admin@usesimply.us" style="color:#3d6a8c;">admin@usesimply.us</a> ·
          <a href="https://usesimply.us" style="color:#3d6a8c;">usesimply.us</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
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
      body: buildContactEmail(payload),
    },
    { publicKey },
  )
}
