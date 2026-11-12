import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { assetQueries } from '../../../shared/api/assets.api'
import { policyQueries } from '../../../shared/api/policies.api'
import { documentQueries } from '../../../shared/api/documents.api'
import { exchangeRateQueries } from '../../../shared/api/exchange-rate.api'
import { renewalProjectionsApi, renewalProjectionQueries, renewalProjectionKeys } from '../../../shared/api/renewal-projections.api'
import type { RenewalProjectionMode, RenewalProjectionOverrideInput } from '../../../shared/api/renewal-projections.api'
import {
  buildDisplayMatrix,
  sumDisplayCells,
  sumRowTotals,
  todayMonthKey,
  addMonthsToKey,
  buildMonthRange,
  isReasonableMonthKey,
} from '../../../shared/utils/renewalProjectionCalc'
import {
  buildProjectionAssetInputs,
  buildRenewalProjectionRows,
  relevantProjectionAssets,
} from '../../../shared/utils/renewalProjectionRows'
import type { LegacyAmountField } from '../../../shared/utils/renewalProjectionCalc'
import type { AssetRowData } from './RenewalProjectionTable'
import type { BreakdownFieldKey } from './RenewalFieldSelectorPopover'
import { buildRenewalProjectionExport } from './renewalProjectionExport'
import { downloadXLSX } from '../../../shared/utils/export'
import { PROJECTION_CURRENCY } from './renewalProjectionFormat'
import { buildRenewalObservations } from './renewalObservations'

// Financiero calcula lo real por cuota (dueDate), Económico por documento
// (issueDate): el par de funciones correcto según `mode` lo elige
// shared/utils/renewalProjectionRows (fuente única, también la usa
// Presupuestos), que nunca mezcla datos ni overrides entre los dos modos.

export type RenewalOverrideField = 'net' | 'vat' | 'other' | 'pct' | 'cycle' | 'installments' | 'start'

// Solo columnas VIGENTES: Neto/IVA/Otros se guardan en USD (la base) y el %
// en su propia columna USD — nunca en las columnas históricas en ARS.
const OVERRIDE_KEY_BY_FIELD: Record<RenewalOverrideField, keyof RenewalProjectionOverrideInput> = {
  net: 'netOverrideUsd',
  vat: 'vatOverrideUsd',
  other: 'otherOverrideUsd',
  pct: 'growthPercentUsdOverride',
  cycle: 'cycleLengthMonthsOverride',
  installments: 'installmentsCountOverride',
  start: 'startMonthOverride',
}

