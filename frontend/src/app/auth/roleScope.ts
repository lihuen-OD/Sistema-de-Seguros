import type { CurrentUser } from '../../shared/api/auth.api'
import type { ModuleKey } from '../../shared/types'

// Un usuario sin módulos asignados cae en esta pantalla — no /dashboard,
// porque podría no tener acceso ni siquiera ahí.
export const NO_ACCESS_HOME = '/no-access'

// Mapeo ruta → módulo — mismo criterio que ya exige el backend en cada
// requireModule(...) de los routers (deny-by-default). Esto es solo UX: la
// seguridad real la impone el backend; esto evita que el usuario navegue a
// una pantalla que igual le va a devolver 403 al pedir datos.
// Ordenado de prefijo más específico a más general — el primer match gana
// (por eso /fire-extinguishers/audits y /fire-extinguishers/dashboard van
// antes que el genérico /fire-extinguishers).
const PATH_TO_MODULE: Array<{ prefix: string; module: ModuleKey }> = [
  { prefix: '/dashboard', module: 'dashboard' },
  { prefix: '/notifications', module: 'notifications' },
  { prefix: '/assets', module: 'assets' },
  { prefix: '/insurance/policies', module: 'policies' },
  { prefix: '/insurance/documents', module: 'documents' },
  { prefix: '/insurance/financial-analysis', module: 'financial_analysis' },
  { prefix: '/insurance/economic-analysis', module: 'economic_analysis' },
  { prefix: '/claims', module: 'claims' },
  { prefix: '/fire-extinguishers/audits', module: 'fire_extinguisher_audits' },
  { prefix: '/fire-extinguishers/dashboard', module: 'fire_extinguisher_dashboard' },
  { prefix: '/fire-extinguishers', module: 'fire_extinguishers' },
  { prefix: '/producers', module: 'producers' },
  { prefix: '/tasks', module: 'tasks' },
  { prefix: '/settings/companies', module: 'companies' },
  { prefix: '/settings/cost-centers', module: 'cost_centers' },
  { prefix: '/settings/fixed-assets', module: 'fixed_assets' },
  { prefix: '/settings/insurance-types', module: 'insurance_types' },
  { prefix: '/settings/module-config', module: 'module_config' },
]

// Nunca otorgables por perfil — exclusivas de role === 'ADMIN'.
const ADMIN_ONLY_PREFIXES = ['/settings/users', '/settings/access-profiles']

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function moduleForPath(pathname: string): ModuleKey | null {
  return PATH_TO_MODULE.find(({ prefix }) => matchesPrefix(pathname, prefix))?.module ?? null
}

export function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
}

export function hasModuleAccess(user: CurrentUser | null, pathname: string): boolean {
  if (!user) return false
  if (user.role === 'ADMIN') return true
  if (isAdminOnlyPath(pathname)) return false
  const module = moduleForPath(pathname)
  return module !== null && user.modules.includes(module)
}

// Primera pantalla del usuario según su perfil — a dónde mandarlo si intenta
// entrar a algo que no tiene, o al loguearse. `/dashboard` si lo tiene (caso
// normal); si no, la primera que sí tenga; si no tiene ninguna, NO_ACCESS_HOME.
export function firstAllowedPath(user: CurrentUser | null): string {
  if (!user) return '/login'
  if (user.role === 'ADMIN' || user.modules.includes('dashboard')) return '/dashboard'
  const firstModule = PATH_TO_MODULE.find(({ module }) => user.modules.includes(module))
  return firstModule?.prefix ?? NO_ACCESS_HOME
}
