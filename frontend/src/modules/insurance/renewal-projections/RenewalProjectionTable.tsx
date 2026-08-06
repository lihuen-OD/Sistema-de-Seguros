import { RotateCcw } from 'lucide-react'
import { formatCurrencyCompact, formatCurrencyInteger } from '../../../shared/utils/format'
import { resolveMonthCell, type RealMonthCell, type ProjectedMonthCell } from '../../../shared/utils/renewalProjectionCalc'
import type { RenewalOverrideField } from './useRenewalProjectionData'
import type { BreakdownFieldKey } from './RenewalFieldSelectorPopover'
import { BREAKDOWN_FIELD_DEFS } from './RenewalFieldSelectorPopover'

export interface AssetRowData {
  assetId: string
  name: string
  code: string
  realTimeline: Map<string, RealMonthCell>
  projectedByMonth: Map<string, ProjectedMonthCell>
  netArs: number
  vatArs: number
  otherArs: number
  pct: number
  cycleLengthMonths: number
  installmentsCount: number
  startMonthKey: string
  isOverridden: boolean
}

interface RenewalProjectionTableProps {
  rows: AssetRowData[]
  axis: string[]
  lastRealMonthKey: string
  currency: 'ARS' | 'USD'
  exchangeRate: number
  breakdownFields: BreakdownFieldKey[]
  hideAssetPanel: boolean
  /** Financiero reparte el total en cuotas — Económico es siempre un pago único por documento, así que ahí no tiene sentido editar la cantidad de cuotas. */
  showInstallmentsColumn: boolean
  /** Cambia cuando la query de overrides se refresca — fuerza remount de los inputs con el valor confirmado por el servidor. */
  overridesVersion: number
  onCommitField: (assetId: string, field: RenewalOverrideField, value: number | string) => void
  onResetRow: (assetId: string) => void
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

function toDisplay(arsValue: number, currency: 'ARS' | 'USD', exchangeRate: number): number {
  if (currency === 'ARS') return arsValue
  return exchangeRate > 0 ? arsValue / exchangeRate : 0
}

function toArs(displayValue: number, currency: 'ARS' | 'USD', exchangeRate: number): number {
  if (currency === 'ARS') return displayValue
  return displayValue * exchangeRate
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1)
    .toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
    .replace('.', '')
    .toUpperCase()
}

function cellFor(row: AssetRowData, monthKey: string) {
  return resolveMonthCell(row.realTimeline, row.projectedByMonth, monthKey, row.netArs, row.vatArs, row.otherArs)
}

function fieldValue(cell: NonNullable<ReturnType<typeof cellFor>>, key: BreakdownFieldKey): number {
  if (key === 'net') return cell.netArs
  if (key === 'vat') return cell.vatArs
  if (key === 'other') return cell.otherArs
  return cell.totalArs
}

