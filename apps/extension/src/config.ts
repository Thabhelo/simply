// Production URLs are injected at build time via VITE_* env vars (see scripts/deploy-all-gcp.sh).
export const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787'
export const webBase = import.meta.env.VITE_WEB_BASE ?? 'http://localhost:5173'
