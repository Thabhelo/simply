# Chrome Web Store - Post-Publication Checklist

## ✅ Extension Published

Your Simply Chrome extension has been approved and published on Chrome Web Store!

## 🔧 Required: Configure OAuth Redirects

**Action Required**: For Google sign-in to work in the published extension, you must add the OAuth redirect URI to your Google Cloud credentials.

### Quick Steps

1. **Find your Extension ID**:
   - Check the Chrome Web Store publication email/notification
   - Or visit your [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - The Item ID is your extension ID (32-character string)

2. **Add OAuth Redirect URI**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Select project: `simply-def0f-e4e3f`
   - Navigate to: APIs & Services → Credentials
   - Edit OAuth client: `448198565907-0nokihgt4021fl9knk7qlq6v9k30lj7v`
   - Add redirect URI: `https://<YOUR_EXTENSION_ID>.chromiumapp.org/`
   - Save changes

3. **Test the Extension**:
   - Install from Chrome Web Store
   - Click extension icon
   - Test Google sign-in flow
   - Should complete without "redirect_uri_mismatch" error

### Example

If your extension ID is `abcdefghijklmnopqrstuvwxyz123456`, add this redirect URI:

```
https://abcdefghijklmnopqrstuvwxyz123456.chromiumapp.org/
```

⚠️ **Important**: The URI must end with a forward slash `/`

## 📝 Optional: Update Configuration

Update `.env` with your extension details:

```bash
VITE_CHROME_EXTENSION_ID=<your-extension-id>
VITE_CHROME_STORE_URL=https://chromewebstore.google.com/detail/simply/<your-extension-id>
```

## 📚 Full Documentation

For detailed instructions and troubleshooting, see: [`docs/CHROME_EXTENSION_OAUTH_SETUP.md`](docs/CHROME_EXTENSION_OAUTH_SETUP.md)

## 🎉 After Setup

Once OAuth is configured:
- Users can sign in with their Google accounts
- The extension will have full functionality
- Analytics and user data will be properly tracked
- Share the Chrome Web Store link with users!

---

**Questions?** Check the full setup guide or contact the development team.
