#!/usr/bin/env bash
# Ensure all Simply Chrome extension OAuth redirect URIs are registered on the Firebase Web client.
#
# Google does not expose a stable public API for standard OAuth 2.0 Web Client redirect URIs.
# This script copies the full URI list and opens the GCP Credentials editor. When user gcloud
# auth is active, it also probes oauthconfig/clientauthconfig APIs (may succeed on some projects).
#
# Usage (as project owner, e.g. thabhelo.duve@talladega.edu):
#   gcloud auth login
#   ./scripts/ensure-oauth-redirects.sh
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-simply-def0f-e4e3f}"
PROJECT_NUMBER="${GCP_PROJECT_NUMBER:-448198565907}"
CLIENT_ID="${OAUTH_CLIENT_ID:-448198565907-0nokihgt4021fl9knk7qlq6v9k30lj7v.apps.googleusercontent.com}"
CONSOLE_URL="https://console.cloud.google.com/auth/clients/${CLIENT_ID}?project=${PROJECT_ID}"

# Chrome Web Store (production) + dev unpacked (manifest.dev.json key) + legacy stray install seen in the wild.
EXTENSION_IDS=(
  caalklhfhbfcmonmohhlkljacdfpmnah
  jjpldcfebfpphoobponjaohplkkhkcnl
  hjomhhlinhfoopjknpdogfileajgfjgk
)

REDIRECT_URIS=()
for id in "${EXTENSION_IDS[@]}"; do
  REDIRECT_URIS+=("https://${id}.chromiumapp.org/")
done

echo "Simply extension OAuth redirect URIs:"
printf '  %s\n' "${REDIRECT_URIS[@]}"
echo ""

if ! gcloud auth print-access-token --account="${GCLOUD_ACCOUNT:-thabhelo.duve@talladega.edu}" &>/dev/null; then
  echo "WARN: gcloud user auth expired. Run: gcloud auth login"
  echo "      (Sign in as a GCP project owner, e.g. thabhelo.duve@talladega.edu)"
else
  TOKEN="$(gcloud auth print-access-token --account="${GCLOUD_ACCOUNT:-thabhelo.duve@talladega.edu}")"
  AUTH_HEADER=(-H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT_ID")

  echo "==> Probing OAuth client APIs (best-effort)..."
  for api in \
    "https://oauthconfig.googleapis.com/v1/projects/${PROJECT_ID}/oauthClients/${CLIENT_ID}" \
    "https://clientauthconfig.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/oauthClients/${CLIENT_ID}"; do
    code="$(curl -s -o /tmp/simply-oauth.json -w "%{http_code}" "${AUTH_HEADER[@]}" "$api" || true)"
    echo "    $code $api"
    if [[ "$code" == "200" ]]; then
      echo "    Client config readable — add URIs manually in Console if PATCH is unavailable."
      head -c 400 /tmp/simply-oauth.json; echo
    fi
  done
  echo ""
fi

echo "==> Manual step (required): GCP → OAuth client → Authorized redirect URIs"
echo "    $CONSOLE_URL"
echo ""
echo "Add every URI listed above, then Save."
echo ""
echo "Also remove duplicate Simply installs at chrome://extensions — keep only the Chrome Web Store copy:"
echo "  https://chromewebstore.google.com/detail/simply/caalklhfhbfcmonmohhlkljacdfpmnah"
echo ""

if command -v pbcopy >/dev/null 2>&1; then
  printf '%s\n' "${REDIRECT_URIS[@]}" | pbcopy
  echo "Copied all redirect URIs to clipboard (one per line)."
fi

if command -v open >/dev/null 2>&1; then
  open "$CONSOLE_URL"
fi
