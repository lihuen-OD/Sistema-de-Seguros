import { prisma } from '../../config/database'
import type { RequestUser, ModuleKey, AuditScopeArea } from '../types'

// Resultado de resolver el alcance de auditoría de un usuario para un área
// puntual. `restricted: false` significa "sin filtro" — el caller ve/opera
// todo, exactamente el comportamiento de hoy (ADMIN, o un revisor que no
// tiene el módulo "de auditar" de esta área). `restricted: true` con
// `values: []` significa "tiene el módulo pero todavía no le asignaron nada"
// — debe ver una pantalla vacía, no un error.
export interface AuditScopeContext {
  restricted: boolean
  values: string[]
}

const UNRESTRICTED: AuditScopeContext = { restricted: false, values: [] }

// `scopedModules`: SOLO los módulos "de auditar/crear" de esta área (ej.
// fire_extinguisher_audit_coverage) — nunca los de revisión (ej.
// fire_extinguisher_audits). Un revisor debe seguir viendo/aprobando el
// trabajo de todos los auditores; el alcance solo recorta la superficie del
// auditor, nunca la del revisor ni la del ADMIN (mismo bypass que
// requireModule ya aplica hoy).
export async function resolveAuditScope(
  user: RequestUser,
  area: AuditScopeArea,
  scopedModules: ModuleKey[],
): Promise<AuditScopeContext> {
  if (user.role === 'ADMIN') return UNRESTRICTED
  if (!scopedModules.some((m) => user.modules.includes(m))) return UNRESTRICTED

  const rows = await prisma.userAuditScope.findMany({
    where: { userId: user.userId, area },
    select: { scopeValue: true },
  })
  return { restricted: true, values: rows.map((r) => r.scopeValue) }
}

export function isInScope(scope: AuditScopeContext, value: string | null | undefined): boolean {
  return !scope.restricted || (!!value && scope.values.includes(value))
}

// Reemplazo total del alcance de UN usuario en UNA sola área — a diferencia
// de users.service.ts#replaceAuditScope (que reemplaza el conjunto completo
// que le manda el frontend, ya reconstruido con las áreas no editadas
// preservadas), esta función es la que usan los endpoints dedicados de
// asignación (.../assignments/:userId) para pisar exclusivamente ASSET_AUDIT
// o INSURANCE_AUDIT sin tocar ninguna otra área del mismo usuario.
export async function replaceUserAuditScope(userId: string, area: AuditScopeArea, scopeValues: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.userAuditScope.deleteMany({ where: { userId, area } }),
    ...(scopeValues.length > 0
      ? [prisma.userAuditScope.createMany({ data: scopeValues.map((scopeValue) => ({ userId, area, scopeValue })) })]
      : []),
  ])
}
