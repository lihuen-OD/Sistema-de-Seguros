import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import { FormField, FormTextarea } from '../../../shared/components/forms/FormSection'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { fireExtinguisherAuditsApi, fireExtinguisherAuditQueries } from '../../../shared/api/fire-extinguisher-audits.api'
import { useCurrentUser } from '../../../app/auth/AuthContext'
import { ROUTES } from '../../../app/routes'
import { formatDate } from '../../../shared/utils/format'
import { CREATION_REQUEST_STATUS_LABELS, hasRequiredRejectionReason, invalidateCreationRequestReviewQueries } from '../../../shared/utils/fireExtinguisherCreationRequests'

export default function FireExtinguisherCreationRequestDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const { user } = useCurrentUser()
  const canReview = user?.role === 'ADMIN' || (user?.modules.includes('fire_extinguisher_audits') ?? false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const { data, isLoading, isError } = useQuery(fireExtinguisherAuditQueries.creationRequest(id))

  const review = useMutation({
    mutationFn: (input: { decision: 'APPROVE' } | { decision: 'REJECT'; reason: string }) =>
      fireExtinguisherAuditsApi.reviewCreationRequest(id, input),
    onSuccess: async (_result, input) => {
      await invalidateCreationRequestReviewQueries(queryClient, id, input.decision)
      toast.success('Solicitud actualizada')
      setApproveOpen(false)
      setRejectOpen(false)
    },
  })

  if (isLoading) return <PageContent><div className="py-16 text-center text-sm text-slate-500">Cargando solicitud…</div></PageContent>
  if (isError || !data) return <PageContent><ErrorState /></PageContent>

  const fields = [
    ['Número de cilindro', data.cylinderNumber], ['Marca', data.brand || '—'],
    ['Certificado IRAM', data.iramCertificateNumber || '—'], ['Año de fabricación', String(data.manufacturingYear)],
    ['Tipo', data.type], ['Capacidad', data.capacity], ['Establecimiento', data.establishment],
    ['Tipo de ubicación', data.associatedLocationType], ['Detalle de ubicación', data.location || '—'],
    ['Activo asociado', data.associatedAsset
      ? `${data.associatedAsset.code ?? ''} ${data.associatedAsset.name}`.trim()
      : data.associatedAssetName
        ? `${data.associatedAssetCode ?? ''} ${data.associatedAssetName} (${data.associatedAssetType ?? 'tipo no informado'})`.trim()
        : '—'],
    ['Fecha de carga', data.chargeDate ? formatDate(data.chargeDate) : '—'],
    ['Vencimiento', data.expirationDate ? formatDate(data.expirationDate) : '—'],
    ['Vencimiento hidráulico', data.hydraulicTestExpirationDate ? formatDate(data.hydraulicTestExpirationDate) : '—'],
  ]

  return (
    <PageContent>
      <PageHeader title={`Solicitud ${data.cylinderNumber}`} subtitle={`Solicitada por ${data.requestedBy} el ${formatDate(data.requestedAt)}`} category="Auditorías de Matafuegos" backTo={ROUTES.FIRE_EXTINGUISHERS_AUDITS} backLabel="Volver a solicitudes" />
      <SectionCard title="Estado y trazabilidad" className="mb-5">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <StatusPill status={data.status} label={CREATION_REQUEST_STATUS_LABELS[data.status]} />
          <span className="text-slate-600">Período: <strong>{data.auditPeriod}</strong></span>
          {data.reviewedBy && <span className="text-slate-600">Revisó: <strong>{data.reviewedBy}</strong></span>}
        </div>
        {data.rejectionReason && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"><strong>Motivo:</strong> {data.rejectionReason}</div>}
      </SectionCard>
      <SectionCard title="Datos solicitados" className="mb-5">
        <dl className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-4">
          {fields.map(([label, value]) => <div key={label}><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-900">{value}</dd></div>)}
        </dl>
        {data.observations && <div className="mt-5 pt-4 border-t border-slate-100"><p className="text-xs font-medium text-slate-500">Observaciones</p><p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{data.observations}</p></div>}
      </SectionCard>
      {canReview && data.status === 'PENDING' && (
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setRejectOpen(true)} className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg">Rechazar</button>
          <button type="button" onClick={() => setApproveOpen(true)} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">Aprobar y crear matafuego</button>
        </div>
      )}
      <ConfirmDialog open={approveOpen} title="¿Aprobar esta solicitud?" description="Se revalidarán todos los datos y se creará el matafuego en el inventario. Esta decisión no se puede repetir." confirmLabel="Aprobar y crear" loading={review.isPending} onConfirm={() => { if (!review.isPending) review.mutate({ decision: 'APPROVE' }) }} onCancel={() => setApproveOpen(false)} />
      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">Rechazar solicitud</h2>
            <p className="mt-1 text-sm text-slate-500">El motivo quedará registrado en el historial.</p>
            <div className="mt-4"><FormField label="Motivo" required><FormTextarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} /></FormField></div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" disabled={review.isPending} onClick={() => setRejectOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">Cancelar</button>
              <button type="button" disabled={!hasRequiredRejectionReason(reason) || review.isPending} onClick={() => { if (!review.isPending) review.mutate({ decision: 'REJECT', reason: reason.trim() }) }} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg">{review.isPending ? 'Rechazando…' : 'Confirmar rechazo'}</button>
            </div>
          </div>
        </div>
      )}
    </PageContent>
  )
}
