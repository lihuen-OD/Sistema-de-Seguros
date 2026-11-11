import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildMatrixData, getRows as getFinancialRows, type RowGrouping as FinancialGrouping } from '../../src/shared/utils/financialAnalysisCalc'
import { buildEconomicMatrix, getRows as getEconomicRows, type RowGrouping as EconomicGrouping } from '../../src/shared/utils/economicAnalysisCalc'
import { NO_ASSET_LINE_ROW_ID, NO_FIXED_ASSET_ROW_ID, fixedAssetRows } from '../../src/shared/utils/fixedAssetGrouping'
import { UNASSIGNED_FIXED_ASSET_LABEL } from '../../src/shared/utils/insuranceDashboardCalc'
import type { AccountingDocument, Asset, Company, CostCenter, DocumentPolicyAllocation, Installment, Policy } from '../../src/shared/types'

// Agrupación «Bien de uso» de los Análisis Financiero (cuotas por vencimiento,
// reparto por %) y Económico (documentos por emisión, reparto por importe
// asignado). Relación existente: Asset.fixedAssetId → FixedAsset.

function close(actual: number | undefined, expected: number, msg?: string) {
  assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-6, `${msg ?? 'valor'}: esperaba ${expected}, llegó ${actual}`)
}

const FA = {
  planta: { id: 'fa-planta', code: 'BU-01', name: 'Planta' },
  flota: { id: 'fa-flota', code: 'BU-02', name: 'Flota' },
}

function asset(id: string, fixedAsset: { id: string; code: string; name: string } | null): Asset {
  return {
    id, name: `Activo ${id}`, internalCode: id.toUpperCase(), assetType: 'vehiculo', status: 'activo',
    companyId: 'c1', costCenterId: 'cc1', fixedAssetId: fixedAsset?.id ?? null, fixedAsset,
  } as unknown as Asset
}

const assets: Asset[] = [asset('a1', FA.planta), asset('a2', FA.flota), asset('a3', FA.flota), asset('a4', null)]
const companies = [{ id: 'c1', name: 'Empresa', status: 'activo' }] as unknown as Company[]
const costCenters = [{ id: 'cc1', name: 'CC', status: 'activo' }] as unknown as CostCenter[]
const policies = [{
  id: 'P1', policyNumber: 'P-1', insuranceCompany: 'Aseguradora', status: 'vigente', insuranceTypeNames: [],
  coverages: [{ id: 'cov-rc', assetId: null, companyId: 'c1', costCenterId: 'cc1' }],
}] as unknown as Policy[]

let seq = 0
function alloc(docId: string, assetId: string | null, amount: number, pct: number): DocumentPolicyAllocation {
  seq += 1
  return {
    id: `al-${seq}`, accountingDocumentId: docId, policyId: 'P1', assetId,
    policyAssetCoverageId: assetId ? `cov-${assetId}` : 'cov-rc', allocatedAmount: amount, allocationPercentage: pct,
  } as DocumentPolicyAllocation
}

function document(id: string, issueDate: string, total: number, documentType = 'INVOICE'): AccountingDocument {
  return {
    id, documentNumber: id, documentType, issueDate, currency: 'ARS', exchangeRate: 1000,
    netAmount: total, vatAmount: 0, otherTaxesAmount: 0, totalAmount: total,
    totalAmountArs: total, totalAmountUsd: total / 1000, paymentMethod: 'Transferencia', linkedDocumentId: null,
  } as unknown as AccountingDocument
}

function installment(docId: string, dueDate: string, amount: number, paid: boolean): Installment {
  seq += 1
  return {
    id: `i-${seq}`, accountingDocumentId: docId, installmentNumber: seq, dueDate, amount, currency: 'ARS',
    amountArs: amount, amountUsd: amount / 1000, paymentStatus: paid ? 'PAID' : 'PENDING', paymentMethod: null,
  } as unknown as Installment
}

