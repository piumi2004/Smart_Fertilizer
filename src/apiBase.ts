/**
 * API URL for fetch().
 *
 * Default: same-origin paths `/api/...` so the Vite dev server can proxy to Express.
 * That keeps auth cookies first-party (browser ↔ localhost:5173), which fixes login/register.
 *
 * Set VITE_API_BASE_URL only when the API is on another host and you are not using a proxy
 * (e.g. http://127.0.0.1:5000).
 */
export function apiUrl(path: string): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  const base = trimmed.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${p}` : p
}
