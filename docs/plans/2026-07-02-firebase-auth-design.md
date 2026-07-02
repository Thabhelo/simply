# Firebase Auth — Design

Date: 2026-07-02
Status: **Implemented (backend verified; extension sign-in pending an OAuth client ID)**

## What was built

- **API**: `src/auth.ts` — `firebase-admin` init + `requireAuth` middleware (injectable
  `createRequireAuth` for testing). Wired onto `POST /api/analyze`, `/api/ingest`,
  `/api/report.pdf`. `GET /api/guide/:id` left open (id is a content hash; returns only
  public paper-derived content). 5 unit tests pass. Verified live: protected routes 401
  without a valid token; `/health` open. Dev escape hatch `AUTH_REQUIRED=false`.
- **CORS**: left open **by design** — the content script calls from arbitrary paper origins,
  and Bearer tokens (not cookies) mean there are no ambient credentials to abuse. Documented
  in `server.ts`.
- **Extension**: `src/auth.ts` — REST-based Firebase sign-in (no Web SDK). `launchWebAuthFlow`
  → Google id_token → Identity Toolkit `signInWithIdp` → session in `chrome.storage.local`;
  `authedFetch` attaches the ID token and refreshes via the secure-token endpoint. Popup has
  sign-in/out UI; both popup and content-widget calls go through `authedFetch`. Content
  script built as a self-contained IIFE (`vite.content.config.ts`) since MV3 forbids ES
  `import` there. Builds clean.
- **Landing app** (Thabhelo's lane): contract + reference snippet in
  `docs/landing-auth-contract.md`.

## Remaining setup (blocks live extension sign-in)

1. Create an **OAuth 2.0 Web client ID** in Google Cloud Console for project `simply-def0f`
   (or reuse the one Firebase auto-created when Google sign-in was enabled).
2. Load the unpacked extension, note its ID, and add
   `https://<extension-id>.chromiumapp.org/` to that client's Authorized redirect URIs.
3. Paste the client ID into `OAUTH_CLIENT_ID` in `apps/extension/src/auth.ts` and rebuild.
4. Enable **Google** provider in Firebase console → Authentication → Sign-in method.

Then verify: sign in from the popup → Analyze succeeds; sign out → Analyze reports "sign in".

---

## Original design

Date: 2026-07-02
Status: **Draft — awaiting confirmation** (user stepped away during brainstorming; defaults below are assumptions)

## Problem

Simply has no authentication. Three surfaces — the landing app (React/Vite), the Chrome
MV3 extension, and the Express API — are all open. The API's `POST /api/analyze` calls
Gemini on every request, so anonymous or scripted traffic burns quota/cost directly. CORS
is wide open (`app.use(cors())`).

## Assumptions (confirm or override)

1. **Goal = protect the API + establish identity.** Require a signed-in Firebase user to
   call the analysis endpoints. *Not* building per-user saved-guide storage yet (YAGNI —
   the content-hash cache stays). Flag if you actually want saved history.
2. **Provider = Google sign-in only.** Best fit for a Chrome extension (users already have
   a Google identity in-browser) and the simplest Firebase provider. Email/password can be
   added later.
3. **Both surfaces sign in.** Extension popup (primary product surface) and landing app.
4. **Dev stays frictionless.** If Firebase creds aren't configured, the API logs a warning
   and runs open — mirroring the existing `GEMINI_API_KEY` basic-mode pattern — so local
   work doesn't require a Firebase project.

## Architecture

```
Extension popup ──┐                         ┌── firebase-admin verifyIdToken()
Landing app    ──┤ Firebase Auth (Google)   │
                 └─► ID token ──Authorization: Bearer──► Express requireAuth middleware
                                                          → req.uid → route handlers
```

- **Client** (extension + landing): Firebase Web SDK obtains a Google sign-in and a short-
  lived **ID token**. Every API call sends `Authorization: Bearer <idToken>`.
- **Server**: `firebase-admin` verifies the token (`admin.auth().verifyIdToken`), attaches
  `req.uid`, and rejects with 401 otherwise. Protected: `/api/analyze`, `/api/ingest`,
  `/api/report.pdf`, `/api/guide/:id`. Open: `/health`.

## Component breakdown

### API (my lane)
- Add `firebase-admin` dependency.
- `src/auth.ts`: init admin from `FIREBASE_SERVICE_ACCOUNT` (inline JSON) or
  `GOOGLE_APPLICATION_CREDENTIALS`; export `requireAuth` middleware. If no creds →
  `authEnabled = false`, log warning, middleware becomes a pass-through (dev mode).
- Wire `requireAuth` onto the protected routes in `server.ts`.
- Tighten CORS to an allowlist: landing origin + `chrome-extension://<id>`.

### Extension (my lane)
- MV3 can't use `signInWithPopup` in the popup reliably. Use
  `chrome.identity.launchWebAuthFlow` against Firebase's hosted auth handler (works for
  unpacked dev builds; no Chrome Web Store OAuth client needed), then
  `signInWithCredential`. Add `"identity"` permission + `oauth2`/host entries to manifest.
- Popup shows Sign in / signed-in state; cache the ID token, refresh on expiry, attach it
  to `content.ts`/`popup.ts` fetches.

### Landing app (Thabhelo's lane — I provide the contract, not the UI)
- Firebase Web SDK `signInWithPopup(GoogleAuthProvider)`; attach `getIdToken()` to the
  `/api/*` fetches. I'll hand him the config shape + a reference snippet.

## What I need from you (secrets/setup I can't create solo)
- A Firebase project (project ID).
- Web app config: `apiKey`, `authDomain`, `projectId`, `appId` (client SDKs).
- A service account JSON for `firebase-admin` (backend) → into `apps/api/.env` (gitignored).
- Google provider enabled in the Firebase console.
- (Extension) an OAuth 2.0 client ID.

I can write all the code behind env config now; it stays inert (dev open-mode) until the
creds land. There's also a Firebase MCP available — if you log in, I can help provision the
project and enable the provider directly.

## Testing
- Unit: `requireAuth` rejects missing/invalid/expired tokens (mock `verifyIdToken`);
  passes through in dev open-mode. Vitest is already set up in `apps/api`.
- Manual: signed-in extension → analyze succeeds; token stripped → 401.

## Out of scope (YAGNI for now)
- Per-user guide history / datastore.
- Email/password, other providers.
- Roles/tiers/quota-per-user (can layer on `req.uid` later).
