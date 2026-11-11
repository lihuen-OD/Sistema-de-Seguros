import { ArrowRightLeft, History } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { exchangeRateQueries } from '../../../shared/api/exchange-rate.api'
import { Modal } from '../../../shared/components/modals/Modal'
import { DataWarning } from '../../../shared/components/feedback/DataWarning'
import { formatCurrencyFull, formatDate } from '../../../shared/utils/format'
import {
  LEGACY_AMOUNT_FIELDS,
  legacyColumnsOf,
  currentRateIssue,
  usableCurrentRate,
  type LegacyAmountField,
} from '../../../shared/utils/renewalProjectionCalc'
import type { AssetRowData } from './RenewalProjectionTable'
import { RATE_ISSUE_MESSAGES, RATE_UPDATE_HINT } from './renewalProjectionMessages'

const FIELD_LABELS: Record<LegacyAmountField, string> = { net: 'Neto', vat: 'IVA', other: 'Otros impuestos' }

// Mismo redondeo que el backend (shared/utils/currency.ts#computeDualAmounts):
// la vista previa muestra exactamente el USD que se va a guardar.
function previewUsd(ars: number, rate: number): number {
  return +(ars / rate).toFixed(2)
}

interface RenewalLegacyOverridesModalProps {
  row: AssetRowData
  modeLabel: string
  isConverting: boolean
  onConfirm: (expectedRate: number, fields: LegacyAmountField[]) => void
  onClose: () => void
}

// Histórico protegido de una fila: importes ARS y % cargados antes de la base
// USD. Nada de esto se aplica a la proyección USD ni se borra; el usuario
// puede confirmar una conversión de los importes (TC actual DEL SISTEMA, una
// sola vez), que guarda los USD resultantes y deja los ARS originales
// intactos. Es independiente del TC manual de la pantalla, que solo sirve
// para ver la proyección en ARS y nunca se guarda. El TC del sistema se
// consulta recién al abrir este modal (no en la carga de la página).
export function RenewalLegacyOverridesModal({
  row,
  modeLabel,
  isConverting,
  onConfirm,
  onClose,
}: RenewalLegacyOverridesModalProps) {
  const { data: systemRateData, isLoading: isLoadingRate } = useQuery(exchangeRateQueries.current())
  const override = row.override
  if (!override) return null

  const currentRate = usableCurrentRate(systemRateData)
  const rateIssue = isLoadingRate ? null : currentRateIssue(systemRateData)
  const rateUpdatedAt = systemRateData?.updatedAt ?? null

  const legacyFields = LEGACY_AMOUNT_FIELDS.filter((f) => override[legacyColumnsOf(f).ars] != null)
  const pending = row.legacyPendingFields
  const converted = override.legacyConvertedAt != null
  const canConvert = pending.length > 0 && currentRate !== null && !isConverting

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={History}
      iconClassName="bg-amber-100 text-amber-700"
      title="Valores anteriores (histórico)"
      description={`${row.name} · ${modeLabel}`}
    >
      <p className="text-sm text-slate-600 mb-4">
        Estos valores se cargaron cuando la proyección se calculaba en pesos. Se conservan sin cambios y{' '}
        <strong>no se aplican</strong> a la proyección actual en USD, que usa el valor calculado desde los comprobantes
        (o el que cargues en USD).
      </p>

      {legacyFields.length > 0 && (
        <div className="table-container mb-4">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th className="text-left">Campo</th>
                <th className="text-right">Original (ARS)</th>
                <th className="text-right">Base USD vigente</th>
                <th className="text-right">{converted ? 'Conversión' : 'Si confirmás'}</th>
              </tr>
            </thead>
            <tbody>
              {legacyFields.map((field) => {
                const { ars, usd } = legacyColumnsOf(field)
                const arsValue = override[ars] as number
                const usdValue = override[usd]
                const willConvert = pending.includes(field)
                return (
                  <tr key={field}>
                    <td className="text-sm text-slate-700">{FIELD_LABELS[field]}</td>
                    <td className="text-right text-sm tabular-nums">{formatCurrencyFull(arsValue, 'ARS')}</td>
                    <td className="text-right text-sm tabular-nums">
                      {usdValue != null ? formatCurrencyFull(usdValue, 'USD') : <span className="text-slate-400">automático</span>}
                    </td>
                    <td className="text-right text-sm tabular-nums">
                      {converted ? (
                        <span className="text-slate-500">{usdValue != null ? 'Convertido' : '—'}</span>
                      ) : willConvert ? (
                        currentRate !== null ? (
                          <span className="text-brand-700 font-medium">{formatCurrencyFull(previewUsd(arsValue, currentRate), 'USD')}</span>
                        ) : (
                          <span className="text-amber-700">s/TC</span>
                        )
                      ) : (
                        <span className="text-slate-500" title="Ya tiene un valor en USD cargado — no se pisa">
                          Se conserva el USD cargado
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {override.growthPercentOverride != null && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span className="font-medium">% de renovación anterior:</span>{' '}
          <span className="tabular-nums">{override.growthPercentOverride} %</span>{' '}
          <span className="text-slate-500">
            (histórico, pensado para crecimiento en pesos — no se aplica ni se convierte). % vigente sobre la base USD:{' '}
            <span className="tabular-nums">{row.pct} %</span>.
          </span>
        </div>
      )}

      <p className="text-xs text-slate-400 mb-4">Última modificación de la fila: {formatDate(override.updatedAt)}</p>

      {converted ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Convertido el {formatDate(override.legacyConvertedAt)} con un tipo de cambio de{' '}
          <span className="tabular-nums font-medium">{formatCurrencyFull(override.legacyConvertedRate ?? 0, 'ARS')}</span> por USD
          {override.legacyConvertedBy ? ` (${override.legacyConvertedBy})` : ''}. Los importes ARS originales se conservan.
        </div>
      ) : pending.length > 0 ? (
        currentRate === null && !rateIssue ? (
          <p className="text-sm text-slate-500">Consultando el tipo de cambio actual del sistema…</p>
        ) : rateIssue ? (
          <DataWarning>
            {RATE_ISSUE_MESSAGES[rateIssue]} No se puede convertir sin una cotización real. {RATE_UPDATE_HINT}
          </DataWarning>
        ) : (
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
            Se van a convertir <strong>{pending.map((f) => FIELD_LABELS[f]).join(', ')}</strong> con el tipo de cambio actual del sistema de{' '}
            <span className="tabular-nums font-medium">{formatCurrencyFull(currentRate ?? 0, 'ARS')}</span> por USD
            {rateUpdatedAt ? ` (actualizado el ${formatDate(rateUpdatedAt)})` : ''}. Se registran el tipo de cambio, la fecha y tu
            usuario, y los importes ARS originales no se modifican. La conversión se hace una sola vez.
          </div>
        )
      ) : legacyFields.length > 0 ? (
        <p className="text-sm text-slate-500">Todos los importes anteriores ya tienen un valor en USD cargado — no hay nada para convertir.</p>
      ) : null}

      <div className="flex justify-end gap-2.5 pt-5 border-t border-slate-100 mt-5">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
        >
          Cerrar
        </button>
        {!converted && pending.length > 0 && (
          <button
            type="button"
            disabled={!canConvert}
            onClick={() => currentRate !== null && onConfirm(currentRate, pending)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRightLeft size={14} />
            {isConverting ? 'Convirtiendo…' : 'Confirmar conversión a USD'}
          </button>
        )}
      </div>
    </Modal>
  )
}
