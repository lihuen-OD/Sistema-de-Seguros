import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, ChevronUp, History, Undo2 } from 'lucide-react'
import { SectionCard } from '../../../../shared/components/cards/SectionCard'
import { LoadingState } from '../../../../shared/components/empty-states/LoadingState'
import { ErrorState } from '../../../../shared/components/empty-states/ErrorState'
import { policyQueries, type PolicyRenewalRecord, type RenewalPolicyRef } from '../../../../shared/api/policies.api'
import { formatDate } from '../../../../shared/utils/format'
import { RevokeRenewalModal } from './RevokeRenewalModal'

interface PolicyRenewalSectionProps {
  policyId: string
  // policies + policy_renewals: puede deshacer. El backend igual lo valida.
  canManage: boolean
}

// Historial de renovación de la póliza, como anterior ("Renovada por") y como
// nueva ("Renovación de"), con las reversiones — append-only, nada se borra.
export function PolicyRenewalSection({ policyId, canManage }: PolicyRenewalSectionProps) {
  const [showRevoked, setShowRevoked] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<PolicyRenewalRecord | null>(null)
  const { data: renewals = [], isLoading, isError, refetch } = useQuery(policyQueries.renewals(policyId))

  const active = renewals.filter((r) => r.status === 'ACTIVE')
  const renewedBy = active.find((r) => r.previousPolicy.id === policyId)
  const renewalOf = active.filter((r) => r.renewalPolicy.id === policyId)
  const revoked = renewals.filter((r) => r.status === 'REVOKED')

  return (
    <SectionCard title="Renovación" subtitle="Vínculo administrativo con la póliza anterior o la nueva">
      {isLoading ? (
        <LoadingState rows={2} />
      ) : isError ? (
        <ErrorState
          className="py-6"
          title="No se pudo cargar la renovación"
          action={
            <button
              type="button"
              onClick={() => refetch()}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Reintentar
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {renewedBy && (
            <RenewalEntry
              label="Renovada por"
              counterpart={renewedBy.renewalPolicy}
              renewal={renewedBy}
              onRevoke={canManage ? () => setRevokeTarget(renewedBy) : undefined}
            />
          )}
          {renewalOf.map((renewal) => (
            <RenewalEntry
              key={renewal.id}
              label="Renovación de"
              counterpart={renewal.previousPolicy}
              renewal={renewal}
              onRevoke={canManage ? () => setRevokeTarget(renewal) : undefined}
            />
          ))}
          {!renewedBy && renewalOf.length === 0 && (
            <p className="text-sm text-slate-500">Esta póliza no tiene una renovación registrada.</p>
          )}

          {revoked.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowRevoked((v) => !v)}
                className="flex w-full items-center justify-between text-left"
                aria-expanded={showRevoked}
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <History size={14} className="text-slate-400" />
                  Renovaciones deshechas
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{revoked.length}</span>
                </span>
                {showRevoked ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
              </button>
              {showRevoked && (
                <ul className="mt-3 space-y-2">
                  {revoked.map((renewal) => (
                    <li key={renewal.id} className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                      <p className="font-medium text-slate-700 break-words">
                        {renewal.previousPolicy.policyNumber} → {renewal.renewalPolicy.policyNumber}
                      </p>
                      <p className="mt-1 break-words">
                        Registrada el {formatDate(renewal.createdAt)} por {renewal.createdBy} · Deshecha el{' '}
                        {formatDate(renewal.revokedAt)} por {renewal.revokedBy ?? '—'}
                      </p>
                      {renewal.revokeReason && <p className="mt-1 break-words">Motivo: {renewal.revokeReason}</p>}
                      {renewal.notes && <p className="mt-1 break-words text-slate-500">Notas: {renewal.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {revokeTarget && <RevokeRenewalModal renewal={revokeTarget} onClose={() => setRevokeTarget(null)} />}
    </SectionCard>
  )
}

function RenewalEntry({
  label,
  counterpart,
  renewal,
  onRevoke,
}: {
  label: string
  counterpart: RenewalPolicyRef
  renewal: PolicyRenewalRecord
  onRevoke?: () => void
}) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <button
          type="button"
          onClick={() => navigate(`/insurance/policies/${counterpart.id}`)}
          className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700 break-all text-left transition-colors"
        >
          {counterpart.policyNumber}
          <ArrowUpRight size={12} className="flex-shrink-0 text-brand-400" />
        </button>
        <p className="text-xs text-slate-500">
          {counterpart.insuredName} · {formatDate(counterpart.startDate)} — {formatDate(counterpart.endDate)}
        </p>
        <p className="text-xs text-slate-500 break-words">
          Registrada el {formatDate(renewal.createdAt)} por {renewal.createdBy}
        </p>
        {renewal.notes && <p className="text-xs text-slate-600 break-words">Notas: {renewal.notes}</p>}
      </div>
      {onRevoke && (
        <button
          type="button"
          onClick={onRevoke}
          className="flex flex-shrink-0 items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Undo2 size={13} />
          Deshacer renovación
        </button>
      )}
    </div>
  )
}
