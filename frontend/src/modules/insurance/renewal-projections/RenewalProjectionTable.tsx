import { AlertTriangle, History, RotateCcw } from 'lucide-react'
import { formatCurrencyCompact, formatCurrencyFull, formatCurrencyInteger } from '../../../shared/utils/format'
import {
  baseTotalUsd,
  hasExcludedNative,
  usdIn,
  type DisplayCell,
  type DisplayTotals,
  type LegacyAmountField,
  type NativeAmounts,
  type RenewalBaseStatus,
  type RowProjectionInputs,
} from '../../../shared/utils/renewalProjectionCalc'
import type { RenewalProjectionOverride } from '../../../shared/api/renewal-projections.api'
import type { Currency } from '../../../shared/types'
import type { RenewalOverrideField } from './useRenewalProjectionData'
import type { BreakdownFieldKey } from './RenewalFieldSelectorPopover'
import { BREAKDOWN_FIELD_DEFS } from './RenewalFieldSelectorPopover'
import { monthLabel, formatNativeAmounts, formatNativeAmountsCompact } from './renewalProjectionFormat'

export interface AssetRowData extends RowProjectionInputs {
  assetId: string
  name: string
  code: string
  /** % por ciclo sobre la base USD (default 0 %). */
  pct: number
  cycleLengthMonths: number
  installmentsCount: number
  startMonthKey: string
  baseStatus: RenewalBaseStatus
  /** Sin base USD confiable (y sin Neto USD manual): la fila no se proyecta. */
  projectionBlocked: boolean
  /** Tiene configuración vigente que "Volver al automático" puede limpiar. */
  isOverridden: boolean
  /** Tiene importes ARS / % anteriores (o su trazabilidad) — histórico protegido. */
  hasLegacy: boolean
  /** Importes ARS anteriores pendientes de una conversión confirmada. */
  legacyPendingFields: LegacyAmountField[]
  override: RenewalProjectionOverride | null
}

interface RenewalProjectionTableProps {
  rows: AssetRowData[]
  /** matrix[fila][mes] — misma fuente que KPIs y Excel. */
  matrix: (DisplayCell | null)[][]
  rowTotals: DisplayTotals[]
  axis: string[]
  lastRealMonthKey: string
  currency: Currency
  /** TC manual de la pantalla (null = lo futuro en ARS se muestra «Sin TC»). */
  projectionRate: number | null
  breakdownFields: BreakdownFieldKey[]
  hideAssetPanel: boolean
  /** Financiero reparte el total en cuotas — Económico es siempre un pago único por documento, así que ahí no tiene sentido editar la cantidad de cuotas. */
  showInstallmentsColumn: boolean
  /** Cambia cuando la query de overrides se refresca — fuerza remount de los inputs con el valor confirmado por el servidor. */
  overridesVersion: number
  onCommitField: (assetId: string, field: RenewalOverrideField, value: number | string) => void
  onResetRow: (assetId: string) => void
  onOpenLegacy: (assetId: string) => void
}

const ASSET_COL = { key: 'asset', label: 'Activo', width: 220 } as const

// Ancho pensado para que ningún input/label se recorte: "Ciclo (m)"/"% renov."
// son los títulos más largos del panel, e "Inicio" necesita lo que ocupa un
// <input type="month"> nativo sin achicarse.
function docColumns(showInstallmentsColumn: boolean) {
  return [
    { key: 'net', label: 'Neto', width: 104 },
    { key: 'vat', label: 'IVA', width: 104 },
    { key: 'other', label: 'Otros imp.', width: 104 },
    { key: 'total', label: 'Total', width: 104 },
    { key: 'cycle', label: 'Ciclo (m)', width: 80 },
    ...(showInstallmentsColumn ? [{ key: 'installments', label: 'Cuotas', width: 70 }] : []),
    { key: 'start', label: 'Inicio', width: 118 },
    { key: 'pct', label: '% renov.', width: 80 },
    { key: 'reset', label: '', width: 36 },
  ] as const
}

