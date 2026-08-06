import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { assetQueries } from '../../../shared/api/assets.api'
import { policyQueries } from '../../../shared/api/policies.api'
import { documentQueries } from '../../../shared/api/documents.api'
import { exchangeRateQueries } from '../../../shared/api/exchange-rate.api'
import { renewalProjectionsApi, renewalProjectionQueries, renewalProjectionKeys } from '../../../shared/api/renewal-projections.api'
import type { RenewalProjectionMode } from '../../../shared/api/renewal-projections.api'
import {
  buildAssetRealTimelineByCuota,
  detectRenewalCycleByCuota,
  buildAssetRealTimelineByDocument,
  detectRenewalCycleByDocument,
  resolveEffectiveCycle,
  autoInstallmentsCount,
  projectAssetRow,
  resolveMonthCell,
  todayMonthKey,
  addMonthsToKey,
  nextMonthKey,
  buildMonthRange,
} from '../../../shared/utils/renewalProjectionCalc'
import { monthLabel } from './RenewalProjectionTable'
import type { AssetRowData } from './RenewalProjectionTable'
import { BREAKDOWN_FIELD_DEFS } from './RenewalFieldSelectorPopover'
import type { BreakdownFieldKey } from './RenewalFieldSelectorPopover'
import { downloadXLSX } from '../../../shared/utils/export'
import type { ExportCell } from '../../../shared/utils/export'
import type { Currency } from '../../../shared/types'

// Financiero calcula lo real por cuota (dueDate), Económico por documento
// (issueDate) — dos números legítimamente distintos para el mismo activo,
// así que este hook elige el par de funciones correcto según `mode` y nunca
// mezcla datos ni overrides entre los dos (cada modo tiene su propia fila
// en AssetRenewalProjectionOverride, ver @@unique([assetId, mode])).
const BUILDERS = {
  FINANCIAL: { buildTimeline: buildAssetRealTimelineByCuota, detectCycle: detectRenewalCycleByCuota },
  ECONOMIC: { buildTimeline: buildAssetRealTimelineByDocument, detectCycle: detectRenewalCycleByDocument },
} as const

export type RenewalOverrideField = 'net' | 'vat' | 'other' | 'pct' | 'cycle' | 'installments' | 'start'

const OVERRIDE_KEY_BY_FIELD: Record<RenewalOverrideField, string> = {
  net: 'netOverride',
  vat: 'vatOverride',
  other: 'otherOverride',
  pct: 'growthPercentOverride',
  cycle: 'cycleLengthMonthsOverride',
  installments: 'installmentsCountOverride',
  start: 'startMonthOverride',
}

