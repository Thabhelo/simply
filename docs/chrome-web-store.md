# Chrome Web Store — Simply

Publish the extension at `apps/extension/` to the Chrome Web Store.

## Before you upload

### 1. OAuth (required for sign-in)

Complete these once in [GCP Console](https://console.cloud.google.com/apis/credentials?project=simply-def0f-e4e3f):

| Step | Action |
|------|--------|
| Branding | [OAuth branding](https://console.cloud.google.com/auth/branding?project=simply-def0f-e4e3f) — home `https://usesimply.us`, privacy `/privacy`, terms `/terms`, support `admin@usesimply.us` |
| Audience | [Audience](https://console.cloud.google.com/auth/audience?project=simply-def0f-e4e3f) — switch from **Testing** to **In production** before public launch |
| Redirect URI | Web client → **Authorized redirect URIs** → add the store extension redirect after upload (see below) |

**Dev vs store extension ID:** Local unpacked loads use `manifest.dev.json`, which includes a `key` field to pin ID `jjpldcfebfpphoobponjaohplkkhkcnl`. **Store uploads must not include `key`** — Chrome assigns an ID when you publish. After your first upload, open the listing → **Additional details** → copy the extension ID, then add `https://<store-extension-id>.chromiumapp.org/` to GCP redirect URIs (keep the dev URI too if you still test unpacked).

See `docs/oauth-consent-setup.md` for full details.

### 2. Build the upload zip

```bash
./scripts/package-extension.sh
```

Output: `public/simply-chrome-extension-0.1.0.zip`

Production URLs are baked in:
- API: `https://simply-api-k7ux27sa4q-uc.a.run.app`
- Web: `https://usesimply.us`

### 3. Test locally before upload

1. `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/dist`
2. Open an arXiv paper (e.g. `https://arxiv.org/abs/1706.03762`)
3. Click the Simply icon → sign in with Google → Analyze
4. Confirm the guide opens at `https://usesimply.us/guide/...`

---

## Upload to Chrome Web Store

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay the one-time $5 developer fee (if not already done)
3. **New item** → upload `public/simply-chrome-extension-0.1.0.zip`
4. Fill in the listing (copy below)
5. **Privacy** tab → single purpose, limited permissions justification
6. Submit for review (typically 1–3 business days)

After approval, copy the store URL and set it in GitHub secrets / `.env`:

```bash
gh secret set VITE_CHROME_STORE_URL --body "https://chromewebstore.google.com/detail/<your-item-id>"
```

---

## Listing copy (paste into dashboard)

### Extension name
```
Simply
```

### Summary (132 chars max)
```
Turn dense research papers into calm prerequisite guides. Sign in, open a paper, get the background you need.
```

### Description
```
Simply helps you read research papers without getting lost in jargon.

Open a paper on arXiv, OpenReview, bioRxiv, or other research sites, click the Simply extension, and get a calm prerequisite guide — the background concepts you need before the main result makes sense.

HOW IT WORKS
• Sign in with your Google account
• Open a research paper on a supported site
• Click Analyze to generate a prerequisite guide
• Read the full guide at usesimply.us

SUPPORTED SITES
arXiv, OpenReview, bioRxiv, medRxiv, SSRN, ACL Anthology, MLR Proceedings, NeurIPS, IEEE, Springer, ScienceDirect, Nature, Science, Frontiers, PLOS, and local PDF files.

PRIVACY
Simply only runs on research-paper pages — not on social media or unrelated sites. Paper text is sent to our API only when you click Analyze. See our privacy policy: https://usesimply.us/privacy

Support: admin@usesimply.us
```

### Category
```
Productivity
```

### Language
```
English
```

### Privacy policy URL
```
https://usesimply.us/privacy
```

### Homepage URL
```
https://usesimply.us
```

### Support URL (or email)
```
https://usesimply.us/contact
```

---

## Store images

Chrome Web Store requires:

| Asset | File |
|-------|------|
| **Store icon** (128×128) | `docs/store-assets/store-icon-128.png` |
| **Screenshot 1** — brand | `screenshot-01-brand-1280x800.png` |
| **Screenshot 2** — extension (signed out) | `screenshot-02-extension-signed-out-1280x800.png` |
| **Screenshot 3** — extension (signed in) | `screenshot-03-extension-signed-in-1280x800.png` |
| Small promo tile (optional) | `promo-small-440x280.png` |
| Marquee promo (optional) | `promo-marquee-1400x560.png` |

Desktop copy: `~/Desktop/simply-cws-upload/`

Regenerate from logo: `./scripts/generate-brand-assets.sh`

---

## Permission justifications (for review form)

| Permission | Why |
|------------|-----|
| `activeTab` | Read paper text from the tab the user is viewing when they click Analyze |
| `scripting` | Inject the Simply widget on research-paper pages only |
| `identity` | Google sign-in via `chrome.identity.launchWebAuthFlow` |
| `storage` | Persist sign-in session locally |
| Host: API | Send paper text to Simply API for analysis |
| Content script matches | Widget appears only on research-paper domains (listed in manifest) |

---

## Version bumps

1. Bump `version` in `apps/extension/package.json` and `apps/extension/public/manifest.json`
2. Run `./scripts/package-extension.sh <version>`
3. Upload new zip in Developer Dashboard → **Package** → upload new version

---

## After publish

1. Set `VITE_CHROME_STORE_URL` to the real listing URL
2. Redeploy the web app so landing page “Get the extension” links work
3. Update `src/App.tsx` default URL if needed
