import { getISOWeekKey } from './export'
import { resolveDocumentPaymentMethod } from './documentPaymentMethod'
import type { Currency, Policy, Asset, Company, CostCenter, AccountingDocument, DocumentPolicyAllocation } from '../types'

export type RowGrouping = 'empresa' | 'centro_costo' | 'aseguradora' | 'poliza' | 'activo'

// El documento ya llega cerrado en ambas monedas (totalAmountArs/totalAmountUsd,
// calculadas server-side al crearlo/editarlo — ver computeDualAmounts). Elegir
// la columna correcta reemplaza cualquier reconversión con una tasa fija.
export function pickDocTotal(doc: AccountingDocument, currency: Currency): number {
  return currency === 'ARS' ? (doc.totalAmountArs ?? 0) : (doc.totalAmountUsd ?? 0)
}

// Una asignación (allocatedAmount) es una porción del total del documento, en
// la moneda nativa del documento. Se re-expresa en la moneda pedida aplicando
// la misma fracción sobre el total ya cerrado en esa moneda.
export function allocationInCurrency(doc: AccountingDocument, allocatedAmount: number, currency: Currency): number {
  if (!doc.totalAmount) return 0
  return (allocatedAmount / doc.totalAmount) * pickDocTotal(doc, currency)
}

// Cada allocation ya apunta a una línea de cobertura puntual (assetId directo
// si tiene activo; empresa/centro de costo propios de la línea si es "sin
// activo") — se resuelve por allocation, no por póliza, porque una póliza de
// flota puede tener varias allocations del mismo documento repartidas entre
// distintos activos (ver seed.ts: factura de flota 60/40 entre 2 camiones).
// Usar el monto asignado (allocatedAmount) directamente en vez de
// recalcularlo desde el porcentaje es lo que hace que las asignaciones
// negativas de una Nota de Crédito aplicada compensen correctamente a las de
// la factura vinculada.
export interface AllocationContext {
  policyId: string
  companyId: string
  costCenterId: string
  assetId: string | null
  insuranceCompany: string
  allocatedAmount: number
}

export function buildDocumentAllocationContexts(
  allocations: DocumentPolicyAllocation[],
  policies: Policy[],
  assets: Asset[],
): Map<string, AllocationContext[]> {
  const policyById = new Map(policies.map((p) => [p.id, p]))
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const map = new Map<string, AllocationContext[]>()

  allocations.forEach((alloc) => {
    const policy = policyById.get(alloc.policyId)
    let companyId: string
    let costCenterId: string
    if (alloc.assetId) {
      const asset = assetById.get(alloc.assetId)
      companyId = asset?.companyId ?? ''
      costCenterId = asset?.costCenterId ?? ''
    } else {
      const coverage = policy?.coverages?.find((c) => c.id === alloc.policyAssetCoverageId)
      companyId = coverage?.companyId ?? ''
      costCenterId = coverage?.costCenterId ?? ''
    }
    const existing = map.get(alloc.accountingDocumentId) ?? []
    existing.push({
      policyId: alloc.policyId,
      companyId,
      costCenterId,
      assetId: alloc.assetId,
      insuranceCompany: policy?.insuranceCompany ?? '',
      allocatedAmount: alloc.allocatedAmount,
    })
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
    case 'aseguradora': {
      const insurers = Array.from(new Set(policies.map((p) => p.insuranceCompany))).sort()
      return insurers.map((name) => ({ id: name, label: name }))
    }
    case 'poliza':
      return policies.filter((p) => p.status !== 'vencida').map((p) => ({
        id: p.id, label: p.policyNumber, sublabel: `${(p.insuranceTypeNames ?? []).join(', ') || 'Sin tipo'} · ${p.insuranceCompany}`,
      }))
    case 'activo':
      return assets.map((a) => ({
        id: a.id, label: a.name, sublabel: `${a.internalCode} · ${a.assetType}`,
      }))
  }
}

export type EconomicMatrixData = Map<string, Map<string, number>>
export type EconomicPaymentMethodMatrix = Map<string, Map<string, Map<string, number>>>

export interface EconomicMatrixResult {
  matrix: EconomicMatrixData
  paymentMethods: EconomicPaymentMethodMatrix
}

export function buildEconomicMatrix(
  grouping: RowGrouping,
  displayCurrency: Currency,
  granularity: 'week' | 'month',
  policies: Policy[],
  assets: Asset[],
  documents: AccountingDocument[],
  allocations: DocumentPolicyAllocation[],
): EconomicMatrixResult {
  const allocationContexts = buildDocumentAllocationContexts(allocations, policies, assets)
  const documentsById = new Map(documents.map((doc) => [doc.id, doc]))
  const matrix: EconomicMatrixData = new Map()
  const paymentMethods: EconomicPaymentMethodMatrix = new Map()

  documents.forEach((doc) => {
    const key = granularity === 'week'
      ? getISOWeekKey(doc.issueDate)
      : doc.issueDate.substring(0, 7)
    const docContexts = allocationContexts.get(doc.id)
    if (!docContexts || docContexts.length === 0) return
    const paymentMethod = resolveDocumentPaymentMethod(doc.id, documentsById)

    docContexts.forEach((ctx) => {
      const policyAmount = allocationInCurrency(doc, ctx.allocatedAmount, displayCurrency)

      const rowIds: string[] = []
      switch (grouping) {
        case 'empresa':      if (ctx.companyId)    rowIds.push(ctx.companyId);    break
        case 'centro_costo': if (ctx.costCenterId) rowIds.push(ctx.costCenterId); break
        case 'aseguradora':  if (ctx.insuranceCompany) rowIds.push(ctx.insuranceCompany); break
        case 'poliza':       rowIds.push(ctx.policyId); break
        case 'activo':       if (ctx.assetId) rowIds.push(ctx.assetId); break
      }

      rowIds.forEach((rowId) => {
        if (!matrix.has(rowId)) matrix.set(rowId, new Map())
        const rowMap = matrix.get(rowId)!
        rowMap.set(key, (rowMap.get(key) ?? 0) + policyAmount)

        if (grouping === 'empresa') {
          if (!paymentMethods.has(rowId)) paymentMethods.set(rowId, new Map())
          const companyMethods = paymentMethods.get(rowId)!
          if (!companyMethods.has(paymentMethod)) companyMethods.set(paymentMethod, new Map())
          const methodPeriods = companyMethods.get(paymentMethod)!
          methodPeriods.set(key, (methodPeriods.get(key) ?? 0) + policyAmount)
        }
      })
    })
  })

  return { matrix, paymentMethods }
}
