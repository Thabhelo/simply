#!/usr/bin/env bash
# Write EmailJS env vars to .env and GitHub Actions secrets.
#
# Usage:
#   ./scripts/setup-emailjs-env.sh template_xxxx
#
# Create the template first — see docs/contact-setup.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_ID="service_of0z8is"
PUBLIC_KEY="_JDd2_-oFPAXuoAI5"
TEMPLATE_ID="${1:-}"

if [[ -z "$TEMPLATE_ID" ]]; then
  echo "Usage: $0 <template_id>"
  echo "Create a template at https://dashboard.emailjs.com/admin/templates (see docs/contact-setup.md)"
  exit 1
fi

ENV_FILE="$ROOT/.env"
touch "$ENV_FILE"

upsert_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

upsert_env VITE_EMAILJS_SERVICE_ID "$SERVICE_ID"
upsert_env VITE_EMAILJS_TEMPLATE_ID "$TEMPLATE_ID"
upsert_env VITE_EMAILJS_PUBLIC_KEY "$PUBLIC_KEY"

# Keep local dev defaults if missing
grep -q '^VITE_API_BASE=' "$ENV_FILE" || echo 'VITE_API_BASE=http://localhost:8787' >> "$ENV_FILE"
grep -q '^VITE_WEB_BASE=' "$ENV_FILE" || echo 'VITE_WEB_BASE=http://localhost:5173' >> "$ENV_FILE"

echo "==> Wrote EmailJS vars to $ENV_FILE"

echo "==> Setting GitHub Actions secrets..."
gh secret set VITE_EMAILJS_SERVICE_ID --body "$SERVICE_ID"
gh secret set VITE_EMAILJS_TEMPLATE_ID --body "$TEMPLATE_ID"
gh secret set VITE_EMAILJS_PUBLIC_KEY --body "$PUBLIC_KEY"

echo "Done. Service=$SERVICE_ID Template=$TEMPLATE_ID"
echo "Test locally: npm run dev:web → http://localhost:5173/contact"
