import type { DocumentForFinancial } from '../api/documents.api'

export type TypeDirectionMap = Record<string, { affectsLinkedDirection?: 'credit' | 'debit' | 'adjusts' | 'replaces' }>

const ADJUSTING_TYPES = ['CREDIT_NOTE', 'DEBIT_NOTE', 'ADJUSTMENT_ENTRY']

// +1 suma, -1 resta, 0 sin efecto numérico (Refacturación / tipo desconocido).
// Mismo criterio que documents-balance.service.ts (backend) vía affectsLinkedDirection.
export function getDirectionSign(
  doc: { documentType: string; adjustmentSign?: string | null },
  typeDefsByKey: TypeDirectionMap,
): number {
  const direction = typeDefsByKey[doc.documentType]?.affectsLinkedDirection
  if (direction === 'credit') return -1
  if (direction === 'debit') return 1
  if (direction === 'adjusts') return doc.adjustmentSign === 'NEGATIVE' ? -1 : 1
  return 0
}

// Suma el total "neto ajustado" (factura ± NC/ND/Ajuste ya APLICADOS vinculados) de
// una póliza, en ambas monedas — prorrateado por allocationPercentage cuando una
// factura (o su NC/ND/Ajuste) está repartida entre varias pólizas. `documents` debe
// venir de documentQueries.financial() (trae allocations con allocatedAmount/
// allocationPercentage embebidos, y ya excluye documentos Cancelados del lado del
// backend — ver documents.service.ts#findAllForFinancial).
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
    const facturaAlloc = factura.allocations.find((a) => a.policyId === policyId)
    if (!facturaAlloc) continue // esta factura no está asignada a esta póliza
    const share = facturaAlloc.allocationPercentage / 100
    totalArs += (factura.totalAmountArs ?? 0) * share
    totalUsd += (factura.totalAmountUsd ?? 0) * share

    const mods = documents.filter(
      (m) => m.linkedDocumentId === factura.id && m.documentStatus === 'APPLIED' && ADJUSTING_TYPES.includes(m.documentType),
    )
    for (const mod of mods) {
      const modAlloc = mod.allocations.find((a) => a.policyId === policyId)
      if (!modAlloc) continue
      const modShare = modAlloc.allocationPercentage / 100
      const sign = getDirectionSign(mod, typeDefsByKey)
      totalArs += Math.abs(mod.totalAmountArs ?? 0) * modShare * sign
      totalUsd += Math.abs(mod.totalAmountUsd ?? 0) * modShare * sign
    }
  }

  return { totalArs: +totalArs.toFixed(2), totalUsd: +totalUsd.toFixed(2) }
}

// % Prima/Suma Asegurada, en la moneda nativa de la póliza (misma convención que
// FacturaCard.pickDocAmount: nunca mezclar columnas de distinta moneda al mostrar un ratio).
export function computePsaPercentage(
  policy: { currency: 'ARS' | 'USD'; insuredAmountArs: number; insuredAmountUsd: number },
  totals: { totalArs: number; totalUsd: number },
): number | null {
  const insuredAmount = policy.currency === 'USD' ? policy.insuredAmountUsd : policy.insuredAmountArs
  const total = policy.currency === 'USD' ? totals.totalUsd : totals.totalArs
  if (!insuredAmount || insuredAmount <= 0) return null
  return +((total / insuredAmount) * 100).toFixed(2)
}