export function useRenewalProjectionData(mode: RenewalProjectionMode) {
  const queryClient = useQueryClient()

  const [horizonYears, setHorizonYears] = useState<1 | 2 | 3>(2)
  const [customEnd, setCustomEnd] = useState<string | null>(null)
  const [breakdownFields, setBreakdownFields] = useState<BreakdownFieldKey[]>([])
  const [hideAssetPanel, setHideAssetPanel] = useState(false)

  // ─── Datos remotos ───────────────────────────────────────────────────────────
  // Sin filtro de fecha — la proyección necesita el historial completo de cada
  // activo, no un rango elegido, para poder detectar su ciclo real de renovación.
  const { data: financialResult, isError: isErrorDocs } = useQuery(documentQueries.financialWithMeta())
  const financialDocs = useMemo(() => financialResult?.data ?? [], [financialResult])
  const { data: allPolicies = [], isError: isErrorPolicies } = useQuery(policyQueries.list({ includeCoverages: true }))
  const { data: allAssets = [], isError: isErrorAssets } = useQuery(assetQueries.list())
  const { data: overrides = [], isError: isErrorOverrides, dataUpdatedAt: overridesVersion } = useQuery(renewalProjectionQueries.overrides(mode))
  const isError = isErrorDocs || isErrorPolicies || isErrorAssets || isErrorOverrides

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

  const convertLegacyMutation = useMutation({
    mutationFn: ({ assetId, expectedRate, fields }: { assetId: string; expectedRate: number; fields: LegacyAmountField[] }) =>
      renewalProjectionsApi.convertLegacy(assetId, mode, { expectedRate, fields }),
    onSuccess: () => toast.success('Valores anteriores convertidos a USD — los importes ARS originales se conservan'),
    // Un 409 (TC cambió / vista previa vieja) trae un mensaje apto para el
    // usuario: se muestra tal cual y se refrescan TC y overrides para que la
    // nueva vista previa refleje el estado real.
    onError: (err: Error) => toast.error(err.message || 'No se pudo convertir'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: renewalProjectionKeys.all(mode) })
      queryClient.invalidateQueries({ queryKey: exchangeRateQueries.current().queryKey })
    },
  })

  // ─── Activos relevantes (los que alguna vez tuvieron una línea de cobertura) ─

  const relevantAssets = useMemo(() => relevantProjectionAssets(allAssets, allPolicies), [allAssets, allPolicies])

  const overridesByAssetId = useMemo(() => new Map(overrides.map((o) => [o.assetId, o])), [overrides])

  // ─── Línea de tiempo real + ciclo por activo ─────────────────────────────────

  const perAssetData = useMemo(
    () => buildProjectionAssetInputs(mode, relevantAssets, financialDocs, allPolicies),
    [relevantAssets, financialDocs, allPolicies, mode],
  )

  const today = todayMonthKey()
  const { firstRealMonthKey, lastRealMonthKey, filteredAbsurdDates } = useMemo(() => {
    let first: string | null = null
    let last: string | null = null
    let filtered = 0
    for (const { realTimeline } of perAssetData) {
      for (const monthKey of realTimeline.keys()) {
        if (!isReasonableMonthKey(monthKey)) {
          filtered++
          continue
        }
        if (!first || monthKey < first) first = monthKey
        if (!last || monthKey > last) last = monthKey
      }
    }
    return { firstRealMonthKey: first ?? today, lastRealMonthKey: last ?? today, filteredAbsurdDates: filtered }
  }, [perAssetData, today])

  // maxMonthKey: el mes más lejano permitido para proyectar (hoy + 10 años).
  const maxMonthKey = useMemo(() => addMonthsToKey(today, 120), [today])

  // Si customEnd viene fuera de rango, ignorarlo y usar el preset. El
  // horizonte se mide desde HOY ("proyectado a N años"), no desde el último
  // dato real de toda la tabla: un vencimiento anómalo muy a futuro de un
  // activo no debe estirar ni correr la proyección de los demás. El eje
  // igual llega hasta el último mes real, para no ocultar datos reales.
  const safeCustomEnd = customEnd && customEnd > today && customEnd <= maxMonthKey ? customEnd : null
  const horizonEndMonthKey = safeCustomEnd ?? addMonthsToKey(today, horizonYears * 12)
  const axisEnd = lastRealMonthKey > horizonEndMonthKey ? lastRealMonthKey : horizonEndMonthKey
  const axis = useMemo(() => buildMonthRange(firstRealMonthKey, axisEnd), [firstRealMonthKey, axisEnd])

  // ─── Filas (base USD efectiva + proyección USD) ─────────────────────────────

  const rows: AssetRowData[] = useMemo(
    () => buildRenewalProjectionRows(perAssetData, overridesByAssetId, today, horizonEndMonthKey),
    [perAssetData, overridesByAssetId, today, horizonEndMonthKey],
  )

  // ─── Matriz de presentación (única fuente de tabla, KPIs y Excel) ──────────
  // Siempre en USD: lo real con su cierre USD histórico (sin cierre confiable
  // queda en su moneda original, excluido y marcado) y lo proyectado sobre la
  // base USD. Sin TC manual: nada se convierte a ARS en estas pantallas.

  const matrix = useMemo(() => buildDisplayMatrix(rows, axis, PROJECTION_CURRENCY, null), [rows, axis])
  const rowTotals = useMemo(() => matrix.map((cells) => sumRowTotals(cells)), [matrix])

  // ─── KPIs + avisos ───────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const withHistory = rows.filter((r) => r.realTimeline.size > 0).length
    return {
      // Solo la parte proyectada de cada celda (un mes mixto aporta solo lo proyectado).
      projected: sumDisplayCells(matrix.flat(), 'projected'),
      withHistory,
      withoutHistory: rows.length - withHistory,
    }
  }, [matrix, rows])

  const observations = useMemo(
    () => buildRenewalObservations({ rows, matrix, axis, filteredAbsurdDates }),
    [rows, matrix, axis, filteredAbsurdDates],
  )

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

  function handleConvertLegacy(assetId: string, expectedRate: number, fields: LegacyAmountField[], onDone?: () => void) {
    convertLegacyMutation.mutate({ assetId, expectedRate, fields }, { onSuccess: () => onDone?.() })
  }

  function toggleBreakdownField(key: BreakdownFieldKey) {
    setBreakdownFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  async function handleExportExcel(filenamePrefix: string) {
    const xlsx = buildRenewalProjectionExport({
      rows, matrix, rowTotals, axis, breakdownFields, hideAssetPanel, horizonEndMonthKey, filenamePrefix,
    })
    await downloadXLSX(xlsx.rows, xlsx.filename, xlsx.options)
  }

  return {
    isError,
    financialDocsResult: financialResult,
    horizonYears, setHorizonYears,
    customEnd: safeCustomEnd, setCustomEnd,
    breakdownFields, toggleBreakdownField,
    hideAssetPanel, setHideAssetPanel,
    overridesVersion,
    rows,
    matrix,
    rowTotals,
    axis,
    lastRealMonthKey,
    // Mes actual: frontera visual de la zona proyectada y mínimo del horizonte personalizado.
    currentMonthKey: today,
    maxMonthKey,
    horizonEndMonthKey,
    kpis,
    observations,
    isConvertingLegacy: convertLegacyMutation.isPending,
    handleCommitField,
    handleResetRow,
    handleResetAll,
    handleConvertLegacy,
    handleExportExcel,
  }
}
