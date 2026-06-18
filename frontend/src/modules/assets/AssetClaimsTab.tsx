import { useNavigate } from 'react-router-dom'
import {
  Plus, Clock, CheckCircle2, XCircle, FileSearch, ShieldAlert, ArrowUpRight,
} from 'lucide-react'
import type { ClaimStatus, ClaimType, Policy } from '../../shared/types'
import { claimRepository } from '../../services/repositories/claim.repository'
import { formatCurrencyFull, formatDate } from '../../shared/utils/format'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { CLAIM_TYPE_LABELS, CLAIM_STATUS_LABELS } from '../../shared/constants'
import { CLAIM_STATUS_STYLES, CLAIM_STATUS_ICONS } from '../../shared/constants/claim-status'

// ── Status pill ───────────────────────────────────────────────────────────────

function ClaimStatusPill({ status }: { status: ClaimStatus }) {
  const Icon = CLAIM_STATUS_ICONS[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${CLAIM_STATUS_STYLES[status]}`}>
      <Icon size={10} />
      {CLAIM_STATUS_LABELS[status]}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AssetClaimsTabProps {
  assetId: string
  policies: Policy[]
}

export function AssetClaimsTab({ assetId, policies: _policies }: AssetClaimsTabProps) {
  const navigate = useNavigate()
  const claims = claimRepository.findByAsset(assetId)

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">Siniestros</span>
          {claims.length > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
              {claims.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {claims.length > 0 && (
            <button
              onClick={() => navigate('/claims')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <ArrowUpRight size={14} />
              Ver módulo
            </button>
          )}
          <button
            onClick={() => navigate(`/claims/new?assetId=${assetId}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus size={14} />
            Registrar siniestro
          </button>
        </div>
      </div>

      {/* Content */}
      {claims.length === 0 ? (
        <EmptyState
          title="Sin siniestros registrados"
          description="Registrá los siniestros asociados a este activo para llevar un historial completo."
          icon={ShieldAlert}
          action={
            <button
              onClick={() => navigate(`/claims/new?assetId=${assetId}`)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus size={14} />
              Registrar primer siniestro
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">N° Siniestro</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tipo</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fecha hecho</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estado</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reclamado</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Liquidado</th>
                <th className="px-4 py-2.5 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {claims.map((claim) => (
                <tr
                  key={claim.id}
                  onClick={() => navigate(`/claims/${claim.id}`)}
                  className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-slate-600">{claim.claimNumber}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-800">
                      {CLAIM_TYPE_LABELS[claim.claimType as ClaimType] ?? claim.claimType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-600">{formatDate(claim.occurrenceDate)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <ClaimStatusPill status={claim.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-slate-800">
                      {formatCurrencyFull(claim.claimedAmountArs, 'ARS')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {claim.settledAmountArs != null ? (
                      <span className="text-sm font-semibold text-emerald-700">
                        {formatCurrencyFull(claim.settledAmountArs, 'ARS')}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowUpRight size={14} className="text-slate-400" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {claims.length > 0 && (
        <p className="text-xs text-slate-400 mt-3">
          Hacé clic en un siniestro para ver el detalle completo en el módulo de Siniestros
        </p>
      )}
    </div>
  )
}
