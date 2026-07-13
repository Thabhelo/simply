#!/usr/bin/env bash
# Add a Chrome extension OAuth redirect URI to the Firebase Web client.
#
# Google does not expose a public gcloud/API for standard OAuth web clients.
# This script copies the URI and opens the GCP Credentials editor.
#
# Usage:
#   ./scripts/add-extension-redirect-uri.sh [extension-id]
#   ./scripts/add-extension-redirect-uri.sh caalklhfhbfcmonmohhlkljacdfpmnah
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-simply-def0f-e4e3f}"
CLIENT_ID="${OAUTH_CLIENT_ID:-448198565907-0nokihgt4021fl9knk7qlq6v9k30lj7v.apps.googleusercontent.com}"
EXT_ID="${1:-caalklhfhbfcmonmohhlkljacdfpmnah}"
REDIRECT_URI="https://${EXT_ID}.chromiumapp.org/"

CONSOLE_URL="https://console.cloud.google.com/auth/clients/${CLIENT_ID}?project=${PROJECT_ID}"

echo "Extension ID:  $EXT_ID"
echo "Redirect URI:  $REDIRECT_URI"
echo ""
echo "No public gcloud command exists for OAuth redirect URIs."
echo "Opening GCP Credentials (sign in as a project owner, e.g. thabhelo.duve@talladega.edu)..."
echo ""
echo "In the editor:"
echo "  1. Authorized redirect URIs → Add URI"
echo "  2. Paste: $REDIRECT_URI"
echo "  3. Save"
echo ""

if command -v pbcopy >/dev/null 2>&1; then
  printf '%s' "$REDIRECT_URI" | pbcopy
  echo "Copied redirect URI to clipboard."
fi

if command -v open >/dev/null 2>&1; then
  open "$CONSOLE_URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$CONSOLE_URL"
else
  echo "Open this URL manually:"
  echo "  $CONSOLE_URL"
fi
