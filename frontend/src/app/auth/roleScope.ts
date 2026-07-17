import type { CurrentUser } from '../../shared/api/auth.api'
import type { ModuleKey } from '../../shared/types'

// Un usuario sin módulos asignados cae en esta pantalla — no /dashboard,
// porque podría no tener acceso ni siquiera ahí.
export const NO_ACCESS_HOME = '/no-access'

// Mapeo ruta → módulo(s) — mismo criterio que ya exige el backend en cada
// requireModule(...) de los routers (deny-by-default). Esto es solo UX: la
// seguridad real la impone el backend; esto evita que el usuario navegue a
// una pantalla que igual le va a devolver 403 al pedir datos.
// `modules` es un array porque una misma ruta puede ser accesible por más de
// un módulo (ej. /fire-extinguishers/audits lo pueden abrir tanto el
// auditor — fire_extinguisher_audit_coverage — como el revisor —
// fire_extinguisher_audits —, aunque adentro cada uno vea cosas distintas).
// Ordenado de prefijo más específico a más general — el primer match gana
// (por eso /fire-extinguishers/audits/new, /fire-extinguishers/audits y
// /fire-extinguishers/dashboard van antes que el genérico /fire-extinguishers).
// `landable: false` marca una entrada como "no aterrizable" — sirve para el
// control de acceso (moduleForPath/hasModuleAccess) pero NO se ofrece como
// pantalla de inicio en firstAllowedPath, porque es una acción puntual
// (crear, ver un informe), no una pantalla para "aterrizar" después de
// loguearse — quien solo audita debe caer en la lista de Cobertura, no
// derecho en el wizard de "Nueva auditoría".
const PATH_TO_MODULE: Array<{ prefix: string; modules: ModuleKey[]; landable?: boolean }> = [
  { prefix: '/dashboard', modules: ['dashboard'] },
  { prefix: '/assets', modules: ['assets'] },
  { prefix: '/insurance/policies', modules: ['policies'] },
  { prefix: '/insurance/documents', modules: ['documents'] },
  { prefix: '/insurance/financial-analysis', modules: ['financial_analysis'] },
  { prefix: '/insurance/economic-analysis', modules: ['economic_analysis'] },
  { prefix: '/claims', modules: ['claims'] },
  // Crear/auditar es un permiso distinto de revisar/aprobar — ver el detalle
  // en cada componente (FireExtinguisherAuditsQueuePage/DetailPage), que
  // filtra más fino según cuál de los dos módulos tenga el usuario.
  { prefix: '/fire-extinguishers/audits/new', modules: ['fire_extinguisher_audit_coverage'], landable: false },
  { prefix: '/fire-extinguishers/audits/findings-report', modules: ['fire_extinguisher_audits'], landable: false },
  { prefix: '/fire-extinguishers/audits', modules: ['fire_extinguisher_audits', 'fire_extinguisher_audit_coverage'] },
  { prefix: '/fire-extinguishers/dashboard', modules: ['fire_extinguisher_dashboard'] },
  { prefix: '/fire-extinguishers', modules: ['fire_extinguishers'] },
  { prefix: '/producers', modules: ['producers'] },
  { prefix: '/tasks', modules: ['tasks'] },
  { prefix: '/settings/companies', modules: ['companies'] },
  { prefix: '/settings/cost-centers', modules: ['cost_centers'] },
  { prefix: '/settings/fixed-assets', modules: ['fixed_assets'] },
  { prefix: '/settings/insurance-types', modules: ['insurance_types'] },
  { prefix: '/settings/module-config', modules: ['module_config'] },
]

// Nunca otorgables por perfil — exclusivas de role === 'ADMIN'. Notificaciones
// agrega datos de todos los módulos sin filtrar por permisos, así que no es
// un módulo otorgable como el resto — queda siempre exclusivo del ADMIN.
const ADMIN_ONLY_PREFIXES = ['/settings/users', '/settings/access-profiles', '/notifications']

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function modulesForPath(pathname: string): ModuleKey[] {
  return PATH_TO_MODULE.find(({ prefix }) => matchesPrefix(pathname, prefix))?.modules ?? []
}

export function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
}

export function hasModuleAccess(user: CurrentUser | null, pathname: string): boolean {
  if (!user) return false
  if (user.role === 'ADMIN') return true
  if (isAdminOnlyPath(pathname)) return false
  const modules = modulesForPath(pathname)
  return modules.some((m) => user.modules.includes(m))
}

// Primera pantalla del usuario según su perfil — a dónde mandarlo si intenta
// entrar a algo que no tiene, o al loguearse. `/dashboard` si lo tiene (caso
// normal); si no, la primera que sí tenga; si no tiene ninguna, NO_ACCESS_HOME.
export function firstAllowedPath(user: CurrentUser | null): string {
  if (!user) return '/login'
  if (user.role === 'ADMIN' || user.modules.includes('dashboard')) return '/dashboard'
  const firstEntry = PATH_TO_MODULE.find(
    ({ modules, landable }) => landable !== false && modules.some((m) => user.modules.includes(m)),
  )
  return firstEntry?.prefix ?? NO_ACCESS_HOME
}
