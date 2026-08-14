import { getISOWeekKey } from './export'
import {
  normalizePaymentMethod,
  resolveDocumentPaymentMethod,
} from './documentPaymentMethod'
import type { Currency, Policy, Asset, Company, CostCenter, Installment, DocumentPolicyAllocation, AccountingDocument } from '../types'

export type RowGrouping = 'empresa' | 'centro_costo' | 'activo' | 'poliza'

// Cada cuota ya llega cerrada en ambas monedas (amountArs/amountUsd, calculadas
// server-side al crearla o al marcarla como pagada — ver computeDualAmounts).
// Elegir la columna correcta según el toggle de vista reemplaza cualquier
// reconversión con una tasa fija.
export function pickAmount(inst: Installment, displayCurrency: Currency): number {
  return displayCurrency === 'ARS' ? (inst.amountArs ?? 0) : (inst.amountUsd ?? 0)
}

// Siempre por fecha de vencimiento, esté pagada o no — el Análisis
// Financiero quiere ver cada cuota en el período que le correspondía vencer,
// no en el período en que se terminó pagando.
export function getInstallmentEffectiveDate(inst: Installment): string {
  return inst.dueDate
}

// Cada allocation ya apunta a una línea de cobertura puntual (assetId directo
// si tiene activo; empresa/centro de costo propios de la línea si es "sin
// activo") — se resuelve por allocation, no por póliza, porque una póliza de
// flota puede tener varias allocations del mismo documento repartidas entre
// distintos activos (ver seed.ts: factura de flota 60/40 entre 2 camiones).
interface AllocationContext {
  policyId: string
  companyId: string
  costCenterId: string
  assetId: string | null
  allocationPercentage: number
}

function buildDocumentAllocationContexts(
  allocations: DocumentPolicyAllocation[],
  policies: Policy[],
  assets: Asset[],
): Map<string, AllocationContext[]> {
  const policyById = new Map(policies.map((p) => [p.id, p]))
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const map = new Map<string, AllocationContext[]>()

  allocations.forEach((alloc) => {
    let companyId: string
    let costCenterId: string
    if (alloc.assetId) {
      const asset = assetById.get(alloc.assetId)
      companyId = asset?.companyId ?? ''
      costCenterId = asset?.costCenterId ?? ''
    } else {
      const coverage = policyById.get(alloc.policyId)?.coverages?.find((c) => c.id === alloc.policyAssetCoverageId)
      companyId = coverage?.companyId ?? ''
      costCenterId = coverage?.costCenterId ?? ''
    }
    const existing = map.get(alloc.accountingDocumentId) ?? []
    existing.push({ policyId: alloc.policyId, companyId, costCenterId, assetId: alloc.assetId, allocationPercentage: alloc.allocationPercentage })
    map.set(alloc.accountingDocumentId, existing)
  })
  return map
}

export interface MatrixRow { id: string; label: string; sublabel?: string }

export function getRows(
  grouping: RowGrouping,
  companies: Company[],
  costCenters: CostCenter[],
  assets: Asset[],
  policies: Policy[],
): MatrixRow[] {
  switch (grouping) {
    case 'empresa':
      return companies.filter((c) => c.status === 'activo').map((c) => ({ id: c.id, label: c.name }))
    case 'centro_costo':
      return costCenters.filter((cc) => cc.status === 'activo').map((cc) => ({
        id: cc.id, label: cc.name, sublabel: cc.description || undefined,
      }))
    case 'activo':
      return assets.map((a) => ({ id: a.id, label: a.name, sublabel: `${a.internalCode} · ${a.assetType}` }))
    case 'poliza':
      return policies.filter((p) => p.status !== 'vencida').map((p) => ({
        id: p.id, label: p.policyNumber, sublabel: `${(p.insuranceTypeNames ?? []).join(', ') || 'Sin tipo'} · ${p.insuranceCompany}`,
      }))
  }
}

export interface CellData { paid: number; pending: number }
export type MatrixData = Map<string, Map<string, CellData>>
export type PaymentMethodMatrix = Map<string, Map<string, Map<string, CellData>>>

export interface FinancialMatrixResult {
  matrix: MatrixData
  paymentMethods: PaymentMethodMatrix
}

export function buildMatrixData(
  grouping: RowGrouping,
  displayCurrency: Currency,
  granularity: 'week' | 'month',
  policies: Policy[],
  assets: Asset[],
  documents: AccountingDocument[],
  installments: Installment[],
  allocations: DocumentPolicyAllocation[],
): FinancialMatrixResult {
  const allocationContexts = buildDocumentAllocationContexts(allocations, policies, assets)
  const documentsById = new Map(documents.map((doc) => [doc.id, doc]))
  const documentPaymentMethods = new Map(
    documents.map((doc) => [doc.id, resolveDocumentPaymentMethod(doc.id, documentsById)]),
  )
  const matrix: MatrixData = new Map()
  const paymentMethods: PaymentMethodMatrix = new Map()

  installments.forEach((inst) => {
    const effectiveDate = getInstallmentEffectiveDate(inst)
    const key = granularity === 'week'
      ? getISOWeekKey(effectiveDate)
      : effectiveDate.substring(0, 7)
    const amount = pickAmount(inst, displayCurrency)
    const isPaid = inst.paymentStatus === 'PAID'
    const paymentMethod = (
      normalizePaymentMethod(inst.paymentMethod)
      || documentPaymentMethods.get(inst.accountingDocumentId)
      || 'Sin especificar'
    )
    const contexts = allocationContexts.get(inst.accountingDocumentId) ?? []

    // Se acumula una vez POR LÍNEA DE ASIGNACIÓN (no por fila deduplicada) —
    // si una póliza de flota reparte el mismo documento entre varios activos,
    // cada línea aporta su porción REAL (allocationPercentage), no un
    // promedio parejo, para que el total de la matriz coincida con la suma
    // real de cuotas del período.
    contexts.forEach((ctx) => {
      const splitAmount = amount * (ctx.allocationPercentage / 100)
      let rowId: string | null = null
      switch (grouping) {
        case 'empresa':      rowId = ctx.companyId || null; break
        case 'centro_costo': rowId = ctx.costCenterId || null; break
        case 'activo':       rowId = ctx.assetId; break
        case 'poliza':       rowId = ctx.policyId; break
      }
      if (!rowId) return

      if (!matrix.has(rowId)) matrix.set(rowId, new Map())
      const rowMap = matrix.get(rowId)!
      if (!rowMap.has(key)) rowMap.set(key, { paid: 0, pending: 0 })
      const cell = rowMap.get(key)!
      if (isPaid) cell.paid += splitAmount
      else cell.pending += splitAmount

      if (grouping === 'empresa') {
        if (!paymentMethods.has(rowId)) paymentMethods.set(rowId, new Map())
        const companyMethods = paymentMethods.get(rowId)!
        if (!companyMethods.has(paymentMethod)) companyMethods.set(paymentMethod, new Map())
        const methodPeriods = companyMethods.get(paymentMethod)!
        const methodCell = methodPeriods.get(key) ?? { paid: 0, pending: 0 }
        if (isPaid) methodCell.paid += splitAmount
        else methodCell.pending += splitAmount
        methodPeriods.set(key, methodCell)
      }
    })
  })

  return { matrix, paymentMethods }
}
