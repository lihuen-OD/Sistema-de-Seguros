import type { Policy, PolicyEffectiveStatus, PolicyRef } from '../types'

// Utilidades del estado ADMINISTRATIVO de pólizas (effectiveStatus). Nada de
// este archivo interviene en montos: los cálculos económicos siguen usando
// `status` (contractual) — ver la regla de ESLint sobre *Calc.ts.

// El día de Argentina (businessTodayStr / daysUntilBusinessDate) vive en
// businessDate.ts: lo comparten estos estados y la cobertura activa (R4-A).

/**
 * ¿La póliza sigue pendiente de gestión de renovación? Solo Vigente y Próxima
 * a vencer: una Renovada ya está gestionada, y Vencida/De baja no se renuevan.
 */
export function isPendingRenewal(status: PolicyEffectiveStatus): boolean {
  return status === 'vigente' || status === 'proximo_vencer'
}

// ── Dashboard de Seguros ─────────────────────────────────────────────────────
// Las vistas reciben filas ya calculadas por insuranceDashboardCalc (que solo
// conoce `status`); lo administrativo se resuelve aparte, por id de póliza,
// sin tocar esos cálculos.

export interface AssetRenewalNote {
  renewedBy: PolicyRef
  /**
   * ¿El activo tiene una línea vigente en la póliza nueva? null = la póliza
   * nueva no está entre las cargadas (no se puede saber). Una renovación
   * parcial puede dejar al activo sin cobertura — por eso la alerta del
   * activo no se oculta, se completa con este dato.
   */
  assetContinues: boolean | null
}

export function renewalNoteForAsset(
  policyId: string,
  assetId: string,
  policiesById: Map<string, Policy>,
): AssetRenewalNote | null {
  const renewedBy = policiesById.get(policyId)?.renewal?.renewedBy
  if (!renewedBy) return null
  const renewalPolicy = policiesById.get(renewedBy.id)
  const assetContinues = renewalPolicy?.coverages
    ? renewalPolicy.coverages.some((coverage) => coverage.assetId === assetId && !coverage.bajaDate)
    : null
  return { renewedBy, assetContinues }
}
