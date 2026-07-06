# Firebase auth setup (project: simply-def0f-e4e3f)

Account: **thabhelo.duve@talladega.edu**

## 1. Service account (local API) — done

The admin SDK key lives outside the repo:

```text
/Users/thabhelo/secrets/simply-firebase.json
```

`apps/api/.env`:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=/Users/thabhelo/secrets/simply-firebase.json
GEMINI_API_KEY=...
```

Restart the API. You should see:

```text
Simply: auth enabled (Firebase ID token verification)
```

## 2. Enable Google sign-in (Firebase Console)

1. Open [Firebase Authentication](https://console.firebase.google.com/project/simply-def0f-e4e3f/authentication/providers) **while signed in as thabhelo.duve@talladega.edu**.
2. **Sign-in method** → **Google** → **Enable** → Save.
3. Under **Authorized domains**, confirm `localhost` is listed (for the landing app).

## 3. Extension OAuth client ID

1. Open [GCP Credentials](https://console.cloud.google.com/apis/credentials?project=simply-def0f-e4e3f).
2. Under **OAuth 2.0 Client IDs**, copy the **Web client** ID (auto-created when the Firebase web app was registered). It looks like `448198565907-xxxxxxxx.apps.googleusercontent.com`.
3. Load the unpacked extension in Chrome (`chrome://extensions`) and confirm its ID is `jjpldcfebfpphoobponjaohplkkhkcnl` (stable — set by the `key` in `manifest.json`).
4. Edit that Web client → **Authorized redirect URIs** → add:
   ```text
   https://jjpldcfebfpphoobponjaohplkkhkcnl.chromiumapp.org/
   ```
5. Paste the client ID into `apps/extension/src/auth.ts` → `OAUTH_CLIENT_ID`.
6. Rebuild: `npm run build --workspace apps/extension`

## 4. Landing app

Client config is in `src/firebase.ts` (public, not secret). Google sign-in uses `signInWithPopup` — no extra env vars for local dev.

## 5. Production secrets

| Surface | Secret | Where |
|---------|--------|--------|
| Cloud Run API | `GEMINI_API_KEY` | GCP Secret Manager (see `scripts/deploy-gcp.sh`) |
| Cloud Run API | `FIREBASE_SERVICE_ACCOUNT_B64` | GCP Secret Manager |
| Firebase Hosting (landing) | `VITE_API_BASE` | Baked in at deploy via `scripts/deploy-all-gcp.sh` |
| Extension | `OAUTH_CLIENT_ID` | Hardcoded in `apps/extension/src/auth.ts` (public client id) |

See GitHub issue [#16](https://github.com/Thabhelo/simply/issues/16) for the Vercel + GCP production checklist.
