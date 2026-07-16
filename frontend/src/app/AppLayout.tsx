import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from '../shared/components/layout/AppShell'
import { LoadingState } from '../shared/components/empty-states/LoadingState'
import { ErrorBoundary } from '../shared/components/error-boundary/ErrorBoundary'
import { AuthProvider, useCurrentUser } from './auth/AuthContext'
import { getStoredToken } from '../shared/api/auth'
import { isAllowedForAuditorMatafuegos, AUDITOR_MATAFUEGOS_HOME } from './auth/roleScope'

function RoleGuard({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser()
  const location = useLocation()

  if (user?.role === 'AUDITOR_MATAFUEGOS' && !isAllowedForAuditorMatafuegos(location.pathname)) {
    return <Navigate to={AUDITOR_MATAFUEGOS_HOME} replace />
  }
  return <>{children}</>
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
