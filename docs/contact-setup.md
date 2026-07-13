# Contact form (EmailJS)

Simply's `/contact` page sends mail through [EmailJS](https://www.emailjs.com/) — free for up to **200 emails/month**, no backend or paid API key required.

## 1. Create an EmailJS account

Sign up at https://www.emailjs.com/ (free tier is enough).

## 2. Connect an email service

1. **Email Services** → **Add new service**
2. Choose **Gmail** (or your inbox provider) and connect the account that should receive messages (`thabhelo.duve@talladega.edu`).
3. Note the **Service ID** (e.g. `service_abc123`).

## 3. Create an email template

1. **Email Templates** → **Create new template**
2. Suggested settings:
   - **To:** your inbox address
   - **Reply-To:** `{{reply_to}}`
   - **Subject:** `{{subject}}`
3. Body example:

```
New Simply contact message

Topic: {{topic}}
Name: {{from_name}}
Email: {{reply_to}}

{{message}}
```

4. Note the **Template ID** (e.g. `template_xyz789`).

Template variables sent by the app:

| Variable    | Description              |
|-------------|--------------------------|
| `from_name` | Visitor name             |
| `reply_to`  | Visitor email (reply-to) |
| `topic`     | Human-readable topic     |
| `message`   | Message body             |
| `subject`   | `[Simply] Topic — Name`  |

## 4. Get your public key

**Account** → **API keys** → copy the **Public Key**.

## 5. Restrict by domain (recommended)

**Account** → **Security** → allow only:

- `usesimply.us`
- `localhost` (for local dev)

## 6. Configure env vars

Local dev — create `.env` in the repo root:

```bash
VITE_EMAILJS_SERVICE_ID=service_xxxx
VITE_EMAILJS_TEMPLATE_ID=template_xxxx
VITE_EMAILJS_PUBLIC_KEY=your_public_key
```

Production — add GitHub secrets (Settings → Secrets → Actions):

```bash
gh secret set VITE_EMAILJS_SERVICE_ID --body "service_xxxx"
gh secret set VITE_EMAILJS_TEMPLATE_ID --body "template_xxxx"
gh secret set VITE_EMAILJS_PUBLIC_KEY --body "your_public_key"
```

Redeploy (push to `main` or run the Deploy workflow). The build injects these into the static site.

## 7. Test

```bash
npm run dev:web
```

Open http://localhost:5173/contact, submit a test message, and confirm it arrives in your inbox with the correct reply-to.

## Fallback

If EmailJS is not configured, the page still shows a **mailto** link. The submit button stays disabled until the three env vars are set.
