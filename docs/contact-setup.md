# Contact form (EmailJS)

Free tier (200 emails/month). No backend.

## EmailJS template (one-time)

[Email Templates](https://dashboard.emailjs.com/admin/templates) → **Create**.

### Template settings (above the editor)

| Field | Value |
|-------|-------|
| **To** | `admin@usesimply.us` |
| **From name** | `Simply` |
| **Reply-To** | `{{reply_to}}` |
| **Subject** | `{{subject}}` |

### Content (paste from `docs/emailjs-template.html`)

Copy the full HTML from [`docs/emailjs-template.html`](./emailjs-template.html) into the template **Content** editor (HTML mode).

Template variables used:

| Variable | Sent by app |
|----------|-------------|
| `{{subject}}` | `[Simply] Topic — Name` |
| `{{reply_to}}` | Visitor email |
| `{{from_name}}` | Visitor name |
| `{{topic}}` | Topic label |
| `{{message}}` | Message body |

Copy the **Template ID** (`template_…`), then run:

```bash
./scripts/setup-emailjs-env.sh template_xxxx
```

## Security

[Account → Security](https://dashboard.emailjs.com/admin/account/security):

- Allowed domains: `usesimply.us`, `localhost`

## Env vars

| Variable | Where |
|----------|-------|
| `VITE_EMAILJS_SERVICE_ID` | `.env` + GitHub secret |
| `VITE_EMAILJS_TEMPLATE_ID` | `.env` + GitHub secret |
| `VITE_EMAILJS_PUBLIC_KEY` | `.env` + GitHub secret |

Emails are signed **Simply · admin@usesimply.us · usesimply.us** in the template footer.