export function useRenewalProjectionData(mode: RenewalProjectionMode) {
  const queryClient = useQueryClient()
  const { buildTimeline, detectCycle } = BUILDERS[mode]

  const [currency, setCurrency] = useState<Currency>('ARS')
  const [horizonYears, setHorizonYears] = useState<1 | 2 | 3>(2)
  const [customEnd, setCustomEnd] = useState<string | null>(null)
  const [breakdownFields, setBreakdownFields] = useState<BreakdownFieldKey[]>([])
  const [hideAssetPanel, setHideAssetPanel] = useState(false)

  // ─── Datos remotos ───────────────────────────────────────────────────────────
  // Sin filtro de fecha — la proyección necesita el historial completo de cada
  // activo, no un rango elegido, para poder detectar su ciclo real de renovación.
  const { data: financialDocs = [], isError: isErrorDocs } = useQuery(documentQueries.financial())
  const { data: allPolicies = [], isError: isErrorPolicies } = useQuery(policyQueries.list({ includeCoverages: true }))
  const { data: allAssets = [], isError: isErrorAssets } = useQuery(assetQueries.list())
  const { data: exchangeRateData, isError: isErrorFx } = useQuery(exchangeRateQueries.current())
  const { data: overrides = [], isError: isErrorOverrides, dataUpdatedAt: overridesVersion } = useQuery(renewalProjectionQueries.overrides(mode))
  const isError = isErrorDocs || isErrorPolicies || isErrorAssets || isErrorFx || isErrorOverrides
  const exchangeRate = exchangeRateData?.rate ?? 1

  // ─── Mutaciones ──────────────────────────────────────────────────────────────

  const upsertMutation = useMutation({
    mutationFn: ({ assetId, field, value }: { assetId: string; field: RenewalOverrideField; value: number | string }) =>
      renewalProjectionsApi.upsert(assetId, mode, { [OVERRIDE_KEY_BY_FIELD[field]]: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: renewalProjectionKeys.all(mode) })
      toast.success('Guardado — se recalculan las renovaciones de este activo')
    },
    onError: () => toast.error('No se pudo guardar el cambio'),
  })

  const resetMutation = useMutation({
    mutationFn: (assetId: string) => renewalProjectionsApi.reset(assetId, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: renewalProjectionKeys.all(mode) })
      toast.success('Vuelto al valor calculado desde el comprobante')
    },
    onError: () => toast.error('No se pudo restablecer el activo'),
  })

  const resetAllMutation = useMutation({
    mutationFn: (assetIds: string[]) => Promise.all(assetIds.map((id) => renewalProjectionsApi.reset(id, mode))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: renewalProjectionKeys.all(mode) })
      toast.success('Todos los activos vueltos al valor automático')
    },
    onError: () => toast.error('No se pudo restablecer todos los activos'),
  })

  // ─── Activos relevantes (los que alguna vez tuvieron una línea de cobertura) ─

  const relevantAssets = useMemo(() => {
    const ids = new Set<string>()
    for (const policy of allPolicies) {
      for (const coverage of policy.coverages ?? []) {
        if (coverage.assetId) ids.add(coverage.assetId)
      }
    }
    return allAssets.filter((a) => ids.has(a.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [allAssets, allPolicies])

  const overridesByAssetId = useMemo(() => new Map(overrides.map((o) => [o.assetId, o])), [overrides])

  // ─── Línea de tiempo real + ciclo por activo ─────────────────────────────────

  const perAssetData = useMemo(
    () =>
      relevantAssets.map((asset) => ({
        asset,
        realTimeline: buildTimeline(asset.id, financialDocs),
        cycle: detectCycle(asset.id, financialDocs, allPolicies),
      })),
    [relevantAssets, financialDocs, allPolicies, buildTimeline, detectCycle],
  )

  const today = todayMonthKey()
  const { firstRealMonthKey, lastRealMonthKey } = useMemo(() => {
    let first: string | null = null
    let last: string | null = null
    for (const { realTimeline } of perAssetData) {
      for (const monthKey of realTimeline.keys()) {
        if (!first || monthKey < first) first = monthKey
        if (!last || monthKey > last) last = monthKey
      }
    }
    return { firstRealMonthKey: first ?? today, lastRealMonthKey: last ?? today }
  }, [perAssetData, today])

  const horizonEndMonthKey = customEnd ?? addMonthsToKey(lastRealMonthKey > today ? lastRealMonthKey : today, horizonYears * 12)
  const axis = useMemo(() => buildMonthRange(firstRealMonthKey, horizonEndMonthKey), [firstRealMonthKey, horizonEndMonthKey])

  // ─── Filas (valores efectivos = override ?? automático + proyección) ────────

  const rows: AssetRowData[] = useMemo(
    () =>
      perAssetData.map(({ asset, realTimeline, cycle }) => {
        const override = overridesByAssetId.get(asset.id)
        const netArs = override?.netOverride ?? cycle.defaultNetArs
        const vatArs = override?.vatOverride ?? cycle.defaultVatArs
        const otherArs = override?.otherOverride ?? cycle.defaultOtherArs
        const pct = override?.growthPercentOverride ?? cycle.autoGrowthPercent
        // "Cada cuántos meses renueva", "cuántas cuotas" y "en qué mes arranca"
        // son editables SOLO acá — nunca tocan la póliza/documento real, y
        // solo afectan los meses proyectados de la fila.
        const effectiveCycle = resolveEffectiveCycle(
          cycle,
          override?.cycleLengthMonthsOverride ?? null,
          override?.installmentsCountOverride ?? null,
          override?.startMonthOverride ?? null,
        )
        const projectedList = projectAssetRow(effectiveCycle, nextMonthKey(lastRealMonthKey), horizonEndMonthKey, netArs, vatArs, otherArs, pct)
        return {
          assetId: asset.id,
          name: asset.name,
          code: `${asset.internalCode} · ${asset.assetType}`,
          realTimeline,
          projectedByMonth: new Map(projectedList.map((c) => [c.monthKey, c])),
          netArs,
          vatArs,
          otherArs,
          pct,
          cycleLengthMonths: effectiveCycle.cycleLengthMonths,
          installmentsCount: autoInstallmentsCount(effectiveCycle),
          startMonthKey: effectiveCycle.lastRenewalStartMonthKey,
          isOverridden: !!override,
        }
      }),
    [perAssetData, overridesByAssetId, lastRealMonthKey, horizonEndMonthKey],
  )

  // ─── KPIs ────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    let projectedTotalArs = 0
    let withHistory = 0
    for (const row of rows) {
      if (row.realTimeline.size > 0) withHistory += 1
      for (const monthKey of axis) {
        if (monthKey <= lastRealMonthKey) continue
        const cell = resolveMonthCell(row.realTimeline, row.projectedByMonth, monthKey, row.netArs, row.vatArs, row.otherArs)
        if (cell) projectedTotalArs += cell.totalArs
      }
    }
    return { projectedTotalArs, withHistory, withoutHistory: rows.length - withHistory }
  }, [rows, axis, lastRealMonthKey])

  const projectedDisplay = currency === 'USD' && exchangeRate > 0 ? kpis.projectedTotalArs / exchangeRate : kpis.projectedTotalArs

  // ─── Acciones ────────────────────────────────────────────────────────────────

  function handleCommitField(assetId: string, field: RenewalOverrideField, value: number | string) {
    upsertMutation.mutate({ assetId, field, value })
  }

  function handleResetRow(assetId: string) {
    resetMutation.mutate(assetId)
  }

  function handleResetAll() {
    const overriddenIds = rows.filter((r) => r.isOverridden).map((r) => r.assetId)
    if (overriddenIds.length === 0) {
      toast.info('No hay activos con valores editados')
      return
    }
    resetAllMutation.mutate(overriddenIds)
  }

  function toggleBreakdownField(key: BreakdownFieldKey) {
    setBreakdownFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  async function handleExportExcel(filenamePrefix: string) {
    const fields = BREAKDOWN_FIELD_DEFS.filter((f) => breakdownFields.includes(f.key))
    const showBreakdown = fields.length > 0

    // Mismo criterio que en pantalla: si el panel del activo está oculto (o
    // el "Detalle por mes" no tiene nada tildado), el export tampoco los
    // incluye — mismo orden que las columnas de la tabla (Neto/IVA/Otros/
    // Total, Ciclo/Cuotas/Inicio, % renov.). "Inicio" es 'YYYY-MM' — no numérico.
    const ASSET_DATA_COLUMNS: { label: string; numeric: boolean; value: (row: AssetRowData) => ExportCell }[] = [
      { label: 'Neto', numeric: true, value: (row) => row.netArs },
      { label: 'IVA', numeric: true, value: (row) => row.vatArs },
      { label: 'Otros imp.', numeric: true, value: (row) => row.otherArs },
      { label: 'Total', numeric: true, value: (row) => row.netArs + row.vatArs + row.otherArs },
      { label: 'Ciclo (m)', numeric: true, value: (row) => row.cycleLengthMonths },
      { label: 'Cuotas', numeric: true, value: (row) => row.installmentsCount },
      { label: 'Inicio', numeric: false, value: (row) => row.startMonthKey },
      { label: '% renov.', numeric: true, value: (row) => row.pct },
    ]
    const assetDataCols = hideAssetPanel ? [] : ASSET_DATA_COLUMNS
    const leadingLabels = ['Activo', ...assetDataCols.map((c) => c.label)]

    // Sin "Detalle por mes": una columna "Total" plana por mes, como siempre.
    // Con "Detalle por mes": cada mes ocupa un bloque de columnas (una por
    // campo tildado) — en vez de repetir "2026-07 Neto / 2026-07 IVA / ..."
    // en el título de cada columna (así quedaba antes, difícil de leer en
    // Excel), se agrupa con una celda combinada por mes en la fila de arriba
    // y el nombre de cada campo en la fila de abajo — mismo criterio visual
    // que la tabla en pantalla, en vez de repetir la fecha por columna.
    const monthValueHeaders = showBreakdown ? axis.flatMap(() => fields.map((f) => f.label)) : axis.map((m) => m)
    const totalValueHeaders = showBreakdown ? fields.map((f) => f.label) : ['Total']
    const header: ExportCell[] = [
      ...(showBreakdown ? leadingLabels.map(() => '') : leadingLabels),
      ...monthValueHeaders,
      ...totalValueHeaders,
    ]
    const headerGroups = showBreakdown
      ? [
          ...leadingLabels.map((label) => ({ label, colSpan: 1, rowSpan: 2 })),
          ...axis.map((m) => ({ label: monthLabel(m), colSpan: fields.length })),
          { label: 'Total', colSpan: fields.length },
        ]
      : undefined

    const dataRows: ExportCell[][] = rows.map((row) => {
      const assetDataValues = assetDataCols.map((c) => c.value(row))
      const monthValues = axis.flatMap((monthKey) => {
        const cell = resolveMonthCell(row.realTimeline, row.projectedByMonth, monthKey, row.netArs, row.vatArs, row.otherArs)
        if (!showBreakdown) return [cell?.totalArs ?? 0]
        return fields.map((f) => (cell ? (f.key === 'net' ? cell.netArs : f.key === 'vat' ? cell.vatArs : f.key === 'other' ? cell.otherArs : cell.totalArs) : 0))
      })
      const totalsAcc = { net: 0, vat: 0, other: 0, total: 0 }
      axis.forEach((monthKey) => {
        const cell = resolveMonthCell(row.realTimeline, row.projectedByMonth, monthKey, row.netArs, row.vatArs, row.otherArs)
        if (!cell) return
        totalsAcc.net += cell.netArs
        totalsAcc.vat += cell.vatArs
        totalsAcc.other += cell.otherArs
        totalsAcc.total += cell.totalArs
      })
      const totalValues = showBreakdown ? fields.map((f) => totalsAcc[f.key]) : [totalsAcc.total]
      return [row.name, ...assetDataValues, ...monthValues, ...totalValues]
    })

    const numericColumnIndexes: number[] = []
    assetDataCols.forEach((c, idx) => { if (c.numeric) numericColumnIndexes.push(1 + idx) })
    const monthsStartIndex = 1 + assetDataCols.length
    for (let i = 0; i < monthValueHeaders.length + totalValueHeaders.length; i++) numericColumnIndexes.push(monthsStartIndex + i)

    await downloadXLSX(
      [header, ...dataRows],
      `${filenamePrefix}-${horizonEndMonthKey}.xlsx`,
      { autoFilter: true, numericColumnIndexes, headerGroups },
    )
  }

  return {
    isError,
    currency, setCurrency,
    horizonYears, setHorizonYears,
    customEnd, setCustomEnd,
    breakdownFields, toggleBreakdownField,
    hideAssetPanel, setHideAssetPanel,
    exchangeRate,
    overridesVersion,
    rows,
    axis,
    lastRealMonthKey,
    horizonEndMonthKey,
    kpis,
    projectedDisplay,
    handleCommitField,
    handleResetRow,
    handleResetAll,
    handleExportExcel,
  }
}
