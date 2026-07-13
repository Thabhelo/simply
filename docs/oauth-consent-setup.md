# OAuth consent screen (Simply)

Google does not expose full OAuth consent configuration via a stable public CLI. Use the Console once, then verify extension sign-in.

## 1. Branding

Open: https://console.cloud.google.com/auth/branding?project=simply-def0f-e4e3f

| Field | Value |
|-------|--------|
| App name | Simply |
| User support email | thabhelo.duve@talladega.edu |
| App home page | https://usesimply.us |
| Privacy policy | https://usesimply.us/privacy |
| Terms of service | https://usesimply.us/terms |
| Authorized domains | `usesimply.us`, `simply-def0f-e4e3f.web.app`, `simply-def0f-e4e3f.firebaseapp.com`, `localhost` |

## 2. Audience

Open: https://console.cloud.google.com/auth/audience?project=simply-def0f-e4e3f

- **Testing:** add test users (your Gmail + Talladega email) while developing.
- **Production:** switch to “In production” before public Chrome Web Store launch (may require Google verification for sensitive scopes).

## 3. Scopes

Open: https://console.cloud.google.com/auth/scopes?project=simply-def0f-e4e3f

Simply uses standard Google sign-in scopes only:

- `openid`
- `email`
- `profile`

No additional sensitive scopes required.

## 4. Verify

1. Reload the extension.
2. Sign in from the popup.
3. Analyze a paper on arXiv.

If you see “access blocked” or “app not verified”, add your account as a test user (Testing mode) or complete verification (Production).

## 5. Extension OAuth client

1. Open [GCP Credentials](https://console.cloud.google.com/apis/credentials?project=simply-def0f-e4e3f).
2. Under **OAuth 2.0 Client IDs**, copy the **Web client** ID (auto-created when the Firebase web app was registered).
3. Edit that Web client → **Authorized redirect URIs** → add the extension redirect (from `chrome://extensions`, extension ID `jjpldcfebfpphoobponjaohplkkhkcnl`):
   ```text
   https://jjpldcfebfpphoobponjaohplkkhkcnl.chromiumapp.org/
   ```
4. Paste the client ID into `apps/extension/src/auth.ts` → `OAUTH_CLIENT_ID`.
5. Rebuild: `npm run build --workspace apps/extension`

## 6. API service account (local dev)

Copy `apps/api/.env.example` to `apps/api/.env` and set:

- `FIREBASE_SERVICE_ACCOUNT_PATH` — path to your Firebase Admin SDK JSON (outside the repo)
- `GEMINI_API_KEY` — from Google AI Studio

On Cloud Run, `FIREBASE_SERVICE_ACCOUNT_B64` is synced via `scripts/deploy-gcp.sh` / GitHub Actions (see `scripts/setup-github-deploy.sh`).

Enable **Google** under [Firebase Authentication → Sign-in method](https://console.firebase.google.com/project/simply-def0f-e4e3f/authentication/providers). Landing sign-in uses `src/firebase.ts` (public config) with `signInWithPopup`.

## 7. Custom domain (`usesimply.us`)

Production site URL: **https://usesimply.us** (DNS via Cloudflare Registrar; hosting stays on Firebase).

```bash
./scripts/setup-usesimply-domain.sh   # Auth domain + print Cloudflare DNS records
```

Manual steps (no CLI access from this repo):

1. **Cloudflare DNS** — add the A + TXT records the script prints (grey cloud / DNS only until Firebase shows Connected).
2. [OAuth branding](https://console.cloud.google.com/auth/branding?project=simply-def0f-e4e3f) — home/privacy/terms URLs + authorized domain `usesimply.us` (or run `./scripts/setup-oauth-consent.sh` after `gcloud auth login`).
3. **Cloud Run** — `gcloud run services update simply-api --update-env-vars WEB_APP_URL=https://usesimply.us` (after `gcloud auth login`) so PDF export loads the custom domain.
4. **Delete** any Cloudflare Pages/Workers project linked to the GitHub repo.

Deploys stay on GitHub Actions → `.github/workflows/deploy.yml` (not Cloudflare Pages).