function rowAxisTotals(row: AssetRowData, axis: string[]) {
  const totals = { paid: 0, pending: 0, projected: 0, recognized: 0, net: 0, vat: 0, other: 0, total: 0 }
  for (const monthKey of axis) {
    const cell = cellFor(row, monthKey)
    if (!cell) continue
    if (cell.status === 'paid') totals.paid += cell.totalArs
    else if (cell.status === 'pending') totals.pending += cell.totalArs
    else if (cell.status === 'recognized') totals.recognized += cell.totalArs
    else totals.projected += cell.totalArs
    totals.net += cell.netArs
    totals.vat += cell.vatArs
    totals.other += cell.otherArs
    totals.total += cell.totalArs
  }
  return totals
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

// Una sola clase de td para TODAS las columnas del panel fijo (input o
// solo-lectura por igual) — el padding vertical vive acá, no en cada input
// puntual, así todas las celdas de una fila quedan a la misma altura sin
// parches por columna.
const DOC_CELL_CLASS = 'sticky bg-white z-10 text-right align-middle py-1.5'
const INPUT_CLASS = 'w-full text-right text-xs border border-slate-200 rounded px-1.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400'

function AmountCell({ value, currency }: { value: number; currency: 'ARS' | 'USD' }) {
  return <span className="tabular-nums">{formatCurrencyCompact(value, currency)}</span>
}

export function RenewalProjectionTable({
  rows,
  axis,
  lastRealMonthKey,
  currency,
  exchangeRate,
  breakdownFields,
  hideAssetPanel,
  showInstallmentsColumn,
  overridesVersion,
  onCommitField,
  onResetRow,
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

  function commitInput(assetId: string, field: RenewalOverrideField, raw: string, min: number | null) {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || (min !== null && parsed < min)) return
    const isCurrencyField = field === 'net' || field === 'vat' || field === 'other'
    const value = isCurrencyField ? toArs(parsed, currency, exchangeRate) : parsed
    onCommitField(assetId, field, value)
  }

  function commitStartMonth(assetId: string, raw: string) {
    if (!/^\d{4}-\d{2}$/.test(raw)) return
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
          {rows.map((row) => {
            const isEmpty = row.realTimeline.size === 0 && !row.isOverridden
            const totals = rowAxisTotals(row, axis)
            const netDisplay = toDisplay(row.netArs, currency, exchangeRate)
            const vatDisplay = toDisplay(row.vatArs, currency, exchangeRate)
            const otherDisplay = toDisplay(row.otherArs, currency, exchangeRate)
            const totalDisplay = netDisplay + vatDisplay + otherDisplay
            const inputKey = `${row.assetId}-${currency}-${overridesVersion}`

            function stickyStyle(i: number) {
              return {
                left: stickyLefts[i],
                minWidth: visibleStickyCols[i].width,
                maxWidth: visibleStickyCols[i].width,
                ...(i === lastStickyIndex ? { boxShadow: '1px 0 0 0 #e2e8f0' } : {}),
              }
            }

            return (
              <tr key={row.assetId} className={isEmpty ? 'opacity-40' : ''}>
                <td className="sticky bg-white z-10 align-top" style={stickyStyle(0)}>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-800 block truncate" title={row.name}>{row.name}</span>
                    <span className="text-xs text-slate-400 block truncate" title={row.code}>{row.code}</span>
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
                        return (
                          <td key={col.key} className={DOC_CELL_CLASS} style={stickyStyle(i)}>
                            <input
                              key={`${inputKey}-net`}
                              type="number"
                              min={0}
                              defaultValue={Math.round(netDisplay)}
                              onBlur={(e) => commitInput(row.assetId, 'net', e.target.value, 0)}
                              className={INPUT_CLASS}
                            />
                          </td>
                        )
                      case 'vat':
                        return (
                          <td key={col.key} className={DOC_CELL_CLASS} style={stickyStyle(i)}>
                            <input
                              key={`${inputKey}-vat`}
                              type="number"
                              min={0}
                              defaultValue={Math.round(vatDisplay)}
                              onBlur={(e) => commitInput(row.assetId, 'vat', e.target.value, 0)}
                              className={INPUT_CLASS}
                            />
                          </td>
                        )
                      case 'other':
                        return (
                          <td key={col.key} className={DOC_CELL_CLASS} style={stickyStyle(i)}>
                            <input
                              key={`${inputKey}-other`}
                              type="number"
                              min={0}
                              defaultValue={Math.round(otherDisplay)}
                              onBlur={(e) => commitInput(row.assetId, 'other', e.target.value, 0)}
                              className={INPUT_CLASS}
                            />
                          </td>
                        )
                      case 'total':
                        return (
                          <td key={col.key} className={DOC_CELL_CLASS} style={stickyStyle(i)}>
                            <span className="text-xs font-bold text-slate-800 tabular-nums">{formatCurrencyInteger(totalDisplay, currency)}</span>
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
                                onBlur={(e) => commitInput(row.assetId, 'cycle', e.target.value, 1)}
                                className={`w-10 text-right text-xs border border-slate-200 rounded px-1 tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400`}
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
                              onBlur={(e) => commitInput(row.assetId, 'installments', e.target.value, 1)}
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
                              onChange={(e) => commitStartMonth(row.assetId, e.target.value)}
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
                                onBlur={(e) => commitInput(row.assetId, 'pct', e.target.value, -100)}
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
                              title="Volver al valor del comprobante"
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

                {axis.map((monthKey) => {
                  const cell = cellFor(row, monthKey)
                  const startsProj = monthKey > lastRealMonthKey
                  if (!showBreakdown) {
                    return (
                      <td key={monthKey} className={`text-right align-top p-0 ${startsProj ? 'border-l-2 border-dashed border-slate-300' : ''}`}>
                        {cell ? (
                          <div className="flex justify-end py-2 px-2.5">
                            <span className={`text-xs font-medium rounded px-1.5 py-0.5 tabular-nums ${STATUS_PILL_CLASSES[cell.status]}`}>
                              {formatCurrencyCompact(cell.totalArs, currency)}
                            </span>
                          </div>
                        ) : (
                          <span className="block text-center text-slate-300 text-xs py-2 px-2.5">—</span>
                        )}
                      </td>
                    )
                  }
                  return fields.map((f, fi) => (
                    <td
                      key={`${monthKey}-${f.key}`}
                      className={`text-right py-2 px-2.5 ${startsProj && fi === 0 ? 'border-l-2 border-dashed border-slate-300' : ''} ${
                        cell ? STATUS_CELL_BG_CLASSES[cell.status] : ''
                      }`}
                    >
                      {cell ? <AmountCell value={fieldValue(cell, f.key)} currency={currency} /> : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  ))
                })}

                {!showBreakdown ? (
                  <td className="text-right bg-slate-50/80 align-top p-0">
                    <div className="flex flex-col gap-px py-2 px-2.5">
                      {totals.paid > 0 && <span className="block text-xs font-semibold text-emerald-700 tabular-nums">{formatCurrencyCompact(totals.paid, currency)}</span>}
                      {totals.pending > 0 && <span className="block text-xs font-semibold text-red-600 tabular-nums">{formatCurrencyCompact(totals.pending, currency)}</span>}
                      {totals.recognized > 0 && <span className="block text-xs font-semibold text-sky-700 tabular-nums">{formatCurrencyCompact(totals.recognized, currency)}</span>}
                      {totals.projected > 0 && <span className="block text-xs font-semibold text-red-500 tabular-nums">{formatCurrencyCompact(totals.projected, currency)}</span>}
                      {totals.paid + totals.pending + totals.recognized + totals.projected === 0 && <span className="block text-xs text-slate-300">—</span>}
                    </div>
                  </td>
                ) : (
                  fields.map((f) => (
                    <td key={`rowtotal-${f.key}`} className="text-right bg-slate-50/80 py-2 px-2.5">
                      <AmountCell value={totals[f.key]} currency={currency} />
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
