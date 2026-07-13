#!/usr/bin/env bash
# Configure the Google OAuth consent screen for Simply (Firebase Google sign-in + extension).
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-simply-def0f-e4e3f}"
PROJECT_NUMBER="${GCP_PROJECT_NUMBER:-448198565907}"
SUPPORT_EMAIL="${OAUTH_SUPPORT_EMAIL:-thabhelo.duve@talladega.edu}"
APP_HOME="${APP_HOME:-https://usesimply.us}"
PRIVACY_URL="${PRIVACY_URL:-${APP_HOME}/privacy}"
TERMS_URL="${TERMS_URL:-${APP_HOME}/terms}"

gcloud config set project "$PROJECT_ID"

echo "==> Enabling OAuth configuration APIs..."
gcloud services enable oauth2.googleapis.com clientauthconfig.googleapis.com --project="$PROJECT_ID" --quiet 2>/dev/null || true

TOKEN="$(gcloud auth print-access-token)"
AUTH_HEADER=(-H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT_ID")

echo "==> Fetching OAuth brand..."
BRAND_JSON="$(curl -s "${AUTH_HEADER[@]}" \
  "https://clientauthconfig.googleapis.com/v1/projects/${PROJECT_NUMBER}/brands" || true)"

if echo "$BRAND_JSON" | grep -q '"name"'; then
  BRAND_NAME="$(echo "$BRAND_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['brands'][0]['name'])")"
  echo "    Found brand: $BRAND_NAME"
else
  echo "WARN: OAuth brand API is not available for this project."
  echo "      Complete setup manually: docs/oauth-consent-setup.md"
  echo "      Console: https://console.cloud.google.com/auth/branding?project=${PROJECT_ID}"
  exit 0
fi

echo "==> Updating brand (app name, support email, home page, privacy policy)..."
curl -s -X PATCH "${AUTH_HEADER[@]}" \
  -H "Content-Type: application/json" \
  "${BRAND_NAME}?updateMask=applicationTitle,supportEmail,applicationHomePage,privacyPolicyUrl,termsOfServiceUrl" \
  -d "{
    \"applicationTitle\": \"Simply\",
    \"supportEmail\": \"${SUPPORT_EMAIL}\",
    \"applicationHomePage\": \"${APP_HOME}\",
    \"privacyPolicyUrl\": \"${PRIVACY_URL}\",
    \"termsOfServiceUrl\": \"${TERMS_URL}\"
  }" >/dev/null || echo "WARN: brand PATCH may require Console confirmation."

echo ""
echo "OAuth consent screen configured (or partially configured)."
echo "  Branding: https://console.cloud.google.com/auth/branding?project=${PROJECT_ID}"
echo "  Audience: https://console.cloud.google.com/auth/audience?project=${PROJECT_ID}"
echo ""
echo "Before Chrome Web Store launch, set Publishing status to 'In production' and verify:"
echo "  - Privacy policy: ${PRIVACY_URL}"
echo "  - Terms: ${TERMS_URL}"
echo "  - Authorized domains include usesimply.us, simply-def0f-e4e3f.web.app, and simply-def0f-e4e3f.firebaseapp.com"
