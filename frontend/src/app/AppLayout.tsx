import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ShieldOff } from 'lucide-react'
import { AppShell } from '../shared/components/layout/AppShell'
import { LoadingState } from '../shared/components/empty-states/LoadingState'
import { EmptyState } from '../shared/components/empty-states/EmptyState'
import { ErrorBoundary } from '../shared/components/error-boundary/ErrorBoundary'
import { AuthProvider, useCurrentUser } from './auth/AuthContext'
import { getStoredToken } from '../shared/api/auth'
import { hasModuleAccess, firstAllowedPath } from './auth/roleScope'

function NoAccessState() {
  const { logout } = useCurrentUser()
  return (
    <div className="p-6">
      <EmptyState
        icon={ShieldOff}
        title="Sin módulos asignados"
        description="Tu usuario no tiene ningún módulo habilitado todavía. Contactá a un administrador para que te asigne un perfil de acceso."
        action={
          <button
            onClick={logout}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Cerrar sesión
          </button>
        }
      />
    </div>
  )
}

function RoleGuard({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser()
  const location = useLocation()

  if (!user || hasModuleAccess(user, location.pathname)) {
    return <>{children}</>
  }

  const fallback = firstAllowedPath(user)
  if (fallback === location.pathname) {
    // Ya lo mandamos a la mejor pantalla posible y sigue sin acceso — no
    // tiene ningún módulo asignado.
    return <NoAccessState />
  }
  return <Navigate to={fallback} replace />
}

function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { user, isLoading } = useCurrentUser()

  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingState rows={6} />
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  // Contraseña temporal (alta o reseteo por un ADMIN) — bloquea el resto de
  // la app hasta que la cambie. /change-password vive fuera de este árbol
  // (como /login), así que no hay riesgo de loop de redirects acá.
  if (user.mustChangePassword) {
    return <Navigate to="/change-password" replace />
  }
  return <RoleGuard>{children}</RoleGuard>
}

// Layout route: envuelve todas las páginas autenticadas (AppShell + guard de
// sesión + guard de rol). /login vive fuera de este árbol, sin Sidebar/Topbar.
export function AppLayout() {
  const location = useLocation()
  const token = getStoredToken()

  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return (
    <AuthProvider>
      <AppShell>
        <Toaster position="top-right" richColors closeButton duration={4000} />
        <ErrorBoundary>
          <AuthGate>
            <Outlet />
          </AuthGate>
        </ErrorBoundary>
      </AppShell>
    </AuthProvider>
  )
}
