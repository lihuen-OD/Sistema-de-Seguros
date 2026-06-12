import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ShieldAlert, Clock, CheckCircle2, XCircle, FileSearch,
  ArrowUpRight, Pencil, ArrowLeft, Package, ShieldCheck,
  Calendar, DollarSign, AlertTriangle,
} from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { formatCurrencyFull, formatDate } from '../../shared/utils/format'
import { claimRepository } from '../../services/repositories/claim.repository'
import { mockAssets } from '../../data/mock-assets'
import { mockPolicies } from '../../data/mock-policies'
import { CLAIM_TYPE_LABELS, CLAIM_STATUS_LABELS } from '../../shared/constants'
import type { ClaimStatus, ClaimType } from '../../shared/types'

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
              onClick={() => navigate('/claims')}
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

  const isActive = currentStatus === 'denunciado' || currentStatus === 'en_tramite'
  const isLiquidado = currentStatus === 'liquidado'
  const isRechazado = currentStatus === 'rechazado'

  const recoveryRate =
    claim.claimedAmountArs > 0 && claim.settledAmountArs != null
      ? ((claim.settledAmountArs / claim.claimedAmountArs) * 100).toFixed(0)
      : null

  const handleStatusChange = (newStatus: ClaimStatus) => {
    claimRepository.update(claim.id, { status: newStatus })
    setCurrentStatus(newStatus)
    setEditingStatus(false)
  }

  return (
    <PageContent>
      <PageHeader
        title={claim.claimNumber}
        subtitle={`${CLAIM_TYPE_LABELS[claim.claimType as ClaimType] ?? claim.claimType} · ${claim.insuranceCompany}`}
        category="Siniestro"
        backTo="/claims"
        backLabel="Volver a siniestros"
        badge={<StatusBadge status={currentStatus} />}
        actions={
          <div className="flex items-center gap-2">
            {/* Estado rápido */}
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
                <Pencil size={14} />
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
                    <p className="text-xs text-slate-500 mb-3">
                      {asset.internalCode} · {asset.assetType}
                    </p>
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
            description="Importe denunciado ante la aseguradora"
            icon={ShieldAlert}
            variant="info"
          />
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
          {recoveryRate != null && (
            <KpiCard
              label="Tasa de Recupero"
              value={`${recoveryRate}%`}
              description="Liquidado vs. reclamado"
              icon={Calendar}
              variant={Number(recoveryRate) >= 80 ? 'success' : 'warning'}
            />
          )}
        </div>
      </div>
    </PageContent>
  )
}
