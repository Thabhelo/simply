#!/usr/bin/env bash
# One-time setup: create a GCP deploy service account and store GitHub Actions secrets
# so merges to main auto-deploy via .github/workflows/deploy.yml
#
# Prerequisites:
#   gcloud auth login (project owner)
#   gh auth login
#   apps/api/.env with GEMINI_API_KEY (or export GEMINI_API_KEY)
#   ~/secrets/simply-firebase.json
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-simply-def0f-e4e3f}"
SA_NAME="${GCP_DEPLOY_SA_NAME:-simply-github-deploy}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
REPO="${GITHUB_REPO:-Thabhelo/simply}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY_FILE="$(mktemp)"
FIREBASE_KEY="${FIREBASE_SERVICE_ACCOUNT_PATH:-$HOME/secrets/simply-firebase.json}"

cleanup() { rm -f "$KEY_FILE"; }
trap cleanup EXIT

if [[ -f "$ROOT/apps/api/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/apps/api/.env"
  set +a
fi

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "ERROR: GEMINI_API_KEY not set. Add it to apps/api/.env or export it."
  exit 1
fi

if [[ ! -f "$FIREBASE_KEY" ]]; then
  echo "ERROR: Firebase service account not found at $FIREBASE_KEY"
  exit 1
fi

gcloud config set project "$PROJECT_ID"

echo "==> Creating deploy service account (if missing)..."
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT_ID" \
    --display-name="Simply GitHub Actions deploy"
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

ROLES=(
  roles/run.admin
  roles/cloudbuild.builds.editor
  roles/artifactregistry.admin
  roles/secretmanager.admin
  roles/serviceusage.serviceUsageAdmin
  roles/firebasehosting.admin
  roles/iam.serviceAccountUser
)

echo "==> Granting deploy roles..."
for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role" \
    --quiet &>/dev/null
done

# Cloud Run deploy acts as the runtime service account
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet &>/dev/null || true

echo "==> Creating service account key..."
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT_ID"

FIREBASE_B64="$(base64 < "$FIREBASE_KEY" | tr -d '\n')"

echo "==> Setting GitHub secrets on ${REPO}..."
gh secret set GCP_SERVICE_ACCOUNT_KEY --repo "$REPO" < "$KEY_FILE"
gh secret set GEMINI_API_KEY --repo "$REPO" --body "$GEMINI_API_KEY"
gh secret set FIREBASE_SERVICE_ACCOUNT_B64 --repo "$REPO" --body "$FIREBASE_B64"

echo ""
echo "Done. Merges to main will run .github/workflows/deploy.yml"
echo "  SA: $SA_EMAIL"
echo "  Test: gh workflow run deploy.yml --repo $REPO"
