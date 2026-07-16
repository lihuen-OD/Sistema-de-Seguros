// AUDITOR_MATAFUEGOS solo accede al flujo de auditoría mensual de
// matafuegos — mismo criterio que ya aplica el backend en
// auth.middleware.ts (deny-by-default). Esto es solo UX: la seguridad real
// ya la exige el backend, esto evita que el usuario navegue a una pantalla
// que igual le va a devolver 403 al pedir datos.
export const AUDITOR_MATAFUEGOS_HOME = '/fire-extinguishers/audits'

export function isAllowedForAuditorMatafuegos(pathname: string): boolean {
  if (pathname === '/fire-extinguishers/new') return false
  if (pathname === '/fire-extinguishers/dashboard') return false
  if (/^\/fire-extinguishers\/[^/]+\/edit$/.test(pathname)) return false
  if (pathname === '/fire-extinguishers') return true
  if (/^\/fire-extinguishers\/audits(\/.*)?$/.test(pathname)) return true
  if (/^\/fire-extinguishers\/[^/]+$/.test(pathname)) return true // detalle de un matafuego puntual
  return false
}
