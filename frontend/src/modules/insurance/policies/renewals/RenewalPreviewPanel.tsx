import clsx from 'clsx'
import { AlertTriangle, ArrowRight, CalendarRange, CheckCircle2, OctagonAlert } from 'lucide-react'
import { Badge } from '../../../../shared/components/badges/Badge'
import { formatCurrencyFull, formatDate } from '../../../../shared/utils/format'
import type {
  PolicyRenewalPreview,
  RenewalAssetRef,
  RenewalLineDifference,
  RenewalLineSummary,
  RenewalNotice,
  RenewalPolicySummary,
} from '../../../../shared/api/policies.api'

const DIFFERENCE_LABELS: Record<RenewalLineDifference, string> = {
  insuranceType: 'Tipo de seguro',
  coverages: 'Coberturas',
  currency: 'Moneda',
  insuredAmount: 'Suma asegurada',
}

// Se muestran en la línea de continuidad de fechas, no en la lista.
const DATE_WARNING_CODES = new Set(['DATES_OVERLAP', 'COVERAGE_GAP'])

const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`

// Vista previa de una renovación: solo presenta lo que calculó el backend
// (policy-renewals.service.ts#preview) — no recalcula diferencias acá.
export function RenewalPreviewPanel({ preview }: { preview: PolicyRenewalPreview }) {
  const { previousPolicy, renewalPolicy, blockers, warnings, comparison } = preview
  const hasWarning = (code: string) => warnings.some((w) => w.code === code)
  const listedWarnings = warnings.filter((w) => !DATE_WARNING_CODES.has(w.code))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 items-stretch">
        <PolicyCard label="Póliza anterior" policy={previousPolicy} />
        <div className="hidden sm:flex items-center justify-center text-slate-300" aria-hidden>
          <ArrowRight size={18} />
        </div>
        <PolicyCard
          label="Póliza nueva"
          policy={renewalPolicy}
          insurerChanged={hasWarning('INSURER_CHANGED')}
          producerChanged={hasWarning('PRODUCER_CHANGED')}
        />
      </div>

      <DateContinuity overlapDays={comparison.overlapDays} gapDays={comparison.gapDays} />

      {blockers.length > 0 && (
        <NoticeList
          tone="danger"
          title="No se puede registrar la renovación"
          items={blockers}
        />
      )}
      {listedWarnings.length > 0 && (
        <NoticeList
          tone="warning"
          title="Diferencias a revisar"
          subtitle="Son informativas: no impiden registrar la renovación."
          items={listedWarnings}
        />
      )}

      <AssetGroup title="Vehículos y activos que continúan" count={comparison.continuingAssets.length}>
        {comparison.continuingAssets.map(({ asset, previous, renewal, differences }) => (
          <li key={asset.id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <AssetLabel asset={asset} />
              <div className="flex flex-wrap gap-1">
                {differences.length === 0 ? (
                  <Badge variant="success">Sin cambios</Badge>
                ) : (
                  differences.map((d) => <Badge key={d} variant="warning">{DIFFERENCE_LABELS[d]}</Badge>)
                )}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <LineCell label="Póliza anterior" line={previous} />
              <LineCell label="Póliza nueva" line={renewal} changed={differences} />
            </div>
          </li>
        ))}
      </AssetGroup>

      <AssetGroup title="No continúan en la póliza nueva" count={comparison.removedAssets.length} tone="warning">
        {comparison.removedAssets.map(({ asset, previous }) => (
          <li key={asset.id} className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <AssetLabel asset={asset} />
            <LineCell label="Póliza anterior" line={previous} className="sm:w-1/2" />
          </li>
        ))}
      </AssetGroup>

      <AssetGroup title="Nuevos en la póliza nueva" count={comparison.addedAssets.length}>
        {comparison.addedAssets.map(({ asset, renewal }) => (
          <li key={asset.id} className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <AssetLabel asset={asset} />
            <LineCell label="Póliza nueva" line={renewal} className="sm:w-1/2" />
          </li>
        ))}
      </AssetGroup>
    </div>
  )
}

function PolicyCard({
  label,
  policy,
  insurerChanged = false,
  producerChanged = false,
}: {
  label: string
  policy: RenewalPolicySummary
  insurerChanged?: boolean
  producerChanged?: boolean
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 break-words">{policy.policyNumber}</p>
      <dl className="mt-2 space-y-1.5 text-xs">
        <PolicyField term="Aseguradora" value={policy.insuredName} changed={insurerChanged} />
        <PolicyField term="Productor" value={policy.producer?.name ?? 'Sin productor'} changed={producerChanged} />
        <PolicyField term="Vigencia" value={`${formatDate(policy.startDate)} — ${formatDate(policy.endDate)}`} />
      </dl>
    </div>
  )
}

function PolicyField({ term, value, changed = false }: { term: string; value: string; changed?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="text-slate-400">{term}</dt>
      <dd className={clsx('min-w-0 break-words font-medium', changed ? 'text-amber-700' : 'text-slate-700')}>
        {value}
        {changed && <span className="ml-1.5 font-normal text-amber-600">(cambia)</span>}
      </dd>
    </div>
  )
}

function DateContinuity({ overlapDays, gapDays }: { overlapDays: number; gapDays: number }) {
  const continuous = overlapDays === 0 && gapDays === 0
  const parts = [
    overlapDays > 0 && `Las vigencias se superponen ${plural(overlapDays, 'día', 'días')}.`,
    gapDays > 0 && `Quedan ${plural(gapDays, 'día', 'días')} sin cobertura entre ambas pólizas.`,
  ].filter(Boolean)
  return (
    <div
      className={clsx(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs',
        continuous ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800',
      )}
    >
      <CalendarRange size={15} className="mt-px flex-shrink-0" />
      <p>
        <span className="font-semibold">Fechas: </span>
        {continuous ? 'la póliza nueva empieza a continuación de la anterior, sin superposición ni días sin cobertura.' : parts.join(' ')}
      </p>
    </div>
  )
}

function NoticeList({
  tone,
  title,
  subtitle,
  items,
}: {
  tone: 'danger' | 'warning'
  title: string
  subtitle?: string
  items: RenewalNotice[]
}) {
  const Icon = tone === 'danger' ? OctagonAlert : AlertTriangle
  return (
    <div
      className={clsx(
        'rounded-lg border px-4 py-3',
        tone === 'danger' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800',
      )}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      <div className="flex items-center gap-2">
        <Icon size={15} className="flex-shrink-0" />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {subtitle && <p className="mt-0.5 pl-[23px] text-xs opacity-80">{subtitle}</p>}
      <ul className="mt-2 space-y-1 pl-[23px] text-xs list-disc list-outside">
        {items.map((item) => (
          <li key={item.code} className="ml-3">{item.message}</li>
        ))}
      </ul>
    </div>
  )
}

function AssetGroup({
  title,
  count,
  tone = 'default',
  children,
}: {
  title: string
  count: number
  tone?: 'default' | 'warning'
  children: React.ReactNode
}) {
  return (
    <section>
      <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
        {title}
        <Badge variant={count > 0 && tone === 'warning' ? 'warning' : 'default'}>{count}</Badge>
      </h4>
      {count === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <CheckCircle2 size={13} className="text-slate-300" />
          Ninguno
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{children}</ul>
      )}
    </section>
  )
}

function AssetLabel({ asset }: { asset: RenewalAssetRef }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-slate-800 break-words">{asset.name}</p>
      {asset.code && <p className="text-xs text-slate-400">{asset.code}</p>}
    </div>
  )
}

function LineCell({
  label,
  line,
  changed = [],
  className,
}: {
  label: string
  line: RenewalLineSummary
  changed?: RenewalLineDifference[]
  className?: string
}) {
  const mark = (difference: RenewalLineDifference) => (changed.includes(difference) ? 'font-semibold text-amber-700' : 'text-slate-700')
  const amountChanged = changed.includes('currency') || changed.includes('insuredAmount')
  return (
    <div className={clsx('min-w-0 rounded-lg bg-slate-50 px-3 py-2 text-xs', className)}>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={clsx('mt-0.5 break-words', mark('insuranceType'))}>{line.insuranceType.name}</p>
      <p className={clsx('break-words', mark('coverages'))}>
        {line.coverages.length > 0 ? line.coverages.map((c) => c.name).join(', ') : 'Sin coberturas detalladas'}
      </p>
      <p className={clsx('mt-0.5 tabular-nums', amountChanged ? 'font-semibold text-amber-700' : 'font-medium text-slate-800')}>
        {formatCurrencyFull(line.insuredAmount, line.currency)}
      </p>
    </div>
  )
}
