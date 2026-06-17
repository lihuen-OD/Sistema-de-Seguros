import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ShieldAlert, Clock, CheckCircle2, XCircle, FileSearch,
  ArrowUpRight, Pencil, ArrowLeft, Package, ShieldCheck,
  Calendar, DollarSign, AlertTriangle, ArrowLeftRight,
  PlusCircle, ArrowRight, MessageSquare, Paperclip, Edit2,
  TrendingDown, Percent,
} from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { formatCurrencyFull, formatCurrencyCompact, formatDate } from '../../shared/utils/format'
import { claimRepository } from '../../services/repositories/claim.repository'
import { mockAssets } from '../../data/mock-assets'
import { mockPolicies } from '../../data/mock-policies'
import { CLAIM_TYPE_LABELS, CLAIM_STATUS_LABELS } from '../../shared/constants'
import { ROUTES } from '../../app/routes'
import type { ClaimStatus, ClaimType, ClaimEvent, ClaimEventType } from '../../shared/types'

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ClaimStatus, string> = {
  denunciado:  'bg-blue-50 text-blue-700 border-blue-200',
  en_tramite:  'bg-amber-50 text-amber-700 border-amber-200',
  liquidado:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  rechazado:   'bg-red-50 text-red-700 border-red-200',
  cerrado:     'bg-slate-100 text-slate-600 border-slate-200',
}

const STATUS_ICONS: Record<ClaimStatus, React.ElementType> = {
  denunciado:  FileSearch,
  en_tramite:  Clock,
  liquidado:   CheckCircle2,
  rechazado:   XCircle,
  cerrado:     XCircle,
}

