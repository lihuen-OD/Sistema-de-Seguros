import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Landmark, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { assetKeys, assetQueries, assetsApi } from '../../../shared/api/assets.api'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { LoadingState } from '../../../shared/components/empty-states/LoadingState'
import { FormField, FormInput, FormTextarea } from '../../../shared/components/forms/FormSection'
import { Modal } from '../../../shared/components/modals/Modal'
import { daysUntil, formatDate, isExpired } from '../../../shared/utils/format'
import type { AssetPledge } from '../../../shared/types'

function PledgeStatus({ pledge }: { pledge: AssetPledge }) {
  if (pledge.status === 'CANCELLED') {
    return <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">Finalizada</span>
  }
  if (pledge.endDate && isExpired(pledge.endDate)) {
    return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">Vencimiento cumplido</span>
  }
  return <span className="inline-flex rounded-full border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700">Prendado</span>
}

function AddPledgeModal({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [creditorName, setCreditorName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const invalidDates = !!startDate && !!endDate && endDate < startDate

  async function submit() {
    if (!creditorName.trim() || !startDate || invalidDates || submitting) return
    setSubmitting(true)
    try {
      await assetsApi.createPledge(assetId, {
        creditorName: creditorName.trim(), startDate,
        endDate: endDate || undefined,
        notes: notes.trim() || undefined,
      })
      await queryClient.invalidateQueries({ queryKey: assetKeys.pledges(assetId) })
      toast.success('Prenda registrada correctamente.')
      onClose()
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} size="md" icon={Landmark} iconClassName="bg-brand-50 text-brand-600" title="Agregar prenda" description="Registrá la situación prendaria del activo." hideCloseButton={submitting} closeOnBackdropClick={!submitting} closeOnEscape={!submitting}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Entidad acreedora" required fullWidth>
          <FormInput value={creditorName} onChange={(event) => setCreditorName(event.target.value)} maxLength={200} autoFocus placeholder="Banco o entidad acreedora" />
        </FormField>
        <FormField label="Fecha de inicio" required>
          <FormInput type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </FormField>
        <FormField label="Fecha de fin">
          <FormInput type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} />
          {invalidDates && <p className="text-xs text-red-500">La fecha de fin no puede ser anterior a la fecha de inicio.</p>}
        </FormField>
        <FormField label="Observaciones" fullWidth>
          <FormTextarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={4} placeholder="Información adicional opcional" />
        </FormField>
        <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={submit} disabled={!creditorName.trim() || !startDate || invalidDates || submitting} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? 'Guardando…' : 'Registrar prenda'}</button>
        </div>
      </div>
    </Modal>
  )
}

