import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Info, Loader2, RefreshCw, Search } from 'lucide-react'
import { Modal } from '../../../../shared/components/modals/Modal'
import { FormField, FormTextarea } from '../../../../shared/components/forms/FormSection'
import { PolicyRemoteSelect } from '../../../../shared/components/forms/PolicyRemoteSelect'
import { LoadingState } from '../../../../shared/components/empty-states/LoadingState'
import { ErrorState } from '../../../../shared/components/empty-states/ErrorState'
import { apiErrorCode } from '../../../../shared/api/client'
import { policiesApi, policyQueries } from '../../../../shared/api/policies.api'
import { RenewalPreviewPanel } from './RenewalPreviewPanel'
import { invalidateRenewalQueries } from './invalidateRenewalQueries'

const NOTES_MAX_LENGTH = 2000

interface MarkRenewedModalProps {
  policy: { id: string; policyNumber: string }
  onClose: () => void
}

// Registra que `policy` (la anterior) fue renovada por una póliza que ya
// existe. No crea ni copia nada: solo el vínculo (POST /policies/:id/renewal).
export function MarkRenewedModal({ policy, onClose }: MarkRenewedModalProps) {
  const queryClient = useQueryClient()
  const [renewalPolicyId, setRenewalPolicyId] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  // El backend rechazó con CONCURRENT_UPDATE: la vista previa se refrescó y
  // hay que volver a confirmar sobre los datos nuevos.
  const [dataChanged, setDataChanged] = useState(false)

  const [excludeIds] = useState(() => [policy.id])
  const previewQuery = useQuery(policyQueries.renewalPreview(policy.id, renewalPolicyId))
  const preview = previewQuery.data

  // Los mensajes de error del backend (duplicada, fechas, baja manual,
  // permisos, conexión) los muestra el interceptor global (ver client.ts).
  // Acá solo se refresca todo para que la vista previa muestre el estado real.
  const mutation = useMutation({
    mutationFn: () =>
      policiesApi.createRenewal(policy.id, { renewalPolicyId, notes: notes.trim() || undefined }),
    onSuccess: (renewal) => {
      toast.success(`La póliza ${policy.policyNumber} quedó registrada como renovada por la póliza ${renewal.renewalPolicy.policyNumber}`)
      invalidateRenewalQueries(queryClient, [policy.id, renewalPolicyId])
      onClose()
    },
    onError: (err) => {
      setConfirmed(false)
      setDataChanged(apiErrorCode(err) === 'CONCURRENT_UPDATE')
      invalidateRenewalQueries(queryClient, [policy.id, renewalPolicyId])
    },
  })

  const selectRenewalPolicy = (id: string) => {
    setRenewalPolicyId(id)
    setConfirmed(false)
    setDataChanged(false)
  }

  const canSubmit = Boolean(preview?.canRenew) && confirmed && !previewQuery.isFetching && !mutation.isPending

  // Doble clic: el botón se deshabilita al re-renderizar, pero un segundo
  // click que llega antes del re-render todavía ve canSubmit = true.
  const submittingRef = useRef(false)
  const handleConfirm = () => {
    if (!canSubmit || submittingRef.current) return
    submittingRef.current = true
    mutation.mutate(undefined, { onSettled: () => { submittingRef.current = false } })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={RefreshCw}
      iconClassName="bg-brand-50 text-brand-600"
      title={`Marcar como renovada — ${policy.policyNumber}`}
      description="Vinculá esta póliza con la nueva que la reemplaza. No se copian ni se modifican activos, coberturas, fechas ni documentos."
      closeOnBackdropClick={!mutation.isPending}
      closeOnEscape={!mutation.isPending}
      hideCloseButton={mutation.isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Registrar renovación
          </button>
        </>
      }
    >
      {/* El buscador queda fuera del área con scroll: su desplegable es
          absoluto y ahí adentro quedaría recortado. */}
      <FormField
        label="Póliza nueva"
        required
        helperText="La póliza nueva se carga antes, como siempre, desde Pólizas → Nueva póliza."
      >
        <PolicyRemoteSelect
          value={renewalPolicyId}
          onChange={selectRenewalPolicy}
          excludeIds={excludeIds}
          disabled={mutation.isPending}
          placeholder="Buscá la póliza nueva…"
          emptyOptionLabel="Sin seleccionar"
        />
      </FormField>

      {/* Alto = pantalla menos encabezado, buscador y pie del modal (más
          altos en mobile, donde el texto ocupa más líneas), así el modal
          entero siempre entra. El mínimo deja lugar al desplegable. */}
      <div className="mt-5 min-h-[12rem] max-h-[calc(100dvh-28rem)] sm:max-h-[calc(100dvh-22rem)] overflow-y-auto -mx-6 px-6 space-y-5">
        {!renewalPolicyId ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            <Search size={18} className="flex-shrink-0 text-slate-300" />
            Elegí la póliza nueva para ver la comparación con {policy.policyNumber}.
          </div>
        ) : previewQuery.isLoading ? (
          <LoadingState rows={3} />
        ) : previewQuery.isError || !preview ? (
          <ErrorState
            title="No se pudo cargar la vista previa"
            description="Revisá la póliza elegida o intentá nuevamente."
            action={
              <button
                type="button"
                onClick={() => previewQuery.refetch()}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Reintentar
              </button>
            }
          />
        ) : (
          <>
            {dataChanged && (
              <div className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs text-brand-800" role="status">
                <Info size={15} className="mt-px flex-shrink-0" />
                <p>La información de las pólizas cambió mientras se registraba la renovación. Actualizamos la vista previa: revisala y volvé a confirmar.</p>
              </div>
            )}

            <div className={clsx(previewQuery.isFetching && 'opacity-60 transition-opacity')}>
              <RenewalPreviewPanel preview={preview} />
            </div>

            {preview.canRenew && (
              <>
                <FormField label="Notas (opcional)">
                  <FormTextarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={NOTES_MAX_LENGTH}
                    disabled={mutation.isPending}
                    placeholder="Ej: renovación con cambio de aseguradora, se dio de baja el camión T4…"
                    rows={2}
                  />
                </FormField>

                <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-3 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={mutation.isPending}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 accent-brand-600"
                  />
                  <span className="text-sm text-slate-700">
                    Confirmo que la póliza <strong className="font-semibold">{preview.previousPolicy.policyNumber}</strong> fue
                    renovada por la póliza <strong className="font-semibold">{preview.renewalPolicy.policyNumber}</strong>.
                  </span>
                </label>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
