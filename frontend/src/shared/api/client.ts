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

apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const message =
      error.response?.data?.error?.message ??
      error.response?.data?.message ??
      error.message ??
      'Error desconocido'
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
    toast.error(message)
    return Promise.reject(new Error(message))
  },
)
