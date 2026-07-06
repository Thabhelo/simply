const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787'

const imageCache = new Map<string, string>()

/** UI decoration only (library page). Never used in generated lessons. */
export async function fetchPexelsImage(query: string): Promise<string | undefined> {
  const key = query.trim().toLowerCase()
  if (!key) return undefined
  const cached = imageCache.get(key)
  if (cached) return cached

  try {
    const response = await fetch(`${apiBase}/api/pexels/search?${new URLSearchParams({ q: query })}`)
    if (!response.ok) return undefined
    const data = (await response.json()) as { url?: string }
    if (data.url) imageCache.set(key, data.url)
    return data.url
  } catch {
    return undefined
  }
}