// D1: factura 1000 → a1 40 %, a2 30 %, a4 (sin bien de uso) 20 %, línea sin activo 10 %.
// D2: factura de flota 600 → a2 50 %, a3 50 % (mismo bien de uso: no se duplica).
// D3: NC −100 aplicada a a2 (solo Económico: no tiene cuotas).
const documents = [document('D1', '2026-03-05', 1000), document('D2', '2026-04-10', 600), document('D3', '2026-04-20', 100, 'CREDIT_NOTE')]
const allocations = [
  alloc('D1', 'a1', 400, 40), alloc('D1', 'a2', 300, 30), alloc('D1', 'a4', 200, 20), alloc('D1', null, 100, 10),
  alloc('D2', 'a2', 300, 50), alloc('D2', 'a3', 300, 50),
  alloc('D3', 'a2', -100, 100),
]
const installments = [
  installment('D1', '2026-03-10', 500, true), installment('D1', '2026-04-10', 500, false),
  installment('D2', '2026-04-15', 600, false),
]

const FIN_GROUPINGS: FinancialGrouping[] = ['empresa', 'centro_costo', 'activo', 'bien_de_uso', 'poliza']
const ECO_GROUPINGS: EconomicGrouping[] = ['empresa', 'centro_costo', 'aseguradora', 'poliza', 'activo', 'bien_de_uso']

function finMatrix(grouping: FinancialGrouping, granularity: 'week' | 'month' = 'month', currency: 'ARS' | 'USD' = 'ARS') {
  return buildMatrixData(grouping, currency, granularity, policies, assets, documents, installments, allocations).matrix
}
function ecoMatrix(grouping: EconomicGrouping, granularity: 'week' | 'month' = 'month', currency: 'ARS' | 'USD' = 'ARS') {
  return buildEconomicMatrix(grouping, currency, granularity, policies, assets, documents, allocations).matrix
}
const finRowTotal = (m: ReturnType<typeof finMatrix>, id: string) => [...(m.get(id)?.values() ?? [])].reduce((s, c) => s + c.paid + c.pending, 0)
const ecoRowTotal = (m: ReturnType<typeof ecoMatrix>, id: string) => [...(m.get(id)?.values() ?? [])].reduce((s, v) => s + v, 0)
/** Total de la tabla tal como lo arma la página: Σ de las filas listadas. */
const finTableTotal = (g: FinancialGrouping, m = finMatrix(g)) => getFinancialRows(g, companies, costCenters, assets, policies).reduce((s, r) => s + finRowTotal(m, r.id), 0)
const ecoTableTotal = (g: EconomicGrouping, m = ecoMatrix(g)) => getEconomicRows(g, companies, costCenters, assets, policies).reduce((s, r) => s + ecoRowTotal(m, r.id), 0)

describe('filas «Bien de uso»', () => {
  test('un fila por bien de uso (por código), más «Sin Bien de Uso asignado» y «Líneas sin activo» al final', () => {
    const rows = fixedAssetRows(assets)
    assert.deepEqual(rows.map((r) => r.id), [FA.planta.id, FA.flota.id, NO_FIXED_ASSET_ROW_ID, NO_ASSET_LINE_ROW_ID])
    assert.deepEqual(rows.map((r) => r.label), ['Planta', 'Flota', UNASSIGNED_FIXED_ASSET_LABEL, 'Líneas sin activo'])
    assert.equal(rows[1].sublabel, 'BU-02 · 2 activos')
    assert.equal(rows[0].sublabel, 'BU-01 · 1 activo')
    assert.deepEqual(getFinancialRows('bien_de_uso', companies, costCenters, assets, policies), rows)
    assert.deepEqual(getEconomicRows('bien_de_uso', companies, costCenters, assets, policies), rows)
  })

  test('agrupa por id, no por nombre; un bien de uso sin ficha resuelta igual tiene su fila', () => {
    const twins = [asset('x1', { id: 'fa-a', code: 'A', name: 'Galpón' }), asset('x2', { id: 'fa-b', code: 'B', name: 'Galpón' }),
      { ...asset('x3', null), fixedAssetId: 'fa-c' } as Asset]
    const rows = fixedAssetRows(twins)
    assert.deepEqual(rows.slice(0, 3).map((r) => r.id), ['fa-c', 'fa-a', 'fa-b'])
    assert.equal(rows[0].label, 'Bien de uso')
  })
})