function fieldValue(cell: DisplayCell, key: BreakdownFieldKey): number | null {
  if (!cell.amounts) return null
  if (key === 'net') return cell.amounts.net
  if (key === 'vat') return cell.amounts.vat
  if (key === 'other') return cell.amounts.other
  return cell.amounts.total
}

// Las columnas del panel miden 104px: hasta ~13 caracteres ("AR$ 3.000.000")
// el importe entero entra; más largo (ej. "AR$ 150.000.000" en la vista ARS)
// se muestra compacto ("AR$ 150M") y el valor completo queda en el tooltip.
const PANEL_AMOUNT_MAX_CHARS = 13
function panelAmount(value: number, currency: Currency): string {
  const integer = formatCurrencyInteger(value, currency)
  return integer.length <= PANEL_AMOUNT_MAX_CHARS ? integer : formatCurrencyCompact(value, currency)
}

const NO_RATE_TITLE = 'Sin TC — ingresá un tipo de cambio (ARS por USD) para ver los importes futuros en ARS'

function incompleteTitle(excluded: NativeAmounts, hasProjectedWithoutRate: boolean): string {
  const parts = ['Incompleto']
  if (hasExcludedNative(excluded)) parts.push(`excluye ${formatNativeAmounts(excluded)} sin tipo de cambio histórico confiable`)
  if (hasProjectedWithoutRate) parts.push('incluye meses proyectados en ARS sin TC')
  return parts.join(' — ')
}

const STATUS_PILL_CLASSES: Record<string, string> = {
  paid: 'text-emerald-700 bg-emerald-50',
  pending: 'text-red-600 bg-red-50',
  recognized: 'text-sky-700 bg-sky-50',
  projected: 'text-red-600 bg-red-50/70 border border-dashed border-red-200',
}

const STATUS_CELL_BG_CLASSES: Record<string, string> = {
  paid: 'bg-emerald-50/60',
  pending: 'bg-red-50/60',
  recognized: 'bg-sky-50/60',
  projected: 'bg-red-50/30',
}

const UNCONVERTIBLE_PILL_CLASS = 'text-amber-800 bg-amber-50 border border-amber-200'

// Una sola clase de td para TODAS las columnas del panel fijo (input o
// solo-lectura por igual) — el padding vertical vive acá, no en cada input
// puntual, así todas las celdas de una fila quedan a la misma altura sin
// parches por columna.
const DOC_CELL_CLASS = 'sticky bg-white z-10 text-right align-middle py-1.5'
const INPUT_CLASS = 'w-full text-right text-xs border border-slate-200 rounded px-1.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400'
const INPUT_WARNING_CLASS = 'w-full text-right text-xs border border-amber-300 bg-amber-50/50 rounded px-1.5 tabular-nums placeholder:text-amber-600/70 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400'

function IncompleteMark({ title }: { title: string }) {
  return (
    <span className="text-amber-600 font-bold" title={title} aria-label={title}>
      *
    </span>
  )
}

/** Celda sin importe expresable en la moneda elegida: lo real se ve en su moneda nativa, lo proyectado en ARS sin TC manual como «Sin TC». */
function UnconvertibleCellContent({ cell }: { cell: DisplayCell }) {
  if (cell.isReal) {
    const title = `Sin tipo de cambio histórico confiable — se muestra en su moneda original (${formatNativeAmounts(cell.excludedNative)}) y no se suma a los totales`
    return (
      <span className={`text-xs font-medium rounded px-1.5 py-0.5 tabular-nums ${UNCONVERTIBLE_PILL_CLASS}`} title={title}>
        {formatNativeAmountsCompact(cell.excludedNative)} · sin TC
      </span>
    )
  }
  return (
    <span className={`text-xs font-medium rounded px-1.5 py-0.5 border-dashed ${UNCONVERTIBLE_PILL_CLASS}`} title={NO_RATE_TITLE}>
      Sin TC
    </span>
  )
}

