#!/usr/bin/env bash
# Configure usesimply.us for Simply (Firebase Auth + print Hosting DNS records).
# Hosting stays on Firebase; DNS is managed in Cloudflare Registrar.
#
# Prerequisites:
#   apps/api/.env with FIREBASE_SERVICE_ACCOUNT_PATH (Admin SDK JSON)
#
# Usage:
#   ./scripts/setup-usesimply-domain.sh
set -euo pipefail

DOMAIN="${SITE_DOMAIN:-usesimply.us}"
PROJECT_ID="${GCP_PROJECT_ID:-simply-def0f-e4e3f}"
SITE_ID="${FIREBASE_SITE_ID:-simply-def0f-e4e3f}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$ROOT/apps/api/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/apps/api/.env"
  set +a
fi

if [[ -z "${FIREBASE_SERVICE_ACCOUNT_PATH:-}" ]]; then
  echo "ERROR: Set FIREBASE_SERVICE_ACCOUNT_PATH in apps/api/.env"
  exit 1
fi

export GOOGLE_APPLICATION_CREDENTIALS="${FIREBASE_SERVICE_ACCOUNT_PATH/#\~/$HOME}"

PROJECT_ID="$PROJECT_ID" SITE_DOMAIN="$DOMAIN" node <<'NODE'
const { GoogleAuth } = require('google-auth-library')
const project = process.env.PROJECT_ID
const domain = process.env.SITE_DOMAIN

async function authHeaders() {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  return {
    Authorization: `Bearer ${token.token}`,
    'Content-Type': 'application/json',
  }
}

async function ensureAuthDomain(headers) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`, {
    headers: { ...headers, 'x-goog-user-project': project },
  })
  const config = await res.json()
  if (!res.ok) throw new Error(`Auth config fetch failed: ${JSON.stringify(config)}`)
  const domains = config.authorizedDomains ?? []
  if (domains.includes(domain)) {
    console.log(`✓ Firebase Auth already allows ${domain}`)
    return domains
  }
  const patch = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config?updateMask=authorizedDomains`,
    {
      method: 'PATCH',
      headers: { ...headers, 'x-goog-user-project': project },
      body: JSON.stringify({ authorizedDomains: [...domains, domain] }),
    },
  )
  const updated = await patch.json()
  if (!patch.ok) throw new Error(`Auth domain update failed: ${JSON.stringify(updated)}`)
  console.log(`✓ Added ${domain} to Firebase Auth authorized domains`)
  return updated.authorizedDomains
}

async function printHostingDns(headers) {
  const site = project
  const res = await fetch(
    `https://firebasehosting.googleapis.com/v1beta1/projects/${project}/sites/${site}/domains/${domain}`,
    { headers },
  )
  const body = await res.json()
  if (!res.ok) throw new Error(`Hosting domain fetch failed: ${JSON.stringify(body)}`)

  const prov = body.provisioning ?? {}
  console.log('')
  console.log('Firebase Hosting custom domain status:')
  console.log(`  domain: ${body.domainName}`)
  console.log(`  status: ${body.status ?? 'unknown'}`)
  console.log(`  dns:    ${prov.dnsStatus ?? 'unknown'}`)
  console.log(`  cert:   ${prov.certStatus ?? 'unknown'}`)
  console.log('')
  console.log('Add these records in Cloudflare → DNS for usesimply.us:')
  console.log('  (Set proxy to DNS only / grey cloud until Firebase shows Connected)')
  console.log('')
  if (prov.expectedIps?.length) {
    for (const ip of prov.expectedIps) {
      console.log(`  A     @     ${ip}`)
    }
  }
  if (prov.certChallengeDns?.domainName && prov.certChallengeDns?.token) {
    const host = prov.certChallengeDns.domainName.replace(`.${domain}`, '')
    console.log(`  TXT   ${host}     ${prov.certChallengeDns.token}`)
  }
  console.log('')
  console.log('After DNS propagates, Firebase will issue SSL automatically (may take up to 24h).')
}

;(async () => {
  const headers = await authHeaders()
  await ensureAuthDomain(headers)
  await printHostingDns(headers)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
NODE