function StatusBadge({ status }: { status: ClaimStatus }) {
  const Icon = STATUS_ICONS[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${STATUS_STYLES[status]}`}>
      <Icon size={13} />
      {CLAIM_STATUS_LABELS[status]}
    </span>
  )
}

// ── Info row ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-800 font-medium">{value}</dd>
    </div>
  )
}

// ── Timeline event config ─────────────────────────────────────────────────────

type EventStyle = { dot: string; icon: string; labelCls: string; label: string }

const EVENT_CONFIG: Record<ClaimEventType, { Icon: React.ElementType } & EventStyle> = {
  siniestro_creado:      { Icon: PlusCircle,    dot: 'bg-blue-50',    icon: 'text-blue-500',    labelCls: 'text-blue-600',    label: 'Creado' },
  estado_cambiado:       { Icon: ArrowRight,    dot: 'bg-amber-50',   icon: 'text-amber-500',   labelCls: 'text-amber-600',   label: 'Estado' },
  monto_actualizado:     { Icon: DollarSign,    dot: 'bg-violet-50',  icon: 'text-violet-500',  labelCls: 'text-violet-600',  label: 'Monto' },
  liquidacion_registrada:{ Icon: CheckCircle2,  dot: 'bg-emerald-50', icon: 'text-emerald-500', labelCls: 'text-emerald-600', label: 'Liquidación' },
  franquicia_aplicada:   { Icon: Percent,       dot: 'bg-orange-50',  icon: 'text-orange-500',  labelCls: 'text-orange-600',  label: 'Franquicia' },
  nota_agregada:         { Icon: MessageSquare, dot: 'bg-slate-100',  icon: 'text-slate-500',   labelCls: 'text-slate-500',   label: 'Nota' },
  documento_adjunto:     { Icon: Paperclip,     dot: 'bg-sky-50',     icon: 'text-sky-500',     labelCls: 'text-sky-600',     label: 'Documento' },
  siniestro_editado:     { Icon: Edit2,         dot: 'bg-slate-100',  icon: 'text-slate-400',   labelCls: 'text-slate-400',   label: 'Editado' },
}

// ── Timeline event row ────────────────────────────────────────────────────────

function EventRow({ event, isLast }: { event: ClaimEvent; isLast: boolean }) {
  const cfg = EVENT_CONFIG[event.type]
  const Icon = cfg.Icon
  return (
    <div className="flex gap-4">
      {/* Dot + line */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border border-white ring-1 ring-slate-100 ${cfg.dot}`}>
          <Icon size={13} className={cfg.icon} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-slate-100 mt-1 mb-1" />}
      </div>

      {/* Content */}
      <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-5'} pt-0.5`}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.labelCls}`}>
              {cfg.label}
            </span>
            {event.previousStatus && event.newStatus && (
              <span className="text-[11px] text-slate-400">
                {CLAIM_STATUS_LABELS[event.previousStatus]} → {CLAIM_STATUS_LABELS[event.newStatus]}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 whitespace-nowrap tabular-nums flex-shrink-0">
            {formatDate(event.date)}
          </span>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{event.description}</p>
        {event.amountLabel && event.newAmount != null && (
          <p className="mt-1.5 text-xs font-semibold text-slate-600 tabular-nums">
            {event.amountLabel}: AR$ {event.newAmount.toLocaleString('es-AR')}
            {event.previousAmount != null && (
              <span className="font-normal text-slate-400">
                {' '}(antes: AR$ {event.previousAmount.toLocaleString('es-AR')})
              </span>
            )}
          </p>
        )}
        {event.author && (
          <p className="mt-1 text-[11px] text-slate-400">{event.author}</p>
        )}
      </div>
    </div>
  )
}

// ── Financial summary strip ───────────────────────────────────────────────────

interface FinStat {
  label: string
  value: string
  sub?: string
  highlight?: 'amber' | 'emerald' | 'red' | 'default'
}

function FinStatCell({ stat }: { stat: FinStat }) {
  const valueColor =
    stat.highlight === 'emerald' ? 'text-emerald-700'
    : stat.highlight === 'amber' ? 'text-amber-700'
    : stat.highlight === 'red' ? 'text-red-700'
    : 'text-slate-800'

  return (
    <div className="px-4 py-3 rounded-xl border border-slate-200 bg-white">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{stat.label}</p>
      <p className={`text-sm font-bold tabular-nums leading-snug ${valueColor}`}>{stat.value}</p>
      {stat.sub && <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{stat.sub}</p>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const EDITABLE_STATUSES: ClaimStatus[] = ['denunciado', 'en_tramite', 'liquidado', 'rechazado', 'cerrado']

export default function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const claim = claimRepository.findById(id ?? '')
  const [currentStatus, setCurrentStatus] = useState<ClaimStatus>(claim?.status ?? 'denunciado')
  const [editingStatus, setEditingStatus] = useState(false)

  if (!claim) {
    return (
      <PageContent>
        <ErrorState
          title="Siniestro no encontrado"
          description="El siniestro que buscás no existe o fue eliminado."
          action={
            <button
              onClick={() => navigate(ROUTES.CLAIMS)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              <ArrowLeft size={15} />
              Volver a siniestros
            </button>
          }
        />
      </PageContent>
    )
  }

  const asset = claim.assetId ? mockAssets.find((a) => a.id === claim.assetId) ?? null : null
  const policy = claim.policyId ? mockPolicies.find((p) => p.id === claim.policyId) ?? null : null
  const events = claimRepository.findEventsByClaim(claim.id)

  const isActive = currentStatus === 'denunciado' || currentStatus === 'en_tramite'
  const isLiquidado = currentStatus === 'liquidado'
  const isRechazado = currentStatus === 'rechazado'

  const recoveryRate =
    claim.claimedAmountArs > 0 && claim.settledAmountArs != null
      ? ((claim.settledAmountArs / claim.claimedAmountArs) * 100).toFixed(0)
      : null

  const tc = claim.exchangeRate ?? 0
  const currencyLabel = claim.currency === 'USD' ? 'US$' : 'AR$'
  const altLabel = claim.currency === 'USD' ? 'AR$' : 'US$'
  const toDisplayAlt = (arsAmount: number) =>
    tc > 0 && claim.currency === 'USD' ? arsAmount / tc : tc > 0 ? arsAmount / tc : null

  // Descubierto = real damage not covered by settlement
  const descubierto: number | null =
    claim.realAmountArs != null && claim.settledAmountArs != null
      ? claim.realAmountArs - claim.settledAmountArs
      : claim.realAmountArs != null
      ? claim.realAmountArs - claim.claimedAmountArs
      : null

  // Financial summary stats
  const finStats: FinStat[] = []
  if (claim.realAmountArs != null && claim.realAmountArs > 0) {
    finStats.push({
      label: 'Valor Real',
      value: formatCurrencyCompact(claim.realAmountArs, 'ARS'),
      sub: 'Daño efectivo',
      highlight: claim.realAmountArs > claim.claimedAmountArs ? 'amber' : 'default',
    })
  }
  finStats.push({
    label: 'Reclamado',
    value: formatCurrencyCompact(claim.claimedAmountArs, 'ARS'),
    sub: 'Ante la aseguradora',
  })
  finStats.push({
    label: 'Liquidado',
    value: claim.settledAmountArs != null ? formatCurrencyCompact(claim.settledAmountArs, 'ARS') : '—',
    sub: claim.settledAmountArs != null ? 'Aprobado' : 'Pendiente',
    highlight: claim.settledAmountArs != null ? 'emerald' : 'default',
  })
  if (claim.deductibleArs != null) {
    finStats.push({
      label: 'Franquicia',
      value: formatCurrencyCompact(claim.deductibleArs, 'ARS'),
      sub: 'A cargo del asegurado',
      highlight: 'amber',
    })
  }
  if (descubierto != null && descubierto > 0) {
    finStats.push({
      label: 'Descubierto',
      value: formatCurrencyCompact(descubierto, 'ARS'),
      sub: 'Sin cobertura',
      highlight: 'red',
    })
  }
  if (recoveryRate != null) {
    finStats.push({
      label: 'Recupero',
      value: `${recoveryRate}%`,
      sub: 'Liquidado / reclamado',
      highlight: Number(recoveryRate) >= 80 ? 'emerald' : 'amber',
    })
  }

  const handleStatusChange = (newStatus: ClaimStatus) => {
    claimRepository.update(claim.id, { status: newStatus })
    // Generate event
    claimRepository.addEvent({
      id: `evt-status-${Date.now()}`,
      claimId: claim.id,
      date: new Date().toISOString().split('T')[0],
      type: 'estado_cambiado',
      description: `Estado actualizado: "${CLAIM_STATUS_LABELS[currentStatus]}" → "${CLAIM_STATUS_LABELS[newStatus]}".`,
      previousStatus: currentStatus,
      newStatus,
      author: 'Lihuen Segovia',
    })
    setCurrentStatus(newStatus)
    setEditingStatus(false)
  }

  return (
    <PageContent>
      <PageHeader
        title={claim.claimNumber}
        subtitle={`${CLAIM_TYPE_LABELS[claim.claimType as ClaimType] ?? claim.claimType} · ${claim.insuranceCompany}`}
        category="Siniestro"
        backTo={ROUTES.CLAIMS}
        backLabel="Volver a siniestros"
        badge={<StatusBadge status={currentStatus} />}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(ROUTES.CLAIMS_EDIT(claim.id))}
              className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              <Pencil size={14} />
              Editar
            </button>

            {editingStatus ? (
              <div className="flex items-center gap-2">
                <select
                  value={currentStatus}
                  onChange={(e) => handleStatusChange(e.target.value as ClaimStatus)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  autoFocus
                >
                  {EDITABLE_STATUSES.map((s) => (
                    <option key={s} value={s}>{CLAIM_STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <button
                  onClick={() => setEditingStatus(false)}
                  className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingStatus(true)}
                className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
              >
                <ArrowLeftRight size={14} />
                Cambiar estado
              </button>
            )}
          </div>
        }
      />

      {/* Alert banners */}
      {isActive && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <Clock size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            Este siniestro está <strong>{CLAIM_STATUS_LABELS[currentStatus].toLowerCase()}</strong>. Realizá el
            seguimiento con la aseguradora hasta la resolución.
          </span>
        </div>
      )}
      {isRechazado && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            Este siniestro fue <strong>rechazado</strong> por la aseguradora. Revisá las observaciones para
            más detalle.
          </span>
        </div>
      )}

      {/* Financial summary strip */}
      {finStats.length > 0 && (
        <div
          className="grid gap-3 mb-5"
          style={{ gridTemplateColumns: `repeat(${Math.min(finStats.length, 6)}, minmax(0, 1fr))` }}
        >
          {finStats.map((stat) => (
            <FinStatCell key={stat.label} stat={stat} />
          ))}
        </div>
      )}

      {/* Layout: 3 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">

        {/* LEFT: ficha del siniestro */}
        <div className="lg:col-span-2 space-y-5">

          {/* Datos del siniestro */}
          <SectionCard title="Datos del Siniestro">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
              <InfoRow label="N° Siniestro" value={<span className="font-mono">{claim.claimNumber}</span>} />
              <InfoRow label="Tipo" value={CLAIM_TYPE_LABELS[claim.claimType as ClaimType] ?? claim.claimType} />
              <InfoRow label="Fecha del hecho" value={formatDate(claim.occurrenceDate)} />
              <InfoRow label="Fecha de denuncia" value={formatDate(claim.reportDate)} />
              <InfoRow label="Compañía aseguradora" value={claim.insuranceCompany} />
              <InfoRow label="Estado actual" value={<StatusBadge status={currentStatus} />} />
            </div>
            <div className="mt-5 pt-5 border-t border-slate-100">
              <dt className="text-xs text-slate-500 mb-2">Descripción del hecho</dt>
              <p className="text-sm text-slate-700 leading-relaxed">{claim.description}</p>
            </div>
            {claim.observations && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <dt className="text-xs text-slate-500 mb-2">Observaciones</dt>
                <p className="text-sm text-slate-600 leading-relaxed">{claim.observations}</p>
              </div>
            )}
          </SectionCard>

          {/* Activo y Póliza */}
          <SectionCard title="Activo y Póliza">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Activo */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Package size={13} className="text-blue-600" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activo</span>
                </div>
                {asset ? (
                  <div>
                    <p className="text-sm font-semibold text-slate-800 mb-0.5">{asset.name}</p>
                    <p className="text-xs text-slate-500 mb-1">
                      {asset.internalCode} · {asset.assetType}
                    </p>
                    {asset.valueHistory && asset.valueHistory.length > 0 && (
                      <p className="text-xs text-slate-400 mb-3">
                        Valor: US$ {asset.valueHistory[asset.valueHistory.length - 1].valueUsd.toLocaleString('es-AR')}
                      </p>
                    )}
                    <button
                      onClick={() => navigate(`/assets/${asset.id}`)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      Ver ficha del activo
                      <ArrowUpRight size={12} />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Sin activo asociado</p>
                )}
              </div>

              {/* Póliza */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <ShieldCheck size={13} className="text-emerald-600" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Póliza</span>
                </div>
                {policy ? (
                  <div>
                    <p className="text-sm font-mono font-semibold text-slate-800 mb-0.5">{policy.policyNumber}</p>
                    <p className="text-xs text-slate-500 mb-1">
                      {policy.insuranceType} · {policy.coverageType}
                    </p>
                    <p className="text-xs text-slate-400 mb-3">
                      {formatDate(policy.startDate)} — {formatDate(policy.endDate)}
                    </p>
                    <button
                      onClick={() => navigate(`/insurance/policies/${policy.id}`)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      Ver póliza
                      <ArrowUpRight size={12} />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Sin póliza asociada</p>
                )}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* RIGHT: KPIs */}
        <div className="flex flex-col gap-4">
          <KpiCard
            label="Monto Reclamado"
            value={formatCurrencyFull(claim.claimedAmountArs, 'ARS')}
            description={
              toDisplayAlt(claim.claimedAmountArs) != null
                ? `≈ ${altLabel} ${toDisplayAlt(claim.claimedAmountArs)!.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : 'Importe denunciado ante la aseguradora'
            }
            icon={ShieldAlert}
            variant="info"
          />
          {claim.realAmountArs != null && claim.realAmountArs > 0 && (
            <KpiCard
              label="Valor Real del Daño"
              value={formatCurrencyFull(claim.realAmountArs, 'ARS')}
              description={
                claim.realAmountArs > claim.claimedAmountArs
                  ? 'Supera el monto reclamado'
                  : 'Valuación del daño efectivo'
              }
              icon={AlertTriangle}
              variant={claim.realAmountArs > claim.claimedAmountArs ? 'warning' : 'default'}
            />
          )}
          <KpiCard
            label="Monto Liquidado"
            value={claim.settledAmountArs != null ? formatCurrencyFull(claim.settledAmountArs, 'ARS') : '—'}
            description={isLiquidado ? 'Indemnización aprobada' : 'Pendiente de resolución'}
            icon={CheckCircle2}
            variant={claim.settledAmountArs != null ? 'success' : 'default'}
          />
          <KpiCard
            label="Franquicia"
            value={claim.deductibleArs != null ? formatCurrencyFull(claim.deductibleArs, 'ARS') : '—'}
            description="Deducible a cargo del asegurado"
            icon={DollarSign}
            variant={claim.deductibleArs != null ? 'warning' : 'default'}
          />
          {descubierto != null && descubierto > 0 && (
            <KpiCard
              label="Descubierto"
              value={formatCurrencyFull(descubierto, 'ARS')}
              description="Daño real no cubierto por la aseguradora"
              icon={TrendingDown}
              variant="warning"
            />
          )}
          {tc > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
              <ArrowLeftRight size={13} className="text-slate-400 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tipo de cambio</p>
                <p className="text-sm font-bold text-slate-700 tabular-nums">
                  {currencyLabel} · TC ${tc.toLocaleString('es-AR')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <SectionCard
        title="Historial del Siniestro"
        actions={
          <span className="text-xs text-slate-400 font-medium">
            {events.length} {events.length === 1 ? 'evento' : 'eventos'}
          </span>
        }
      >
        {events.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-400">Sin eventos registrados aún.</p>
          </div>
        ) : (
          <div>
            {events.map((event, idx) => (
              <EventRow
                key={event.id}
                event={event}
                isLast={idx === events.length - 1}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </PageContent>
  )
}
