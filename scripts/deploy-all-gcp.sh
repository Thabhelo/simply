#!/usr/bin/env bash
# Deploy Simply to GCP: Cloud Run (API) + Firebase Hosting (landing + /guide).
#
# Prerequisites:
#   gcloud auth login   (as thabhelo.duve@talladega.edu)
#   firebase login      (same account)
#   Billing enabled on project simply-def0f-e4e3f
#
# Usage:
#   ./scripts/deploy-all-gcp.sh
#   # or with explicit secrets:
#   GEMINI_API_KEY=... FIREBASE_SERVICE_ACCOUNT_PATH=~/secrets/simply-firebase.json ./scripts/deploy-all-gcp.sh
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-simply-def0f-e4e3f}"
WEB_BASE="${WEB_BASE:-https://usesimply.us}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/apps/api/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/apps/api/.env"
  set +a
fi

echo "==> [1/3] Deploying API to Cloud Run..."
"$ROOT/scripts/deploy-gcp.sh"

API_URL="$(gcloud run services describe "${GCP_SERVICE_NAME:-simply-api}" \
  --project="$PROJECT_ID" \
  --region="${GCP_REGION:-us-central1}" \
  --format='value(status.url)')"

echo ""
echo "==> [2/3] Building web app (API=$API_URL, WEB=$WEB_BASE)..."
VITE_API_BASE="$API_URL" \
  VITE_WEB_BASE="$WEB_BASE" \
  VITE_EMAILJS_SERVICE_ID="${VITE_EMAILJS_SERVICE_ID:-}" \
  VITE_EMAILJS_TEMPLATE_ID="${VITE_EMAILJS_TEMPLATE_ID:-}" \
  VITE_EMAILJS_PUBLIC_KEY="${VITE_EMAILJS_PUBLIC_KEY:-}" \
  VITE_CHROME_STORE_URL="${VITE_CHROME_STORE_URL:-https://chromewebstore.google.com/detail/simply/caalklhfhbfcmonmohhlkljacdfpmnah}" \
  npm run build:web

echo ""
echo "==> [3/3] Deploying Firebase Hosting..."
gcloud services enable firebasehosting.googleapis.com --project="$PROJECT_ID" --quiet 2>/dev/null || true

if [[ -n "${FIREBASE_SERVICE_ACCOUNT_B64:-}" ]]; then
  SA_FILE="$(mktemp)"
  echo "$FIREBASE_SERVICE_ACCOUNT_B64" | base64 -d > "$SA_FILE"
  export GOOGLE_APPLICATION_CREDENTIALS="$SA_FILE"
elif [[ -n "${FIREBASE_SERVICE_ACCOUNT_PATH:-}" && -f "${FIREBASE_SERVICE_ACCOUNT_PATH/#\~/$HOME}" ]]; then
  export GOOGLE_APPLICATION_CREDENTIALS="${FIREBASE_SERVICE_ACCOUNT_PATH/#\~/$HOME}"
fi

npx -y firebase-tools@latest deploy --only hosting --project "$PROJECT_ID" --non-interactive

echo ""
echo "========================================"
echo "Simply is live on GCP"
echo "  Web:  $WEB_BASE"
echo "  API:  $API_URL"
echo "  Health: $API_URL/health"
echo "========================================"
echo ""
echo "Optional — rebuild extension for production URLs:"
echo "  VITE_API_BASE=$API_URL VITE_WEB_BASE=$WEB_BASE npm run build --workspace apps/extension"
