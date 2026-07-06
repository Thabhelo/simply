# OAuth consent screen (Simply)

Google does not expose full OAuth consent configuration via a stable public CLI. Use the Console once, then verify extension sign-in.

## 1. Branding

Open: https://console.cloud.google.com/auth/branding?project=simply-def0f-e4e3f

| Field | Value |
|-------|--------|
| App name | Simply |
| User support email | thabhelo.duve@talladega.edu |
| App home page | https://simply-def0f-e4e3f.web.app |
| Privacy policy | https://simply-def0f-e4e3f.web.app/privacy |
| Terms of service | https://simply-def0f-e4e3f.web.app/terms |
| Authorized domains | `simply-def0f-e4e3f.web.app`, `simply-def0f-e4e3f.firebaseapp.com`, `localhost` |

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
