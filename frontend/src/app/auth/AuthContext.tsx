import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, authQueries, type CurrentUser } from '../../shared/api/auth.api'
import { getStoredToken, clearToken } from '../../shared/api/auth'

interface AuthContextValue {
  user: CurrentUser | null
  isLoading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const hasToken = Boolean(getStoredToken())

  const { data, isLoading, isError } = useQuery({
    ...authQueries.me(),
    enabled: hasToken,
  })

  async function logout() {
    try {
      await authApi.logout()
    } catch {
      // no-op — el JWT es stateless, no hay nada que invalidar del lado
      // del servidor. Lo que importa es limpiar el estado local.
    }
    clearToken()
    queryClient.clear()
    // Redirect duro (no useNavigate): garantiza un estado 100% limpio, sin
    // depender de que cada componente reaccione a que el token desapareció.
    window.location.href = '/login'
  }

  const value: AuthContextValue = {
    user: hasToken && !isError ? (data ?? null) : null,
    isLoading: hasToken && isLoading,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useCurrentUser(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useCurrentUser debe usarse dentro de <AuthProvider>')
  return ctx
}
