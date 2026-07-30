import type { DocumentForFinancial } from '../api/documents.api'

export type TypeDirectionMap = Record<string, { affectsLinkedDirection?: 'credit' | 'debit' | 'adjusts' | 'economicImpact' }>

const ADJUSTING_TYPES = ['CREDIT_NOTE', 'DEBIT_NOTE', 'ADJUSTMENT_ENTRY', 'ENDORSEMENT']

// +1 suma, -1 resta, 0 sin efecto numérico (tipo desconocido, o Endoso sin impacto económico).
// Mismo criterio que documents-balance.service.ts (backend) vía affectsLinkedDirection.
export function getDirectionSign(
  doc: { documentType: string; adjustmentSign?: string | null; economicImpactType?: string | null },
  typeDefsByKey: TypeDirectionMap,
): number {
  const direction = typeDefsByKey[doc.documentType]?.affectsLinkedDirection
  if (direction === 'credit') return -1
  if (direction === 'debit') return 1
  if (direction === 'adjusts') return doc.adjustmentSign === 'NEGATIVE' ? -1 : 1
  if (direction === 'economicImpact') {
    if (doc.economicImpactType === 'INCREASES_COST') return 1
    if (doc.economicImpactType === 'DECREASES_COST') return -1
    return 0
  }
  return 0
}

// Suma el total "neto ajustado" (factura ± NC/ND/Ajuste ya APLICADOS vinculados) de
// una póliza, en ambas monedas. Una póliza puede tener VARIAS líneas de cobertura
// (varios activos), y una misma factura puede repartirse entre varias de esas
// líneas a la vez (ej. flota 60/40 entre 2 camiones) — por eso se suman TODAS las
// allocations que apuntan a esta póliza, no solo la primera que aparezca.
// `documents` debe venir de documentQueries.financial() (trae allocations con
// allocatedAmount/allocationPercentage embebidos, y ya excluye documentos
// Cancelados del lado del backend — ver documents.service.ts#findAllForFinancial).
//
// Si un NC/ND/Ajuste aplicado no tiene su propia fila de allocation para esta
// póliza (p.ej. una Nota de Débito que el usuario nunca repartió manualmente por
// póliza), su efecto no se puede atribuir de forma precisa y se omite — misma
// limitación conocida que ya documenta documents.service.ts ("Fase 3") para el
// reparto manual de allocations.
export function computePolicyInvoicedTotal(
  policyId: string,
  documents: DocumentForFinancial[],
  typeDefsByKey: TypeDirectionMap,
): { totalArs: number; totalUsd: number } {
  let totalArs = 0
  let totalUsd = 0

  const facturas = documents.filter((d) => d.documentType === 'INVOICE')
  for (const factura of facturas) {
    const facturaAllocs = factura.allocations.filter((a) => a.policyId === policyId)
    if (facturaAllocs.length === 0) continue // esta factura no está asignada a esta póliza
    const share = facturaAllocs.reduce((s, a) => s + a.allocationPercentage, 0) / 100
    totalArs += (factura.totalAmountArs ?? 0) * share
    totalUsd += (factura.totalAmountUsd ?? 0) * share

    const mods = documents.filter(
      (m) => m.linkedDocumentId === factura.id && m.documentStatus === 'APPLIED' && ADJUSTING_TYPES.includes(m.documentType),
    )
    for (const mod of mods) {
      const modAllocs = mod.allocations.filter((a) => a.policyId === policyId)
      if (modAllocs.length === 0) continue
      const modShare = modAllocs.reduce((s, a) => s + a.allocationPercentage, 0) / 100
      const sign = getDirectionSign(mod, typeDefsByKey)
      totalArs += Math.abs(mod.totalAmountArs ?? 0) * modShare * sign
      totalUsd += Math.abs(mod.totalAmountUsd ?? 0) * modShare * sign
    }
  }

  return { totalArs: +totalArs.toFixed(2), totalUsd: +totalUsd.toFixed(2) }
}

// Igual que computePolicyInvoicedTotal, pero acotado a UNA línea de cobertura
// puntual (policyAssetCoverageId) — necesario cuando la póliza cubre varios
// activos y hace falta saber cuánto se facturó para ESE activo en particular,
// no para la póliza entera (ver P/SA en la ficha del Activo).
export function computeCoverageInvoicedTotal(
  coverageId: string,
  documents: DocumentForFinancial[],
  typeDefsByKey: TypeDirectionMap,
): { totalArs: number; totalUsd: number } {
  let totalArs = 0
  let totalUsd = 0

  const facturas = documents.filter((d) => d.documentType === 'INVOICE')
  for (const factura of facturas) {
    const facturaAlloc = factura.allocations.find((a) => a.policyAssetCoverageId === coverageId)
    if (!facturaAlloc) continue
    const share = facturaAlloc.allocationPercentage / 100
    totalArs += (factura.totalAmountArs ?? 0) * share
    totalUsd += (factura.totalAmountUsd ?? 0) * share

    const mods = documents.filter(
      (m) => m.linkedDocumentId === factura.id && m.documentStatus === 'APPLIED' && ADJUSTING_TYPES.includes(m.documentType),
    )
    for (const mod of mods) {
      const modAlloc = mod.allocations.find((a) => a.policyAssetCoverageId === coverageId)
      if (!modAlloc) continue
      const modShare = modAlloc.allocationPercentage / 100
      const sign = getDirectionSign(mod, typeDefsByKey)
      totalArs += Math.abs(mod.totalAmountArs ?? 0) * modShare * sign
      totalUsd += Math.abs(mod.totalAmountUsd ?? 0) * modShare * sign
    }
  }

  return { totalArs: +totalArs.toFixed(2), totalUsd: +totalUsd.toFixed(2) }
}

// % Prima/Suma Asegurada, siempre en USD — una póliza puede tener varias líneas
// de cobertura en monedas distintas, así que ya no hay una "moneda nativa de la
// póliza" única para elegir; USD es la moneda de comparación estándar en todo
// el dashboard (ver "Todo se estandariza en USD" en insuranceDashboardCalc.ts).
export function computePsaPercentage(insuredAmountUsd: number, totalUsd: number): number | null {
  if (!insuredAmountUsd || insuredAmountUsd <= 0) return null
  return +((totalUsd / insuredAmountUsd) * 100).toFixed(2)
}
