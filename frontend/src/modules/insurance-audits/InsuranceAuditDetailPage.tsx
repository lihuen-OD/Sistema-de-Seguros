import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ImageOff, Pencil, Package, CheckCircle2, XCircle } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { ChoiceGroup } from '../../shared/components/forms/ChoiceGroup'
import { FormField, FormTextarea } from '../../shared/components/forms/FormSection'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { insuranceAuditsApi, insuranceAuditKeys, insuranceAuditQueries } from '../../shared/api/insurance-audits.api'
import { ROUTES } from '../../app/routes'
import { useCurrentUser } from '../../app/auth/AuthContext'

const CHECKLIST_LABELS: Record<string, string> = {
  policyActiveConfirmed: 'Póliza vigente',
  insuranceCardPresent: 'Tarjeta/certificado a bordo',
  dataMatchesInsuredAsset: 'Datos coinciden con lo asegurado',
  physicalConditionOk: 'Sin daños no declarados',
}

const AUDIT_DECISION_OPTIONS = [
  { value: 'APPROVED', label: 'Aprobar auditoría' },
  { value: 'REJECTED', label: 'Rechazar' },
  { value: 'NEEDS_CORRECTION', label: 'Solicitar corrección' },
]

export default function InsuranceAuditDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useCurrentUser()
  const canReview = user?.role === 'ADMIN' || (user?.modules.includes('insurance_audits') ?? false)
  const canAudit = user?.role === 'ADMIN' || (user?.modules.includes('insurance_audit_coverage') ?? false)

  useEffect(() => {
    if (user && !canReview && !canAudit) navigate(ROUTES.INSURANCE_AUDITS, { replace: true })
  }, [user, canReview, canAudit, navigate])

  const [auditDecision, setAuditDecision] = useState<'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION' | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const { data: audit, isLoading } = useQuery(insuranceAuditQueries.detail(id!))
  const asset = audit?.asset ?? null

  const reviewMutation = useMutation({
    mutationFn: () => insuranceAuditsApi.review(id!, { auditDecision: auditDecision!, reviewNotes: reviewNotes.trim() || undefined }),
    onSuccess: () => {
      setShowConfirm(false)
      toast.success('Revisión guardada correctamente')
      queryClient.invalidateQueries({ queryKey: insuranceAuditKeys.all })
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
  const photos = audit.attachments.filter((a) => a.fileType === 'image')

  return (
    <PageContent>
      <PageHeader
        title={`Auditoría de Seguros · ${asset?.name ?? '…'}`}
        subtitle={`Período ${audit.auditPeriod} · Auditado por ${audit.auditedBy} el ${audit.auditDate}`}
        category="Auditoría de Seguros"
        backTo={ROUTES.INSURANCE_AUDITS}
        backLabel="Volver a auditorías"
        badge={<StatusPill status={audit.status} />}
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={() => navigate(ROUTES.INSURANCE_AUDITS_EDIT(audit.id))}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Pencil size={14} />
              Editar auditoría
            </button>
          ) : undefined
        }
      />

      <SectionCard title="Activo auditado" className="mb-5">
        {asset ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
              <Package size={18} className="text-brand-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{asset.name}</p>
              <p className="text-xs text-slate-500">{asset.assetType} · {asset.code ?? '—'}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate(ROUTES.ASSETS_DETAIL(asset.id))}
              className="ml-auto text-sm text-brand-600 hover:underline whitespace-nowrap"
            >
              Ver ficha del activo →
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Cargando datos del activo…</p>
        )}
      </SectionCard>

      <SectionCard title="Checklist de seguro" className="mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
          {Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
            const ok = (audit.checklist as unknown as Record<string, boolean>)[key]
            return (
              <div key={key} className="flex items-center gap-2">
                {ok ? <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" /> : <XCircle size={15} className="text-red-500 flex-shrink-0" />}
                <span className="text-slate-700">{label}</span>
              </div>
            )
          })}
        </div>
        {audit.checklist.odometerOrHoursObserved && (
          <div className="mb-3">
            <p className="text-xs text-slate-500 mb-0.5">Kilometraje / horas observado</p>
            <p className="text-sm font-medium text-slate-800">{audit.checklist.odometerOrHoursObserved}</p>
          </div>
        )}
        {audit.checklist.comments && (
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Comentarios</p>
            <p className="text-sm text-slate-700">{audit.checklist.comments}</p>
          </div>
        )}
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

      <SectionCard title="Decisión final">
        {isReviewable ? (
          <div className="space-y-4">
            <FormField label="Decisión" required>
              <ChoiceGroup options={AUDIT_DECISION_OPTIONS} value={auditDecision ?? ''} onChange={(v) => setAuditDecision(v as typeof auditDecision)} />
            </FormField>
            <FormField label="Notas de revisión (opcional)">
              <FormTextarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={3} placeholder="Comentarios para el auditor…" />
            </FormField>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={auditDecision === null}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Guardar revisión
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <StatusPill status={audit.status} />
            {audit.reviewNotes && (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Notas:</span> {audit.reviewNotes}
              </p>
            )}
            {audit.reviewedBy && (
              <p className="text-xs text-slate-500">
                Revisado por {audit.reviewedBy}
                {audit.reviewedAt ? ` el ${new Date(audit.reviewedAt).toLocaleString('es-AR')}` : ''}
              </p>
            )}
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={showConfirm}
        title={
          auditDecision === 'APPROVED'
            ? '¿Confirmar aprobación de la auditoría?'
            : auditDecision === 'REJECTED'
              ? '¿Confirmar rechazo de la auditoría?'
              : '¿Solicitar corrección al auditor?'
        }
        description="Esta acción no se puede deshacer."
        confirmLabel="Confirmar"
        danger={auditDecision === 'REJECTED'}
        onConfirm={() => reviewMutation.mutate()}
        onCancel={() => setShowConfirm(false)}
      />
    </PageContent>
  )
}
