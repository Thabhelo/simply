import { useState, type FormEvent } from 'react'
import { ArrowLeft, Check, LoaderCircle, Mail } from 'lucide-react'
import { isContactFormConfigured } from './contact/config'
import { ContactNotConfiguredError, sendContactMessage } from './contact/send'
import './LegalPage.css'

const SUPPORT_EMAIL = 'thabhelo.duve@talladega.edu'

type FormState = 'idle' | 'submitting' | 'success' | 'error'

const TOPICS = [
  { value: 'general', label: 'General question' },
  { value: 'feedback', label: 'Product feedback' },
  { value: 'bug', label: 'Bug report' },
  { value: 'security', label: 'Security concern' },
] as const

export default function ContactPage() {
  const [state, setState] = useState<FormState>('idle')
  const [error, setError] = useState('')
  const formReady = isContactFormConfigured()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state === 'submitting') return

    const form = event.currentTarget
    const data = new FormData(form)
    const website = String(data.get('website') ?? '').trim()
    if (website) {
      setState('success')
      return
    }

    setState('submitting')
    setError('')

    try {
      await sendContactMessage({
        name: String(data.get('name') ?? '').trim(),
        email: String(data.get('email') ?? '').trim(),
        topic: String(data.get('topic') ?? 'general'),
        message: String(data.get('message') ?? '').trim(),
      })

      form.reset()
      setState('success')
    } catch (submitError) {
      setState('error')
      if (submitError instanceof ContactNotConfiguredError) {
        setError('The contact form is not set up yet. Please email us directly.')
      } else {
        setError(
          submitError instanceof Error ? submitError.message : 'Could not send your message.',
        )
      }
    }
  }

  return (
    <main className="legal-page">
      <header className="legal-header">
        <a className="legal-back" href="/">
          <ArrowLeft size={16} />
          Simply
        </a>
        <nav className="legal-nav" aria-label="Legal and support">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/security">Security</a>
          <a href="/contact" aria-current="page">
            Contact
          </a>
        </nav>
      </header>

      <article className="legal-article contact-article">
        <p className="legal-updated">We read every message</p>
        <h1>Contact</h1>
        <p className="legal-summary">
          Questions about Simply, the extension, your account, or a security issue? Send a note
          below and it goes straight to the builder. For urgent security reports, choose
          “Security concern”.
        </p>

        <div className="contact-direct">
          <Mail size={16} aria-hidden />
          <span>
            Prefer email? Write to{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </span>
        </div>

        {state === 'success' ? (
          <div className="contact-status contact-status-success" role="status">
            <Check size={18} />
            <div>
              <strong>Message sent.</strong>
              <p>Thanks — we&apos;ll reply to the address you provided.</p>
            </div>
          </div>
        ) : (
          <form className="contact-form" onSubmit={(event) => void handleSubmit(event)}>
            {!formReady ? (
              <p className="contact-unconfigured" role="status">
                The web form is not live yet. Please use the email link above — we&apos;ll still
                get your message.
              </p>
            ) : null}

            <label>
              Name
              <input name="name" type="text" required autoComplete="name" maxLength={120} />
            </label>

            <label>
              Email
              <input name="email" type="email" required autoComplete="email" maxLength={254} />
            </label>

            <label>
              Topic
              <select name="topic" defaultValue="general">
                {TOPICS.map((topic) => (
                  <option key={topic.value} value={topic.value}>
                    {topic.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Message
              <textarea
                name="message"
                required
                rows={7}
                minLength={10}
                maxLength={5000}
                placeholder="Tell us what you need help with."
              />
            </label>

            <label className="contact-honeypot" aria-hidden="true" tabIndex={-1}>
              Website
              <input name="website" type="text" tabIndex={-1} autoComplete="off" />
            </label>

            {state === 'error' ? (
              <p className="contact-error" role="alert">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={state === 'submitting' || !formReady}>
              {state === 'submitting' ? (
                <>
                  <LoaderCircle size={16} className="contact-spinner" />
                  Sending…
                </>
              ) : (
                'Send message'
              )}
            </button>
          </form>
        )}
      </article>

      <footer className="legal-footer">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/security">Security</a>
        <a href="/contact">Contact</a>
        <a href="/">Home</a>
      </footer>
    </main>
  )
}
