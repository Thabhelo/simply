# Chrome Extension OAuth Setup

## Extension Published ✓

The Simply Chrome extension has been successfully published to the Chrome Web Store.

## Finding Your Extension ID

After publishing to Chrome Web Store, your extension receives a unique ID. You can find it:

1. **From Chrome Web Store URL**: 
   - The extension ID is the last part of your Web Store URL
   - Format: `https://chromewebstore.google.com/detail/<extension-name>/<EXTENSION_ID>`
   
2. **From Chrome Extensions Page**:
   - Open `chrome://extensions` in Chrome
   - Enable "Developer mode" (top right)
   - Find your extension and look for the "ID" field

3. **From the Publication Email/Notification**:
   - Check your Chrome Web Store Developer Dashboard
   - The Item ID is shown in the publication confirmation

## OAuth Redirect URI Configuration

For Google OAuth to work in your Chrome extension, you must add the extension's redirect URI to your Google Cloud OAuth client credentials.

### OAuth Redirect URI Format

```
https://<EXTENSION_ID>.chromiumapp.org/
```

### Steps to Configure

1. **Go to Google Cloud Console**
   - Navigate to: https://console.cloud.google.com/
   - Select project: `simply-def0f-e4e3f`

2. **Open OAuth Credentials**
   - Go to: APIs & Services → Credentials
   - Find your OAuth 2.0 Client ID: `448198565907-0nokihgt4021fl9knk7qlq6v9k30lj7v`

3. **Add Authorized Redirect URI**
   - Click the OAuth client ID to edit
   - Under "Authorized redirect URIs", click "ADD URI"
   - Add: `https://<YOUR_EXTENSION_ID>.chromiumapp.org/`
   - Click "SAVE"

### Current Configuration

**OAuth Client ID**: `448198565907-0nokihgt4021fl9knk7qlq6v9k30lj7v`

**Required Redirect URI**: `https://<EXTENSION_ID>.chromiumapp.org/`

**Extension ID**: _(Add your published extension ID here)_

## Testing OAuth Flow

After adding the redirect URI:

1. Load the extension in Chrome
2. Click the extension icon
3. Click "Sign in"
4. The Google OAuth flow should complete successfully
5. If you see "redirect_uri_mismatch" error, verify:
   - The extension ID matches your published extension
   - The redirect URI is correctly added in GCP Console
   - There are no typos in the URI (must end with `/`)

## Environment Variables

Update your `.env` file (optional, for documentation):

```bash
# Chrome Web Store
VITE_CHROME_EXTENSION_ID=<your-extension-id>
VITE_CHROME_STORE_URL=https://chromewebstore.google.com/detail/<extension-name>/<extension-id>
```

## Related Files

- OAuth implementation: `apps/extension/src/auth.ts`
- OAuth client ID configured in: Line 17 of `apps/extension/src/auth.ts`
- Extension manifest: `apps/extension/public/manifest.json`

## Need Help?

If OAuth sign-in fails after adding the redirect URI:
1. Wait 5-10 minutes for GCP to propagate the changes
2. Clear Chrome extension data: `chrome://extensions` → Simply → Remove
3. Reload the extension
4. Try signing in again
