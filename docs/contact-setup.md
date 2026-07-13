# Contact form (EmailJS)

Free tier (200 emails/month). No backend.

## EmailJS template (one-time)

[Email Templates](https://dashboard.emailjs.com/admin/templates) → **Create**:

| Field | Value |
|-------|-------|
| **To** | `admin@usesimply.us` |
| **From name** | `Simply` |
| **Reply-To** | `{{reply_to}}` |
| **Subject** | `{{subject}}` |
| **Content** | `{{{body}}}` |

Copy the **Template ID** (`template_…`), then run:

```bash
./scripts/setup-emailjs-env.sh template_xxxx
```

## Security

[Account → Security](https://dashboard.emailjs.com/admin/account/security):

- Allowed domains: `usesimply.us`, `localhost`
- Do **not** enable “API access from non-browser” (not needed)

## Env vars

| Variable | Where |
|----------|-------|
| `VITE_EMAILJS_SERVICE_ID` | `.env` + GitHub secret |
| `VITE_EMAILJS_TEMPLATE_ID` | `.env` + GitHub secret |
| `VITE_EMAILJS_PUBLIC_KEY` | `.env` + GitHub secret |

Emails are styled in `src/contact.ts` (Simply palette) and signed **Simply · admin@usesimply.us · usesimply.us**.
