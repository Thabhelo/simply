#!/usr/bin/env bash
# Deploy Simply API to Google Cloud Run (project: simply-def0f-e4e3f).
# Prerequisites:
#   - gcloud CLI installed and logged in: gcloud auth login
#   - Billing enabled on the GCP project
#   - APIs enabled (this script enables them if you have permission)
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-simply-def0f-e4e3f}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${GCP_SERVICE_NAME:-simply-api}"
REPO_NAME="${GCP_ARTIFACT_REPO:-simply}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Project: $PROJECT_ID  Region: $REGION  Service: $SERVICE_NAME"

gcloud config set project "$PROJECT_ID"

echo "==> Enabling required APIs (requires billing on project)..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  --project="$PROJECT_ID" \
  --quiet

echo "==> Ensuring Artifact Registry repo..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --description="Simply API images"
fi

echo "==> Building and pushing image..."
if gcloud builds submit \
  --project="$PROJECT_ID" \
  --config=cloudbuild.yaml \
  --substitutions="_IMAGE=$IMAGE" \
  . 2>/dev/null; then
  echo "    built via Cloud Build"
else
  echo "    Cloud Build unavailable — building locally with Docker..."
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
  docker build -f apps/api/Dockerfile -t "$IMAGE" .
  docker push "$IMAGE"
fi

ensure_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    echo "    updating secret $name"
    printf '%s' "$value" | gcloud secrets versions add "$name" --project="$PROJECT_ID" --data-file=-
  else
    echo "    creating secret $name"
    printf '%s' "$value" | gcloud secrets create "$name" --project="$PROJECT_ID" --data-file=-
  fi
}

echo "==> Syncing secrets to Secret Manager..."
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "ERROR: Set GEMINI_API_KEY in the environment before deploying."
  exit 1
fi
ensure_secret GEMINI_API_KEY "$GEMINI_API_KEY"

if [[ -n "${FIREBASE_SERVICE_ACCOUNT_B64:-}" ]]; then
  ensure_secret FIREBASE_SERVICE_ACCOUNT_B64 "$FIREBASE_SERVICE_ACCOUNT_B64"
elif [[ -n "${FIREBASE_SERVICE_ACCOUNT_PATH:-}" && -f "${FIREBASE_SERVICE_ACCOUNT_PATH/#\~/$HOME}" ]]; then
  FIREBASE_SERVICE_ACCOUNT_B64="$(base64 < "${FIREBASE_SERVICE_ACCOUNT_PATH/#\~/$HOME}" | tr -d '\n')"
  ensure_secret FIREBASE_SERVICE_ACCOUNT_B64 "$FIREBASE_SERVICE_ACCOUNT_B64"
else
  echo "WARN: No Firebase service account provided. Auth will run in open mode on Cloud Run."
fi

if [[ -n "${RESEND_API_KEY:-}" ]]; then
  ensure_secret RESEND_API_KEY "$RESEND_API_KEY"
else
  echo "WARN: RESEND_API_KEY not set. Contact form will return 503 until configured."
fi

echo "==> Deploying Cloud Run service..."
ENV_VARS="WEB_APP_URL=${WEB_APP_URL:-https://simply-def0f-e4e3f.web.app}"
DEPLOY_ARGS=(
  run deploy "$SERVICE_NAME"
  --project="$PROJECT_ID"
  --region="$REGION"
  --image="$IMAGE"
  --platform=managed
  --allow-unauthenticated
  --port=8080
  --memory=1Gi
  --cpu=1
  --min-instances=0
  --max-instances=10
  # Chromium PDF render peaks ~0.5-0.8Gi per request; cap concurrency so a
  # single 1Gi instance never runs enough simultaneous renders to OOM.
  --concurrency=4
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest"
)

if gcloud secrets describe RESEND_API_KEY --project="$PROJECT_ID" &>/dev/null; then
  DEPLOY_ARGS+=(--set-secrets="RESEND_API_KEY=RESEND_API_KEY:latest")
  ENV_VARS="${ENV_VARS},CONTACT_TO_EMAIL=${CONTACT_TO_EMAIL:-thabhelo.duve@talladega.edu},CONTACT_FROM_EMAIL=${CONTACT_FROM_EMAIL:-Simply <onboarding@resend.dev>}"
fi

DEPLOY_ARGS+=(--set-env-vars="$ENV_VARS")

if gcloud secrets describe FIREBASE_SERVICE_ACCOUNT_B64 --project="$PROJECT_ID" &>/dev/null; then
  DEPLOY_ARGS+=(--set-secrets="FIREBASE_SERVICE_ACCOUNT_B64=FIREBASE_SERVICE_ACCOUNT_B64:latest")
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for secret in GEMINI_API_KEY FIREBASE_SERVICE_ACCOUNT_B64 RESEND_API_KEY; do
  if gcloud secrets describe "$secret" --project="$PROJECT_ID" &>/dev/null; then
    gcloud secrets add-iam-policy-binding "$secret" \
      --project="$PROJECT_ID" \
      --member="serviceAccount:${RUN_SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --quiet &>/dev/null || true
  fi
done

gcloud "${DEPLOY_ARGS[@]}" --quiet

URL="$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
echo ""
echo "Cloud Run API: $URL"
echo "Health:        $URL/health"