export function RenewalProjectionTable({
  rows,
  matrix,
  rowTotals,
  axis,
  lastRealMonthKey,
  currency,
  projectionRate,
  breakdownFields,
  hideAssetPanel,
  showInstallmentsColumn,
  overridesVersion,
  onCommitField,
  onResetRow,
  onOpenLegacy,
}: RenewalProjectionTableProps) {
  const showBreakdown = breakdownFields.length > 0
  const fields = BREAKDOWN_FIELD_DEFS.filter((f) => breakdownFields.includes(f.key))
  const visibleStickyCols = hideAssetPanel ? [ASSET_COL] : [ASSET_COL, ...docColumns(showInstallmentsColumn)]
  const stickyLefts: number[] = []
  let cumulativeLeft = 0
  for (const col of visibleStickyCols) {
    stickyLefts.push(cumulativeLeft)
    cumulativeLeft += col.width
  }
  const lastStickyIndex = visibleStickyCols.length - 1
  // La base se guarda en USD: Neto/IVA/Otros solo se editan en la vista USD,
  // así ninguna escritura depende de un tipo de cambio.
  const canEditAmounts = currency === 'USD'

  // Solo guarda si el valor realmente cambió respecto de lo mostrado — un
  // foco + blur sin tocar nada no crea ni pisa ningún override.
  function commitInput(assetId: string, field: RenewalOverrideField, raw: string, shown: number | null, min: number | null) {
    if (raw.trim() === '') return
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || (min !== null && parsed < min)) return
    if (shown !== null && parsed === shown) return
    onCommitField(assetId, field, parsed)
  }

  function commitStartMonth(assetId: string, raw: string, shown: string) {
    if (!/^\d{4}-\d{2}$/.test(raw) || raw === shown) return
    onCommitField(assetId, 'start', raw)
  }

  return (
    <div className="table-container">
      <table className="enterprise-table">
        <thead>
          <tr>
            {visibleStickyCols.map((col, i) => (
              <th
                key={col.key}
                rowSpan={showBreakdown ? 2 : 1}
                className={`sticky bg-slate-50 z-10 whitespace-nowrap ${col.key === 'asset' ? 'text-left' : 'text-right'}`}
                style={{
                  left: stickyLefts[i],
                  minWidth: col.width,
                  maxWidth: col.width,
                  ...(i === lastStickyIndex ? { boxShadow: '1px 0 0 0 #e2e8f0' } : {}),
                }}
                title={col.key === 'net' || col.key === 'vat' || col.key === 'other' ? 'Base de la renovación proyectada — se guarda y se edita en USD' : undefined}
              >
                {col.label}
              </th>
            ))}
            {axis.map((monthKey) => (
              <th
                key={monthKey}
                colSpan={showBreakdown ? fields.length : 1}
                className={`text-center whitespace-nowrap ${monthKey > lastRealMonthKey ? 'border-l-2 border-dashed border-slate-300' : ''}`}
              >
                {monthLabel(monthKey)}
              </th>
            ))}
            <th colSpan={showBreakdown ? fields.length : 1} className="text-right bg-slate-100/70 font-semibold whitespace-nowrap">
              Total
            </th>
          </tr>
          {showBreakdown && (
            <tr>
              {axis.map((monthKey) =>
                fields.map((f, fi) => (
                  <th
                    key={`${monthKey}-${f.key}`}
                    className={`text-right text-[10px] whitespace-nowrap ${monthKey > lastRealMonthKey && fi === 0 ? 'border-l-2 border-dashed border-slate-300' : ''}`}
                  >
                    {f.label}
                  </th>
                )),
              )}
              {fields.map((f) => (
                <th key={`total-${f.key}`} className="text-right text-[10px] bg-slate-100/70 whitespace-nowrap">
                  {f.label}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const cells = matrix[rowIndex] ?? []
            const totals = rowTotals[rowIndex]
            const isEmpty = row.realTimeline.size === 0 && !row.isOverridden && !row.hasLegacy
            const netShown = usdIn(row.netUsd, currency, projectionRate)
            const vatShown = usdIn(row.vatUsd, currency, projectionRate)
            const otherShown = usdIn(row.otherUsd, currency, projectionRate)
            const totalShown = usdIn(baseTotalUsd(row), currency, projectionRate)
            const inputKey = `${row.assetId}-${currency}-${overridesVersion}`
            const hasProjectedWithoutRate = cells.some((c) => c && !c.isReal && !c.amounts)
            const totalsIncompleteTitle = totals ? incompleteTitle(totals.excludedNative, hasProjectedWithoutRate) : ''
            const legacyPct = row.override?.growthPercentOverride ?? null

            function stickyStyle(i: number) {
              return {
                left: stickyLefts[i],
                minWidth: visibleStickyCols[i].width,
                maxWidth: visibleStickyCols[i].width,
                ...(i === lastStickyIndex ? { boxShadow: '1px 0 0 0 #e2e8f0' } : {}),
              }
            }

            function amountCell(field: 'net' | 'vat' | 'other', i: number, shown: number | null) {
              if (canEditAmounts) {
                const rounded = shown === null ? null : Math.round(shown)
                return (
                  <td key={field} className={DOC_CELL_CLASS} style={stickyStyle(i)}>
                    <input
                      key={`${inputKey}-${field}`}
                      type="number"
                      min={0}
                      defaultValue={rounded ?? ''}
                      placeholder={row.projectionBlocked && field === 'net' ? 'USD' : rounded === null ? '0' : undefined}
                      title={
                        row.projectionBlocked && field === 'net'
                          ? 'La última renovación no tiene tipo de cambio histórico confiable — cargá el Neto en USD para habilitar la proyección'
                          : 'Base USD de la renovación proyectada'
                      }
                      onBlur={(e) => commitInput(row.assetId, field, e.target.value, rounded, 0)}
                      className={row.projectionBlocked ? INPUT_WARNING_CLASS : INPUT_CLASS}
                    />
                  </td>
                )
              }
              return (
                <td key={field} className={DOC_CELL_CLASS} style={stickyStyle(i)}>
                  <span
                    className={`text-xs tabular-nums ${shown === null ? 'text-amber-700' : 'text-slate-700'}`}
                    title={
                      shown === null
                        ? row.netUsd === null ? 'Sin base USD confiable' : NO_RATE_TITLE
                        : `${formatCurrencyFull(shown, currency)} — la base se edita en USD: cambiá la moneda a USD para modificarla`
                    }
                  >
                    {shown === null ? (row.netUsd === null ? '—' : 'Sin TC') : panelAmount(shown, currency)}
                  </span>
                </td>
              )
            }

            return (
              <tr key={row.assetId} className={isEmpty ? 'opacity-40' : ''}>
                <td className="sticky bg-white z-10 align-top" style={stickyStyle(0)}>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-800 block truncate" title={row.name}>{row.name}</span>
                    <span className="text-xs text-slate-400 block truncate" title={row.code}>{row.code}</span>
                    {(row.projectionBlocked || row.hasLegacy) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {row.projectionBlocked && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold rounded px-1.5 py-0.5 text-amber-800 bg-amber-50 border border-amber-200"
                            title="La última renovación está en una moneda sin tipo de cambio histórico confiable — no se proyecta hasta que se cargue el Neto en USD"
                          >
                            <AlertTriangle size={10} />
                            Sin TC confiable
                          </span>
                        )}
                        {row.hasLegacy && (
                          <button
                            type="button"
                            onClick={() => onOpenLegacy(row.assetId)}
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded px-1.5 py-0.5 border transition-colors ${
                              row.legacyPendingFields.length > 0
                                ? 'text-amber-800 bg-amber-50 border-amber-200 hover:bg-amber-100'
                                : 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="Valores editados antes de la base USD (en ARS y % anterior) — se conservan como histórico y no se aplican"
                          >
                            <History size={10} />
                            {row.legacyPendingFields.length > 0 ? 'ARS anterior · revisar' : 'Valores anteriores'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </td>

                {!hideAssetPanel &&
                  docColumns(showInstallmentsColumn).map((col, colIdx) => {
                    const i = colIdx + 1 // offset por la columna Activo
                    if (isEmpty && col.key !== 'reset') {
                      return (
                        <td key={col.key} className={DOC_CELL_CLASS} style={stickyStyle(i)}>
                          <span className="text-slate-300 text-xs">—</span>
                        </td>
                      )
                    }
                    switch (col.key) {
                      case 'net':
                        return amountCell('net', i, netShown)
                      case 'vat':
                        return amountCell('vat', i, vatShown)
                      case 'other':
                        return amountCell('other', i, otherShown)
                      case 'total':
                        return (
                          <td key={col.key} className={DOC_CELL_CLASS} style={stickyStyle(i)}>
                            {totalShown === null ? (
                              <span className="text-xs font-bold text-amber-700" title={row.netUsd === null ? 'Sin base USD confiable' : NO_RATE_TITLE}>
                                {row.netUsd === null ? '—' : 'Sin TC'}
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-slate-800 tabular-nums" title={formatCurrencyFull(totalShown, currency)}>
                                {panelAmount(totalShown, currency)}
                              </span>
                            )}
                          </td>
                        )
                      case 'cycle':
                        return (
                          <td key={col.key} className={DOC_CELL_CLASS} style={stickyStyle(i)}>
                            <span className="inline-flex items-center gap-0.5">
                              <input
                                key={`${inputKey}-cycle`}
                                type="number"
                                min={1}
                                title="Cada cuántos meses renueva — editable solo acá, nunca toca la póliza real"
                                defaultValue={row.cycleLengthMonths}
                                onBlur={(e) => commitInput(row.assetId, 'cycle', e.target.value, row.cycleLengthMonths, 1)}
                                className="w-10 text-right text-xs border border-slate-200 rounded px-1 tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                              />
                              <span className="text-[10px] text-slate-400">m</span>
                            </span>
                          </td>
                        )
                      case 'installments':
                        return (
                          <td key={col.key} className={DOC_CELL_CLASS} style={stickyStyle(i)}>
                            <input
                              key={`${inputKey}-installments`}
                              type="number"
                              min={1}
                              title="Cuántas cuotas iguales componen cada renovación proyectada"
                              defaultValue={row.installmentsCount}
                              onBlur={(e) => commitInput(row.assetId, 'installments', e.target.value, row.installmentsCount, 1)}
                              className={INPUT_CLASS}
                            />
                          </td>
                        )
                      case 'start':
                        return (
                          <td key={col.key} className={DOC_CELL_CLASS} style={stickyStyle(i)}>
                            <input
                              key={`${inputKey}-start`}
                              type="month"
                              title="En qué mes arranca la renovación proyectada — editable solo acá, nunca toca la póliza real"
                              defaultValue={row.startMonthKey}
                              onChange={(e) => commitStartMonth(row.assetId, e.target.value, row.startMonthKey)}
                              className="w-full text-xs border border-slate-200 rounded px-1.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                            />
                          </td>
                        )
                      case 'pct':
                        return (
                          <td key={col.key} className={DOC_CELL_CLASS} style={stickyStyle(i)}>
                            <span className="inline-flex items-center gap-0.5">
                              <input
                                key={`${inputKey}-pct`}
                                type="number"
                                defaultValue={row.pct}
                                title={
                                  legacyPct !== null
                                    ? `% por renovación sobre la base USD. Anterior (histórico, pensado en pesos — no se aplica): ${legacyPct} %`
                                    : '% por renovación sobre la base USD — 0 % repite la misma base en cada ciclo'
                                }
                                onBlur={(e) => commitInput(row.assetId, 'pct', e.target.value, row.pct, -100)}
                                className="w-11 text-right text-xs border border-slate-200 rounded px-1 tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                              />
                              <span className="text-[10px] text-slate-400">%</span>
                            </span>
                          </td>
                        )
                      case 'reset':
                        return (
                          <td key={col.key} className="sticky bg-white z-10 text-center align-middle py-1.5" style={stickyStyle(i)}>
                            <button
                              type="button"
                              disabled={!row.isOverridden}
                              onClick={() => onResetRow(row.assetId)}
                              title="Volver al valor del comprobante (los valores anteriores en ARS se conservan)"
                              className="p-1 rounded text-slate-300 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 disabled:cursor-default transition-colors"
                            >
                              <RotateCcw size={13} />
                            </button>
                          </td>
                        )
                      default:
                        return null
                    }
                  })}

                {axis.map((monthKey, monthIndex) => {
                  const cell = cells[monthIndex] ?? null
                  const startsProj = monthKey > lastRealMonthKey
                  if (!showBreakdown) {
                    return (
                      <td key={monthKey} className={`text-right align-top p-0 ${startsProj ? 'border-l-2 border-dashed border-slate-300' : ''}`}>
                        {cell ? (
                          <div className="flex justify-end items-center gap-0.5 py-2 px-2.5 whitespace-nowrap">
                            {cell.amounts ? (
                              <>
                                <span className={`text-xs font-medium rounded px-1.5 py-0.5 tabular-nums ${STATUS_PILL_CLASSES[cell.status]}`}>
                                  {formatCurrencyCompact(cell.amounts.total, currency)}
                                </span>
                                {cell.incomplete && <IncompleteMark title={incompleteTitle(cell.excludedNative, false)} />}
                              </>
                            ) : (
                              <UnconvertibleCellContent cell={cell} />
                            )}
                          </div>
                        ) : (
                          <span className="block text-center text-slate-300 text-xs py-2 px-2.5">—</span>
                        )}
                      </td>
                    )
                  }
                  return fields.map((f, fi) => {
                    const value = cell ? fieldValue(cell, f.key) : null
                    return (
                      <td
                        key={`${monthKey}-${f.key}`}
                        className={`text-right py-2 px-2.5 whitespace-nowrap ${startsProj && fi === 0 ? 'border-l-2 border-dashed border-slate-300' : ''} ${
                          cell ? (cell.amounts ? STATUS_CELL_BG_CLASSES[cell.status] : 'bg-amber-50/60') : ''
                        }`}
                      >
                        {!cell ? (
                          <span className="text-slate-300 text-xs">—</span>
                        ) : value === null ? (
                          fi === 0 ? <UnconvertibleCellContent cell={cell} /> : <span className="text-amber-600 text-xs">—</span>
                        ) : (
                          <span className="tabular-nums">
                            {formatCurrencyCompact(value, currency)}
                            {cell.incomplete && <IncompleteMark title={incompleteTitle(cell.excludedNative, false)} />}
                          </span>
                        )}
                      </td>
                    )
                  })
                })}

                {!showBreakdown ? (
                  <td className="text-right bg-slate-50/80 align-top p-0">
                    <div className="flex flex-col gap-px py-2 px-2.5">
                      {totals && totals.paid > 0 && <span className="block text-xs font-semibold text-emerald-700 tabular-nums">{formatCurrencyCompact(totals.paid, currency)}</span>}
                      {totals && totals.pending > 0 && <span className="block text-xs font-semibold text-red-600 tabular-nums">{formatCurrencyCompact(totals.pending, currency)}</span>}
                      {totals && totals.recognized > 0 && <span className="block text-xs font-semibold text-sky-700 tabular-nums">{formatCurrencyCompact(totals.recognized, currency)}</span>}
                      {totals && totals.projected > 0 && <span className="block text-xs font-semibold text-red-500 tabular-nums">{formatCurrencyCompact(totals.projected, currency)}</span>}
                      {totals?.incomplete && (
                        <span className="block text-[10px] font-semibold text-amber-700 whitespace-nowrap" title={totalsIncompleteTitle}>
                          Incompleto*
                        </span>
                      )}
                      {totals && totals.paid + totals.pending + totals.recognized + totals.projected === 0 && !totals.incomplete && (
                        <span className="block text-xs text-slate-300">—</span>
                      )}
                    </div>
                  </td>
                ) : (
                  fields.map((f) => (
                    <td key={`rowtotal-${f.key}`} className="text-right bg-slate-50/80 py-2 px-2.5 whitespace-nowrap">
                      <span className="tabular-nums">{formatCurrencyCompact(totals ? totals[f.key] : 0, currency)}</span>
                      {totals?.incomplete && <IncompleteMark title={totalsIncompleteTitle} />}
                    </td>
                  ))
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
