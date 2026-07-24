import axios from 'axios'
import { toast } from 'sonner'
import { clearToken, getStoredToken } from './auth'
import { queryClient } from '../queryClient'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export const apiClient = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (config.data instanceof FormData) config.timeout = 120_000
  return config
})

// "nombreCampo" / "allocations.0.percentage" → "Nombre campo" / "Allocations 0 percentage" —
// solo para que el toast diga QUÉ campo falló en vez de nada; no pretende ser
// una traducción prolija de cada nombre técnico.
function humanizeField(field: string): string {
  const spaced = field.replace(/\./g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// El backend devuelve errores de validación Zod como
// { error: { message: 'Datos inválidos', details: [{ field, message }] } } —
// antes se ignoraba `details` y siempre se mostraba el mensaje genérico, sin
// forma de saber qué campo era. Con `details` armamos un mensaje por campo;
// si el backend no manda `details` (otros tipos de error), cae al mensaje
// genérico de siempre.
function buildErrorMessage(error: {
  response?: { data?: { error?: { message?: string; details?: Array<{ field: string; message: string }> }; message?: string } }
  message?: string
}): string {
  const details = error.response?.data?.error?.details
  if (details && details.length > 0) {
    return details.map((d) => (d.field ? `${humanizeField(d.field)}: ${d.message}` : d.message)).join(' • ')
  }
  return (
    error.response?.data?.error?.message ??
    error.response?.data?.message ??
    error.message ??
    'Error desconocido'
  )
}

apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const message = buildErrorMessage(error)
    const details = error.response?.data?.error?.details
    // Token inválido/expirado: limpiar la sesión y mandar a /login. Un
    // redirect duro (no useNavigate) porque este interceptor vive fuera del
    // árbol de React — es la forma simple y robusta de garantizar que pasa
    // sin importar en qué componente se disparó el error.
    if (error.response?.status === 401) {
      clearToken()
      queryClient.clear()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    // Más tiempo en pantalla cuando hay varios campos a leer — 4s por defecto
    // se queda corto para un mensaje con dos o tres campos listados.
    toast.error(message, details && details.length > 1 ? { duration: 8000 } : undefined)
    return Promise.reject(new Error(message))
  },
)
