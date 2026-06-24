import axios from 'axios'
import { toast } from 'sonner'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export const apiClient = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('dev_token')
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
    toast.error(message)
    return Promise.reject(new Error(message))
  },
)
