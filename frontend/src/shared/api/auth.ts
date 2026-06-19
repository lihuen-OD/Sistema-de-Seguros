const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
const TOKEN_KEY = 'dev_token'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export async function ensureDevToken(): Promise<void> {
  if (getStoredToken()) return
  try {
    const res = await fetch(`${API_BASE}/dev/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@losodwyer.com', role: 'ADMIN', name: 'Admin' }),
    })
    if (!res.ok) return
    const data = await res.json()
    if (data?.data?.token) {
      setToken(data.data.token)
    }
  } catch {
    console.warn('⚠️ No se pudo obtener el dev token. Verificá que el backend esté corriendo en', API_BASE)
  }
}
