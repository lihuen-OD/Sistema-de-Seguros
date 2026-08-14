import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ImageOff, Pencil } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { AuditFinalDecisionCard } from '../../shared/components/audit-review/AuditFinalDecisionCard'
import { ChecklistReadOnlySummary } from '../../shared/components/audit-wizard/ChecklistReadOnlySummary'
import { ProposedChangeDecisionRow } from '../../shared/components/audit-wizard/ProposedChangeDecisionRow'
import { getChecklistFields } from '../../shared/components/audit-wizard/checklistConfig'
import { assetAuditsApi, assetAuditKeys, assetAuditQueries } from '../../shared/api/asset-audits.api'
import { fireExtinguisherKeys, fireExtinguisherQueries } from '../../shared/api/fire-extinguishers.api'
import { ROUTES } from '../../app/routes'
import { useCurrentUser } from '../../app/auth/AuthContext'

const CHECKLIST_FIELDS = getChecklistFields('ASSET')

export default function AssetAuditDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useCurrentUser()
  const canReview = user?.role === 'ADMIN' || (user?.modules.includes('asset_audits') ?? false)
  const canAudit = user?.role === 'ADMIN' || (user?.modules.includes('asset_audit_coverage') ?? false)

  useEffect(() => {
    if (user && !canReview && !canAudit) navigate(ROUTES.ASSET_AUDITS, { replace: true })
  }, [user, canReview, canAudit, navigate])

  const [decisions, setDecisions] = useState<Record<string, 'APPROVED' | 'REJECTED'>>({})
  const [auditDecision, setAuditDecision] = useState<'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION' | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const { data: audit, isLoading } = useQuery(assetAuditQueries.detail(id!))
  const { data: extinguisher } = useQuery(fireExtinguisherQueries.detail(audit?.fireExtinguisherId ?? ''))

  const reviewMutation = useMutation({
    mutationFn: () =>
      assetAuditsApi.review(id!, {
        decisions: Object.entries(decisions).map(([proposedChangeId, decision]) => ({ proposedChangeId, decision })),
        auditDecision: auditDecision!,
        reviewNotes: reviewNotes.trim() || undefined,
      }),
    onSuccess: () => {
      setShowConfirm(false)
      toast.success('Revisión guardada correctamente')
      queryClient.invalidateQueries({ queryKey: assetAuditKeys.all })
      if (audit) {
        queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.detail(audit.fireExtinguisherId) })
        queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.history(audit.fireExtinguisherId) })
        queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.all })
      }
    },
    onError: () => setShowConfirm(false),
  })

  if ((!canReview && !canAudit) || isLoading || !audit) {
    return (
      <PageContent>
        <p className="text-sm text-slate-400 py-10 text-center">Cargando auditoría…</p>
      </PageContent>
    )
  }

  const isReviewable = audit.status === 'SUBMITTED' && canReview
  const canEdit = audit.status === 'SUBMITTED' && (canReview || canAudit)
  const pendingChanges = audit.proposedChanges.filter((c) => c.status === 'PENDING')
  const allDecided = pendingChanges.every((c) => decisions[c.id] != null)
  const canSubmit = auditDecision !== null && (auditDecision !== 'APPROVED' || allDecided)
  const photos = audit.attachments.filter((a) => a.fileType === 'image')

  return (
    <PageContent>
      <PageHeader
        title={`Auditoría · ${extinguisher?.code ?? '…'}${extinguisher?.cylinderNumber ? ` · Cilindro ${extinguisher.cylinderNumber}` : ''}`}
        subtitle={`Período ${audit.auditPeriod} · Auditado por ${audit.auditedBy} el ${audit.auditDate}`}
        category="Auditoría de Rodados"
        backTo={ROUTES.ASSET_AUDITS}
        backLabel="Volver a auditorías"
        badge={<StatusPill status={audit.status} />}
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={() => navigate(ROUTES.ASSET_AUDITS_EDIT(audit.id))}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Pencil size={14} />
              Editar auditoría
            </button>
          ) : undefined
        }
      />

      <SectionCard title="Matafuego auditado" className="mb-5">
        {extinguisher ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Código</p>
              <p className="font-medium text-slate-800">{extinguisher.code}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Tipo</p>
              <p className="font-medium text-slate-800">{extinguisher.type}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Activo</p>
              <p className="font-medium text-slate-800">{extinguisher.asset?.name ?? '—'}</p>
              {extinguisher.asset?.assetType && <p className="text-xs text-slate-400">{extinguisher.asset.assetType}</p>}
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Ubicación actual</p>
              <p className="font-medium text-slate-800">{extinguisher.location ?? '—'}</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <button
                type="button"
                onClick={() => navigate(ROUTES.FIRE_EXTINGUISHERS_DETAIL(extinguisher.id))}
                className="text-sm text-brand-600 hover:underline"
              >
                Ver ficha del matafuego →
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Cargando datos del matafuego…</p>
        )}
      </SectionCard>

      <SectionCard
        title="Cambios propuestos"
        subtitle={
          audit.proposedChanges.length > 0
            ? `${pendingChanges.length} pendientes · ${audit.proposedChanges.length - pendingChanges.length} decididos`
            : undefined
        }
        className="mb-5"
      >
        {audit.proposedChanges.length === 0 ? (
          <EmptyState title="Sin cambios propuestos" description="La auditoría confirma todos los datos maestros." />
        ) : (
          <div className="space-y-3">
            {audit.proposedChanges.map((change) => (
              <ProposedChangeDecisionRow
                key={change.id}
                change={change}
                decision={decisions[change.id] ?? null}
                readOnly={!isReviewable || change.status !== 'PENDING'}
                onDecide={(decision) => setDecisions((prev) => ({ ...prev, [change.id]: decision }))}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Checklist de condición" className="mb-5">
        <ChecklistReadOnlySummary fields={CHECKLIST_FIELDS} checklist={audit.checklist as unknown as Record<string, string>} comments={audit.checklist.comments} />
      </SectionCard>

      <SectionCard title="Fotografías adjuntas" subtitle={`${photos.length} foto${photos.length === 1 ? '' : 's'}`} className="mb-5">
        {photos.length === 0 ? (
          <EmptyState icon={ImageOff} title="Sin fotos adjuntas" description="El auditor no subió fotografías." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {photos.map((photo) => (
              <a key={photo.id} href={photo.fileUrl} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-brand-300 transition-colors">
                <img src={photo.fileUrl} alt={photo.name} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </SectionCard>

      <AuditFinalDecisionCard
        isReviewable={isReviewable}
        status={audit.status}
        auditDecision={auditDecision}
        onAuditDecisionChange={setAuditDecision}
        pendingChangesWarning={
          auditDecision === 'APPROVED' && pendingChanges.length > 0 && !allDecided
            ? `Quedan ${pendingChanges.length - Object.keys(decisions).filter((id) => pendingChanges.some((c) => c.id === id)).length} cambio(s) propuesto(s) sin decidir.`
            : undefined
        }
        draftNotes={reviewNotes}
        onDraftNotesChange={setReviewNotes}
        canSubmit={canSubmit}
        onSubmitClick={() => setShowConfirm(true)}
        savedReviewNotes={audit.reviewNotes}
        reviewedBy={audit.reviewedBy}
        reviewedAt={audit.reviewedAt}
      />

      <ConfirmDialog
        open={showConfirm}
        title={
          auditDecision === 'APPROVED'
            ? '¿Confirmar aprobación de la auditoría?'
            : auditDecision === 'REJECTED'
              ? '¿Confirmar rechazo de la auditoría?'
              : '¿Solicitar corrección al auditor?'
        }
        description={
          auditDecision === 'APPROVED'
            ? `Se aplicarán al maestro los cambios aprobados y se descartarán los rechazados. Esta acción no se puede deshacer.`
            : 'No se aplicará ningún cambio al maestro. Esta acción no se puede deshacer.'
        }
        confirmLabel="Confirmar"
        danger={auditDecision === 'REJECTED'}
        onConfirm={() => reviewMutation.mutate()}
        onCancel={() => setShowConfirm(false)}
      />
    </PageContent>
  )
}