describe('Financiero — cuotas por vencimiento, reparto por %', () => {
  test('importes por bien de uso: la flota suma a2 y a3 una sola vez cada línea; nada se pierde', () => {
    const m = finMatrix('bien_de_uso')
    close(finRowTotal(m, FA.planta.id), 400)
    close(finRowTotal(m, FA.flota.id), 300 + 300 + 300)
    close(finRowTotal(m, NO_FIXED_ASSET_ROW_ID), 200)
    close(finRowTotal(m, NO_ASSET_LINE_ROW_ID), 100)
    // Pagado / pendiente por vencimiento (marzo pagado, abril pendiente).
    close(m.get(FA.planta.id)!.get('2026-03')!.paid, 200)
    close(m.get(FA.planta.id)!.get('2026-04')!.pending, 200)
    close(m.get(FA.flota.id)!.get('2026-04')!.pending, 150 + 300 + 300)
  })

  test('el total de la tabla por bien de uso es el total de cuotas (= agrupación por póliza), en ARS, USD y por semana', () => {
    const allInstallments = installments.reduce((s, i) => s + i.amount, 0)
    close(finTableTotal('bien_de_uso'), allInstallments)
    close(finTableTotal('poliza'), allInstallments)
    for (const currency of ['ARS', 'USD'] as const) {
      for (const granularity of ['week', 'month'] as const) {
        const bu = finMatrix('bien_de_uso', granularity, currency)
        const po = finMatrix('poliza', granularity, currency)
        const sum = (m: typeof bu) => [...m.keys()].reduce((s, id) => s + finRowTotal(m, id), 0)
        close(sum(bu), sum(po), `${currency} ${granularity}`)
        // Toda celda con importe tiene su fila en la tabla (ninguna fila huérfana).
        const ids = new Set(getFinancialRows('bien_de_uso', companies, costCenters, assets, policies).map((r) => r.id))
        for (const id of bu.keys()) assert.ok(ids.has(id), `fila ${id}`)
      }
    }
  })

  test('agregar «Bien de uso» no cambia las demás agrupaciones', () => {
    close(finTableTotal('activo'), 1500, 'Activo sigue sin la línea sin activo (comportamiento existente)')
    close(finTableTotal('empresa'), 1600)
    close(finTableTotal('centro_costo'), 1600)
    for (const g of FIN_GROUPINGS) assert.ok(getFinancialRows(g, companies, costCenters, assets, policies).length > 0, g)
  })
})

describe('Económico — documentos por emisión, reparto por importe asignado', () => {
  test('importes por bien de uso: la NC compensa a su bien de uso; nada se pierde ni se duplica', () => {
    const m = ecoMatrix('bien_de_uso')
    close(ecoRowTotal(m, FA.planta.id), 400)
    close(ecoRowTotal(m, FA.flota.id), 300 + 300 + 300 - 100)
    close(ecoRowTotal(m, NO_FIXED_ASSET_ROW_ID), 200)
    close(ecoRowTotal(m, NO_ASSET_LINE_ROW_ID), 100)
    close(m.get(FA.flota.id)!.get('2026-03'), 300)
    close(m.get(FA.flota.id)!.get('2026-04'), 600 - 100)
  })

  test('el total de la tabla por bien de uso es el de todas las asignaciones (= póliza = aseguradora), en ARS, USD y por semana', () => {
    const allAllocated = allocations.reduce((s, a) => s + a.allocatedAmount, 0)
    close(ecoTableTotal('bien_de_uso'), allAllocated)
    close(ecoTableTotal('poliza'), allAllocated)
    close(ecoTableTotal('aseguradora'), allAllocated)
    for (const currency of ['ARS', 'USD'] as const) {
      for (const granularity of ['week', 'month'] as const) {
        const bu = ecoMatrix('bien_de_uso', granularity, currency)
        const po = ecoMatrix('poliza', granularity, currency)
        const sum = (m: typeof bu) => [...m.keys()].reduce((s, id) => s + ecoRowTotal(m, id), 0)
        close(sum(bu), sum(po), `${currency} ${granularity}`)
        const ids = new Set(getEconomicRows('bien_de_uso', companies, costCenters, assets, policies).map((r) => r.id))
        for (const id of bu.keys()) assert.ok(ids.has(id), `fila ${id}`)
      }
    }
  })

  test('Financiero y Económico difieren legítimamente (cuotas vs emisión; la NC solo impacta en Económico)', () => {
    close(finRowTotal(finMatrix('bien_de_uso'), FA.flota.id), 900)
    close(ecoRowTotal(ecoMatrix('bien_de_uso'), FA.flota.id), 800)
    for (const g of ECO_GROUPINGS) assert.ok(getEconomicRows(g, companies, costCenters, assets, policies).length > 0, g)
  })
})