export function AssetPledgeSection({ assetId }: { assetId: string }) {
  const queryClient = useQueryClient()
  const { data: pledges = [], isLoading, isError, refetch } = useQuery(assetQueries.pledges(assetId))
  const [adding, setAdding] = useState(false)
  const [cancelling, setCancelling] = useState<AssetPledge | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(false)
  const [submittingCancel, setSubmittingCancel] = useState(false)
  const active = pledges.find((pledge) => pledge.status === 'ACTIVE')

  async function cancelPledge() {
    if (!cancelling || submittingCancel) return
    if (!reason.trim()) {
      setReasonError(true)
      return
    }
    setSubmittingCancel(true)
    try {
      await assetsApi.cancelPledge(assetId, cancelling.id, reason.trim())
      await queryClient.invalidateQueries({ queryKey: assetKeys.pledges(assetId) })
      toast.success('La prenda fue dada de baja correctamente.')
      setCancelling(null)
      setReason('')
      setReasonError(false)
    } catch {
      // El interceptor global muestra el error de negocio.
    } finally {
      setSubmittingCancel(false)
    }
  }

  return (
    <>
      <SectionCard title="Situación prendaria" subtitle={active ? 'El activo tiene una prenda vigente' : 'Estado e historial de prendas'}>
        {isLoading ? <LoadingState rows={3} /> : isError ? (
          <ErrorState title="No se pudo cargar la situación prendaria" action={<button type="button" onClick={() => refetch()} className="text-sm font-semibold text-brand-600">Reintentar</button>} />
        ) : (
          <div className="space-y-5">
            {active ? (
              <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <PledgeStatus pledge={active} />
                    <h4 className="mt-3 break-words text-base font-semibold text-slate-900">{active.creditorName}</h4>
                    <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div><p className="text-xs text-slate-500">Fecha de inicio</p><p className="font-medium text-slate-800">{formatDate(active.startDate)}</p></div>
                      <div><p className="text-xs text-slate-500">Fecha de fin</p><p className="font-medium text-slate-800">{active.endDate ? formatDate(active.endDate) : 'Sin fecha informada'}</p></div>
                    </div>
                    {active.endDate && !isExpired(active.endDate) && <p className="mt-3 text-xs font-medium text-brand-700">{daysUntil(active.endDate)} día{daysUntil(active.endDate) !== 1 ? 's' : ''} restante{daysUntil(active.endDate) !== 1 ? 's' : ''}</p>}
                    {active.endDate && isExpired(active.endDate) && <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>La fecha de fin ya pasó. La prenda continúa activa hasta que se registre su baja manual.</span></div>}
                    {active.notes && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600">{active.notes}</p>}
                  </div>
                  <button type="button" onClick={() => setCancelling(active)} className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Dar de baja prenda</button>
                </div>
              </div>
            ) : (
              <EmptyState icon={Landmark} title="Sin prenda activa" description="Este activo no tiene una prenda vigente." action={<button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"><Plus size={15} />Agregar prenda</button>} />
            )}

            {pledges.length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-semibold text-slate-800">Historial de prendas</h4>
                <div className="space-y-3">{pledges.map((pledge) => (
                  <article key={pledge.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><p className="break-words text-sm font-semibold text-slate-800">{pledge.creditorName}</p><PledgeStatus pledge={pledge} /></div>
                    <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                      <div><p className="text-slate-400">Inicio</p><p className="mt-0.5 font-medium text-slate-700">{formatDate(pledge.startDate)}</p></div>
                      <div><p className="text-slate-400">Fin</p><p className="mt-0.5 font-medium text-slate-700">{pledge.endDate ? formatDate(pledge.endDate) : 'Sin fecha informada'}</p></div>
                      <div><p className="text-slate-400">Registrada por</p><p className="mt-0.5 break-all font-medium text-slate-700">{pledge.createdBy ?? 'Sistema'}</p></div>
                      {pledge.cancelledAt && <div><p className="text-slate-400">Fecha de baja</p><p className="mt-0.5 font-medium text-slate-700">{formatDate(pledge.cancelledAt)}</p></div>}
                      {pledge.cancelledBy && <div><p className="text-slate-400">Baja registrada por</p><p className="mt-0.5 break-all font-medium text-slate-700">{pledge.cancelledBy}</p></div>}
                      {pledge.cancellationReason && <div className="sm:col-span-2 lg:col-span-3"><p className="text-slate-400">Motivo de baja</p><p className="mt-0.5 whitespace-pre-wrap break-words font-medium text-slate-700">{pledge.cancellationReason}</p></div>}
                    </div>
                  </article>
                ))}</div>
              </div>
            )}
          </div>
        )}
      </SectionCard>
      {adding && <AddPledgeModal assetId={assetId} onClose={() => setAdding(false)} />}
      <ConfirmDialog open={!!cancelling} title="¿Dar de baja esta prenda?" description="La prenda quedará en el historial y no podrá reactivarse ni editarse." confirmLabel="Dar de baja" loading={submittingCancel} onConfirm={cancelPledge} onCancel={() => { if (!submittingCancel) { setCancelling(null); setReason(''); setReasonError(false) } }}>
        <FormField label="Motivo de baja" required>
          <FormTextarea value={reason} onChange={(event) => { setReason(event.target.value); setReasonError(false) }} maxLength={500} rows={3} placeholder="Indicá el motivo de la baja" />
          {reasonError && <p className="text-xs text-red-500">El motivo de baja es obligatorio.</p>}
        </FormField>
      </ConfirmDialog>
    </>
  )
}
